import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { evaluateCostCenterRules } from "@/lib/evaluate-cost-center-rules";
import type { PLTransaction, CostCenterWithRules, CostCenterRule } from "@/types";

const FETCH_BATCH = 1000;
const UPDATE_PARALLEL = 100;

export async function POST() {
  const supabase = createServerClient();

  // ── 1. Load cost centers, rules, and resolved conflict snapshots ──────────

  const [
    { data: ccs, error: ccsErr },
    { data: allRules, error: rulesErr },
    { data: resolvedSnapshots, error: snapErr },
  ] = await Promise.all([
    supabase.from("cost_centers").select("id,name,rules_last_modified_at"),
    supabase.from("cost_center_rules").select("*").order("sequence"),
    supabase.from("conflict_snapshots").select("*").eq("is_resolved", true),
  ]);

  if (ccsErr) return NextResponse.json({ error: `Failed to load cost centers: ${ccsErr.message}` }, { status: 500 });
  if (rulesErr) return NextResponse.json({ error: `Failed to load rules: ${rulesErr.message}` }, { status: 500 });
  if (snapErr) console.warn("[reapply] Could not load snapshots:", snapErr.message);

  // Map: txId → resolved snapshot
  const resolvedByTx = new Map<string, { conflicting_cc_ids: string[]; resolved_at: string | null }>(
    (resolvedSnapshots ?? []).map((s) => [s.transaction_id, s])
  );

  // Map: ccId → rules_last_modified_at (as Date or null)
  const ccModifiedAt = new Map<string, Date | null>(
    (ccs ?? []).map((cc) => [cc.id, cc.rules_last_modified_at ? new Date(cc.rules_last_modified_at) : null])
  );

  const rulesByCC = new Map<string, CostCenterRule[]>();
  (allRules ?? []).forEach((r: CostCenterRule) => {
    const arr = rulesByCC.get(r.cost_center_id) ?? [];
    arr.push(r);
    rulesByCC.set(r.cost_center_id, arr);
  });

  const costCenters: CostCenterWithRules[] = (ccs ?? []).map((cc) => ({
    ...cc,
    description: null,
    created_at: "",
    updated_at: "",
    rules: rulesByCC.get(cc.id) ?? [],
  }));

  // ── 2. Paginate through all transactions ──────────────────────────────────

  let offset = 0;
  let totalProcessed = 0;
  let totalSkipped = 0;
  let totalAssigned = 0;
  let totalConflicts = 0;
  let totalUpdateErrors = 0;
  const firstUpdateError: string[] = [];

  // Collect snapshot upserts and deletes for batch processing
  const snapshotUpserts: { transaction_id: string; conflicting_cc_ids: string[] }[] = [];
  const snapshotDeletes: string[] = [];

  while (true) {
    const { data: txs, error: fetchErr } = await supabase
      .from("pl_transactions")
      .select(
        "id,gl_code,gl_name,branch,vendor,check_description," +
        "ref_numb,category_5,category_6,doc_type,month,year,debit,credit,movement"
      )
      .range(offset, offset + FETCH_BATCH - 1);

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    if (!txs || txs.length === 0) break;

    const toUpdate: { id: string; cost_center_id: string | null; cost_center_status: string; cost_center_conflicts: string[] | null }[] = [];
    const toSkip: string[] = [];

    for (const tx of txs) {
      const txId = (tx as { id: string }).id;
      const resolved = resolvedByTx.get(txId);

      if (resolved) {
        // Check if any CC in the original conflict had rules changed after resolution
        const resolvedAt = resolved.resolved_at ? new Date(resolved.resolved_at) : null;
        const anyChanged = resolvedAt
          ? resolved.conflicting_cc_ids.some((ccId) => {
              const modAt = ccModifiedAt.get(ccId);
              return modAt != null && modAt > resolvedAt;
            })
          : true; // no resolvedAt means we can't trust it → re-evaluate

        if (!anyChanged) {
          toSkip.push(txId);
          continue;
        }
      }

      const r = evaluateCostCenterRules(tx as unknown as PLTransaction, costCenters);
      toUpdate.push({
        id: txId,
        cost_center_id: r.cost_center_id,
        cost_center_status: r.cost_center_status,
        cost_center_conflicts: r.cost_center_conflicts.length > 0 ? r.cost_center_conflicts : null,
      });

      if (r.cost_center_status === "conflict") {
        snapshotUpserts.push({ transaction_id: txId, conflicting_cc_ids: r.cost_center_conflicts });
      } else {
        // If tx was previously in conflict, clear its snapshot
        if (resolvedByTx.has(txId)) snapshotDeletes.push(txId);
      }
    }

    totalSkipped += toSkip.length;
    totalAssigned += toUpdate.filter((u) => u.cost_center_status === "assigned").length;
    totalConflicts += toUpdate.filter((u) => u.cost_center_status === "conflict").length;

    // Update transactions that need it
    for (let i = 0; i < toUpdate.length; i += UPDATE_PARALLEL) {
      const results = await Promise.all(
        toUpdate.slice(i, i + UPDATE_PARALLEL).map((u) =>
          supabase
            .from("pl_transactions")
            .update({
              cost_center_id: u.cost_center_id,
              cost_center_status: u.cost_center_status,
              cost_center_conflicts: u.cost_center_conflicts,
            })
            .eq("id", u.id)
        )
      );
      for (const res of results) {
        if (res.error) {
          totalUpdateErrors++;
          if (firstUpdateError.length < 3) firstUpdateError.push(res.error.message);
        }
      }
    }

    totalProcessed += txs.length;
    if (txs.length < FETCH_BATCH) break;
    offset += FETCH_BATCH;
  }

  // ── 3. Batch-upsert conflict snapshots (pending conflicts) ────────────────

  if (snapshotUpserts.length > 0) {
    for (let i = 0; i < snapshotUpserts.length; i += 200) {
      await supabase.from("conflict_snapshots").upsert(
        snapshotUpserts.slice(i, i + 200).map((s) => ({
          transaction_id: s.transaction_id,
          conflicting_cc_ids: s.conflicting_cc_ids,
          is_resolved: false,
          resolved_cc_id: null,
          resolved_at: null,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "transaction_id" }
      );
    }
  }

  // Delete snapshots for txs that are no longer in conflict
  if (snapshotDeletes.length > 0) {
    for (let i = 0; i < snapshotDeletes.length; i += 200) {
      await supabase
        .from("conflict_snapshots")
        .delete()
        .in("transaction_id", snapshotDeletes.slice(i, i + 200));
    }
  }

  if (totalUpdateErrors > 0) {
    return NextResponse.json(
      {
        error: `${totalUpdateErrors} row update(s) failed — first error: "${firstUpdateError[0]}".`,
        processed: totalProcessed,
        skipped: totalSkipped,
        assigned: totalAssigned,
        conflicts: totalConflicts,
        unassigned: totalProcessed - totalSkipped - totalAssigned - totalConflicts,
        updateErrors: totalUpdateErrors,
      },
      { status: 500 }
    );
  }

  const totalUnassigned = totalProcessed - totalSkipped - totalAssigned - totalConflicts;
  return NextResponse.json({
    processed: totalProcessed,
    skipped: totalSkipped,
    assigned: totalAssigned,
    unassigned: totalUnassigned,
    conflicts: totalConflicts,
  });
}
