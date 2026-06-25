/**
 * Targeted re-evaluation of rule-assigned transactions.
 *
 * Used when a Cost Center is deleted or a rule condition is modified/deleted.
 * Only touches transactions with assignment_origin = 'rule'.
 * Manual-assigned transactions are never touched here.
 */

import { evaluateCostCenterRules } from "@/lib/evaluate-cost-center-rules";
import { createServerClient } from "@/lib/supabase-server";
import type { PLTransaction, CostCenterWithRules, CostCenterRule } from "@/types";

type SupabaseClient = ReturnType<typeof createServerClient>;

export type ReevalStats = {
  reevaluated: number;
  reassigned: number;
  unassigned: number;
  conflicts: number;
};

const TX_FIELDS =
  "id,gl_code,gl_name,branch,vendor,check_description," +
  "ref_numb,category_5,category_6,doc_type,month,year,debit,credit,movement";

const UPDATE_PARALLEL = 100;

/**
 * Loads all cost centers with their rules from the database.
 * Call AFTER any mutation so the result reflects the current state.
 */
export async function loadAllCCsWithRules(supabase: SupabaseClient): Promise<CostCenterWithRules[]> {
  const [{ data: ccs }, { data: rules }] = await Promise.all([
    supabase.from("cost_centers").select("id,name,description,created_at,updated_at"),
    supabase.from("cost_center_rules").select("*").order("sequence"),
  ]);

  const rulesByCC = new Map<string, CostCenterRule[]>();
  for (const r of (rules ?? []) as CostCenterRule[]) {
    const arr = rulesByCC.get(r.cost_center_id) ?? [];
    arr.push(r);
    rulesByCC.set(r.cost_center_id, arr);
  }

  return (ccs ?? []).map((cc) => ({
    ...(cc as { id: string; name: string; description: string | null; created_at: string; updated_at: string }),
    rules: rulesByCC.get(cc.id as string) ?? [],
  }));
}

/**
 * Fetches the IDs of all rule-assigned transactions for a given Cost Center.
 * "Rule-assigned" means assignment_origin = 'rule' (excludes manual, conflict_resolved).
 */
export async function getRuleAssignedTxIds(
  supabase: SupabaseClient,
  ccId: string,
): Promise<string[]> {
  const ids: string[] = [];
  let offset = 0;

  while (true) {
    const { data } = await supabase
      .from("pl_transactions")
      .select("id")
      .eq("cost_center_id", ccId)
      .eq("assignment_origin", "rule")
      .range(offset, offset + 999);

    if (!data || data.length === 0) break;
    ids.push(...(data as { id: string }[]).map((r) => r.id));
    if (data.length < 1000) break;
    offset += 1000;
  }

  return ids;
}

/**
 * Re-evaluates a specific set of transactions against the current ruleset.
 * Updates pl_transactions and syncs conflict_snapshots.
 * Returns counts of outcomes.
 */
export async function reevaluateRuleAssigned(
  supabase: SupabaseClient,
  txIds: string[],
  costCenters: CostCenterWithRules[],
): Promise<ReevalStats> {
  if (txIds.length === 0) {
    return { reevaluated: 0, reassigned: 0, unassigned: 0, conflicts: 0 };
  }

  // Fetch full transaction data in batches of 1000
  type TxRow = { id: string } & Record<string, unknown>;
  const txs: TxRow[] = [];
  for (let i = 0; i < txIds.length; i += 1000) {
    const chunk = txIds.slice(i, i + 1000);
    const { data } = await supabase.from("pl_transactions").select(TX_FIELDS).in("id", chunk);
    if (data) txs.push(...(data as unknown as TxRow[]));
  }

  const toUpdate: {
    id: string;
    cost_center_id: string | null;
    cost_center_status: string;
    cost_center_conflicts: string[] | null;
    assignment_origin: string | null;
  }[] = [];
  const snapshotUpserts: { transaction_id: string; conflicting_cc_ids: string[] }[] = [];
  const snapshotDeletes: string[] = [];

  for (const tx of txs) {
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
    } else {
      // Clear any stale snapshot (safe no-op if none exists)
      snapshotDeletes.push(tx.id);
    }
  }

  // Batch-update transactions
  for (let i = 0; i < toUpdate.length; i += UPDATE_PARALLEL) {
    await Promise.all(
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
  }

  // Sync conflict_snapshots
  const now = new Date().toISOString();

  if (snapshotUpserts.length > 0) {
    for (let i = 0; i < snapshotUpserts.length; i += 200) {
      await supabase.from("conflict_snapshots").upsert(
        snapshotUpserts.slice(i, i + 200).map((s) => ({
          transaction_id: s.transaction_id,
          conflicting_cc_ids: s.conflicting_cc_ids,
          is_resolved: false,
          resolved_cc_id: null,
          resolved_at: null,
          updated_at: now,
        })),
        { onConflict: "transaction_id" }
      );
    }
  }

  if (snapshotDeletes.length > 0) {
    for (let i = 0; i < snapshotDeletes.length; i += 200) {
      await supabase
        .from("conflict_snapshots")
        .delete()
        .in("transaction_id", snapshotDeletes.slice(i, i + 200));
    }
  }

  return {
    reevaluated: txs.length,
    reassigned: toUpdate.filter((u) => u.cost_center_status === "assigned").length,
    unassigned: toUpdate.filter((u) => u.cost_center_status === "unassigned").length,
    conflicts: toUpdate.filter((u) => u.cost_center_status === "conflict").length,
  };
}
