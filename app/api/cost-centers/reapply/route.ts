import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { evaluateCostCenterRules } from "@/lib/evaluate-cost-center-rules";
import type { PLTransaction, CostCenterWithRules, CostCenterRule } from "@/types";

type TxRow = {
  id: string;
  gl_code: string | null;
  gl_name: string | null;
  branch: string | null;
  vendor: string | null;
  check_description: string | null;
  ref_numb: string | null;
  category_5: string | null;
  category_6: string | null;
  doc_type: string | null;
  month: string | null;
  year: number | null;
  debit: number;
  credit: number;
  movement: number | null;
  assignment_origin: string | null;
};

const FETCH_BATCH = 1000;
const UPDATE_PARALLEL = 100;

export async function POST() {
  const supabase = createServerClient();

  // ── 1. Load cost centers, rules, resolved snapshots ───────────────────────

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

  const resolvedByTx = new Map<string, { conflicting_cc_ids: string[]; resolved_at: string | null }>(
    (resolvedSnapshots ?? []).map((s) => [s.transaction_id, s])
  );

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

  // ── 2. Paginate and evaluate ──────────────────────────────────────────────

  let offset = 0;
  let totalProcessed = 0;
  let totalSkipped = 0;
  let totalAssigned = 0;
  let totalConflicts = 0;
  let totalUpdateErrors = 0;
  const firstUpdateError: string[] = [];
  const snapshotUpserts: { transaction_id: string; conflicting_cc_ids: string[] }[] = [];
  const snapshotDeletes: string[] = [];

  while (true) {
    const { data, error: fetchErr } = await supabase
      .from("pl_transactions")
      .select(
        "id,gl_code,gl_name,branch,vendor,check_description," +
        "ref_numb,category_5,category_6,doc_type,month,year,debit,credit,movement,assignment_origin"
      )
      .range(offset, offset + FETCH_BATCH - 1);

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    if (!data || data.length === 0) break;

    const rows = data as unknown as TxRow[];

    const toUpdate: {
      id: string;
      cost_center_id: string | null;
      cost_center_status: string;
      cost_center_conflicts: string[] | null;
      assignment_origin: string | null;
    }[] = [];

    for (const tx of rows) {
      // Manual assignments are permanent — never re-evaluate
      if (tx.assignment_origin === "manual") {
        totalSkipped++;
        continue;
      }

      // Resolved conflicts: skip if no CC rules changed since resolution
      const resolved = resolvedByTx.get(tx.id);
      if (resolved && tx.assignment_origin === "conflict_resolved") {
        const resolvedAt = resolved.resolved_at ? new Date(resolved.resolved_at) : null;
        const anyChanged = resolvedAt
          ? resolved.conflicting_cc_ids.some((ccId) => {
              const modAt = ccModifiedAt.get(ccId);
              return modAt != null && modAt > resolvedAt;
            })
          : true;

        if (!anyChanged) {
          totalSkipped++;
          continue;
        }
      }

      const r = evaluateCostCenterRules(tx as unknown as PLTransaction, costCenters);
      toUpdate.push({
        id: tx.id,
        cost_center_id: r.cost_center_id,
        cost_center_status: r.cost_center_status,
        cost_center_conflicts: r.cost_center_conflicts.length > 0 ? r.cost_center_conflicts : null,
        assignment_origin: r.cost_center_status === "assigned" ? "rule" : null,
      });

      if (r.cost_center_status === "conflict") {
        snapshotUpserts.push({ transaction_id: tx.id, conflicting_cc_ids: r.cost_center_conflicts });
      } else if (resolved) {
        snapshotDeletes.push(tx.id);
      }
    }

    totalAssigned += toUpdate.filter((u) => u.cost_center_status === "assigned").length;
    totalConflicts += toUpdate.filter((u) => u.cost_center_status === "conflict").length;

    for (let i = 0; i < toUpdate.length; i += UPDATE_PARALLEL) {
      const results = await Promise.all(
        toUpdate.slice(i, i + UPDATE_PARALLEL).map((u) =>
          supabase
            .from("pl_transactions")
            .update({
              cost_center_id: u.cost_center_id,
              cost_center_status: u.cost_center_status,
              cost_center_conflicts: u.cost_center_conflicts,
              assignment_origin: u.assignment_origin,
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

    totalProcessed += rows.length;
    if (rows.length < FETCH_BATCH) break;
    offset += FETCH_BATCH;
  }

  // ── 3. Sync conflict snapshots ─────────────────────────────────────────────

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

  if (snapshotDeletes.length > 0) {
    for (let i = 0; i < snapshotDeletes.length; i += 200) {
      await supabase.from("conflict_snapshots").delete().in("transaction_id", snapshotDeletes.slice(i, i + 200));
    }
  }

  if (totalUpdateErrors > 0) {
    return NextResponse.json(
      {
        error: `${totalUpdateErrors} row update(s) failed — first error: "${firstUpdateError[0]}".`,
        processed: totalProcessed, skipped: totalSkipped,
        assigned: totalAssigned, conflicts: totalConflicts,
        unassigned: totalProcessed - totalSkipped - totalAssigned - totalConflicts,
        updateErrors: totalUpdateErrors,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    processed: totalProcessed,
    skipped: totalSkipped,
    assigned: totalAssigned,
    unassigned: totalProcessed - totalSkipped - totalAssigned - totalConflicts,
    conflicts: totalConflicts,
  });
}
