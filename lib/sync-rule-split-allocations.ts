import { createServerClient } from "@/lib/supabase-server";

type SupabaseClient = ReturnType<typeof createServerClient>;

export type RuleSplitEntry = {
  transaction_id: string;
  splits: Array<{ cost_center_id: string; percentage: number; is_operational: boolean }>;
};

const CHUNK = 500;

/**
 * Syncs cc_allocation_splits for transactions just evaluated by the rule engine.
 *
 * Step 1 — Delete all assign_type="transaction" rows for allEvaluatedTxIds.
 *   This removes stale entries when a transaction transitions away from rule_split
 *   (e.g. rule changed, tx re-evaluated as single-CC rule or unassigned).
 *
 * Step 2 — Insert one row per CC for every transaction in ruleSplitEntries.
 *
 * Safe to call with empty arrays — becomes a no-op.
 */
export async function syncRuleSplitAllocations(
  supabase: SupabaseClient,
  allEvaluatedTxIds: string[],
  ruleSplitEntries: RuleSplitEntry[]
): Promise<void> {
  if (allEvaluatedTxIds.length === 0) return;

  for (let i = 0; i < allEvaluatedTxIds.length; i += CHUNK) {
    await supabase
      .from("cc_allocation_splits")
      .delete()
      .eq("assign_type", "transaction")
      .in("assign_value", allEvaluatedTxIds.slice(i, i + CHUNK));
  }

  if (ruleSplitEntries.length === 0) return;

  const rows = ruleSplitEntries.flatMap((e) =>
    e.splits.map((s) => ({
      assign_type: "transaction" as const,
      assign_value: e.transaction_id,
      cost_center_id: s.cost_center_id,
      percentage: s.percentage,
      is_operational: s.is_operational,
    }))
  );

  for (let i = 0; i < rows.length; i += CHUNK) {
    await supabase.from("cc_allocation_splits").insert(rows.slice(i, i + CHUNK));
  }
}
