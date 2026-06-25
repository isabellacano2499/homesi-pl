import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { evaluateCostCenterRules } from "@/lib/evaluate-cost-center-rules";
import type { PLTransaction, CostCenterWithRules, CostCenterRule } from "@/types";

const FETCH_BATCH = 1000;
const UPDATE_PARALLEL = 100;

export async function POST() {
  const supabase = createServerClient();

  // ── 1. Load cost centers and rules ────────────────────────────────────────

  const [{ data: ccs, error: ccsErr }, { data: allRules, error: rulesErr }] =
    await Promise.all([
      supabase.from("cost_centers").select("*"),
      supabase.from("cost_center_rules").select("*").order("sequence"),
    ]);

  if (ccsErr) {
    console.error("[reapply] Failed to load cost centers:", ccsErr.message);
    return NextResponse.json(
      { error: `Failed to load cost centers: ${ccsErr.message}` },
      { status: 500 }
    );
  }
  if (rulesErr) {
    console.error("[reapply] Failed to load rules:", rulesErr.message);
    return NextResponse.json(
      { error: `Failed to load rules: ${rulesErr.message}` },
      { status: 500 }
    );
  }

  const rulesByCC = new Map<string, CostCenterRule[]>();
  (allRules ?? []).forEach((r: CostCenterRule) => {
    const arr = rulesByCC.get(r.cost_center_id) ?? [];
    arr.push(r);
    rulesByCC.set(r.cost_center_id, arr);
  });

  const costCenters: CostCenterWithRules[] = (ccs ?? []).map((cc) => ({
    ...cc,
    rules: rulesByCC.get(cc.id) ?? [],
  }));

  console.log(
    `[reapply] ${costCenters.length} cost center(s), ${(allRules ?? []).length} total rule(s)`
  );
  costCenters.forEach((cc) => {
    console.log(`[reapply]   "${cc.name}": ${cc.rules.length} rule(s)`);
    cc.rules.forEach((r) =>
      console.log(
        `[reapply]     #${r.sequence} ${r.logic_connector ?? "FIRST"} | field="${r.field}" ${r.operator} "${r.value}"`
      )
    );
  });

  // ── 2. Paginate through every transaction, evaluate, update ───────────────

  let offset = 0;
  let totalProcessed = 0;
  let totalAssigned = 0;
  let totalConflicts = 0;
  let totalUpdateErrors = 0;
  const firstUpdateError: string[] = [];

  while (true) {
    const { data: txs, error: fetchErr } = await supabase
      .from("pl_transactions")
      .select(
        "id,gl_code,gl_name,branch,vendor,check_description," +
        "ref_numb,category_5,category_6,doc_type,month,year,debit,credit,movement"
      )
      .range(offset, offset + FETCH_BATCH - 1);

    if (fetchErr) {
      console.error("[reapply] Fetch error:", fetchErr.message);
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }
    if (!txs || txs.length === 0) break;

    // Log a sample of the first batch so we can see what fields look like
    if (offset === 0) {
      console.log("[reapply] Sample transaction:", JSON.stringify(txs[0]));
    }

    // Evaluate each transaction against all cost centers
    const updates = txs.map((tx) => {
      const r = evaluateCostCenterRules(tx as unknown as PLTransaction, costCenters);
      return {
        id: (tx as unknown as { id: string }).id,
        cost_center_id: r.cost_center_id,
        cost_center_status: r.cost_center_status,
        cost_center_conflicts:
          r.cost_center_conflicts.length > 0 ? r.cost_center_conflicts : null,
      };
    });

    const batchAssigned = updates.filter((u) => u.cost_center_status === "assigned").length;
    const batchConflicts = updates.filter((u) => u.cost_center_status === "conflict").length;
    console.log(
      `[reapply] offset=${offset} | ${txs.length} txns | ` +
      `${batchAssigned} assigned, ${batchConflicts} conflict, ` +
      `${txs.length - batchAssigned - batchConflicts} unassigned`
    );

    totalAssigned += batchAssigned;
    totalConflicts += batchConflicts;

    // Update in parallel chunks — check every error explicitly
    for (let i = 0; i < updates.length; i += UPDATE_PARALLEL) {
      const results = await Promise.all(
        updates.slice(i, i + UPDATE_PARALLEL).map((u) =>
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
          const msg = res.error.message;
          if (firstUpdateError.length < 3) firstUpdateError.push(msg);
          if (totalUpdateErrors === 1) {
            console.error("[reapply] First UPDATE error:", msg);
          }
        }
      }
    }

    totalProcessed += txs.length;
    if (txs.length < FETCH_BATCH) break;
    offset += FETCH_BATCH;
  }

  const totalUnassigned = totalProcessed - totalAssigned - totalConflicts;
  console.log(
    `[reapply] Done: ${totalProcessed} processed | ` +
    `${totalAssigned} assigned, ${totalUnassigned} unassigned, ` +
    `${totalConflicts} conflicts | ${totalUpdateErrors} update error(s)`
  );

  if (totalUpdateErrors > 0) {
    return NextResponse.json(
      {
        error:
          `${totalUpdateErrors} row update(s) failed — first error: "${firstUpdateError[0]}". ` +
          `Check server console for details. ` +
          `Make sure the SQL migration (ALTER TABLE pl_transactions ADD COLUMN cost_center_id...) has been run.`,
        processed: totalProcessed,
        assigned: totalAssigned,
        unassigned: totalUnassigned,
        conflicts: totalConflicts,
        updateErrors: totalUpdateErrors,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    processed: totalProcessed,
    assigned: totalAssigned,
    unassigned: totalUnassigned,
    conflicts: totalConflicts,
  });
}
