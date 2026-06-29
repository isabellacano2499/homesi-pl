import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import type { ResolvedConflictGroup, MatchedRuleProposal } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = createServerClient();
  const branches = new URL(req.url).searchParams.getAll("branch");

  const [{ data: snapshots, error: snapErr }, { data: ccs, error: ccErr }] = await Promise.all([
    supabase
      .from("conflict_snapshots")
      .select("transaction_id,conflicting_cc_ids,resolved_cc_id,resolved_at")
      .eq("is_resolved", true)
      .order("resolved_at", { ascending: false }),
    supabase.from("cost_centers").select("id,name"),
  ]);

  if (snapErr) return NextResponse.json({ error: snapErr.message }, { status: 500 });
  if (ccErr) return NextResponse.json({ error: ccErr.message }, { status: 500 });
  if (!snapshots || snapshots.length === 0) return NextResponse.json([]);

  const ccMap = new Map<string, string>((ccs ?? []).map((c) => [c.id as string, c.name as string]));

  // Collect all IDs from snapshots — could be CC IDs (legacy) or rule IDs (new format)
  const allSnapshotIds = new Set<string>();
  for (const snap of snapshots) {
    for (const id of (snap.conflicting_cc_ids ?? []) as string[]) {
      allSnapshotIds.add(id);
    }
  }

  // Try to load rule data for any IDs that are rule IDs
  const ruleNameMap = new Map<string, string>();
  const ruleAllocMap = new Map<string, Array<{ cost_center_id: string; percentage: number }>>();

  if (allSnapshotIds.size > 0) {
    const ids = [...allSnapshotIds];
    const [{ data: rules }, { data: allocs }] = await Promise.all([
      supabase.from("split_rules").select("id,name").in("id", ids),
      supabase
        .from("split_rule_allocations")
        .select("split_rule_id,cost_center_id,percentage,display_order")
        .in("split_rule_id", ids)
        .order("display_order"),
    ]);
    for (const r of rules ?? []) ruleNameMap.set(r.id as string, r.name as string);
    for (const a of allocs ?? []) {
      const arr = ruleAllocMap.get(a.split_rule_id as string) ?? [];
      arr.push({ cost_center_id: a.cost_center_id as string, percentage: a.percentage as number });
      ruleAllocMap.set(a.split_rule_id as string, arr);
    }
  }

  const txIds = snapshots.map((s) => s.transaction_id as string);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let txQ: any = supabase
    .from("pl_transactions")
    .select(
      "id,gl_code,gl_name,month,year,branch,check_description,check_description_2," +
      "check_description_3,vendor,debit,credit,movement,cost_center_id,conflict_type"
    )
    .in("id", txIds);
  if (branches.length > 0) txQ = txQ.in("branch", branches);
  const { data: txs, error: txErr } = await txQ;
  if (txErr) return NextResponse.json({ error: txErr.message }, { status: 500 });

  const txMap = new Map<string, Record<string, unknown>>(
    (txs ?? []).map((t: Record<string, unknown>) => [t.id as string, t])
  );

  const groupMap = new Map<string, ResolvedConflictGroup>();

  for (const snap of snapshots) {
    const tx = txMap.get(snap.transaction_id as string);
    if (!tx) continue; // filtered out by branch

    const snapshotIds = (snap.conflicting_cc_ids ?? []) as string[];
    const isNewFormat = snapshotIds.some((id) => ruleNameMap.has(id));

    let matchedRules: MatchedRuleProposal[] = [];
    let totalPct = 0;

    if (isNewFormat) {
      matchedRules = snapshotIds.map((ruleId) => {
        const allocs = ruleAllocMap.get(ruleId) ?? [];
        const rulePct = allocs.reduce((s, a) => s + a.percentage, 0);
        return {
          rule_id: ruleId,
          rule_name: ruleNameMap.get(ruleId) ?? "(deleted rule)",
          allocations: allocs.map((a) => ({
            cost_center_id: a.cost_center_id,
            cc_name: ccMap.get(a.cost_center_id) ?? "(deleted CC)",
            percentage: a.percentage,
          })),
          rule_total_percentage: rulePct,
        };
      });
      totalPct = matchedRules.reduce((s, r) => s + r.rule_total_percentage, 0);
    }

    const key = (tx.gl_code as string | null) ?? "(No GL Code)";
    if (!groupMap.has(key)) {
      groupMap.set(key, { gl_code: key, gl_name: (tx.gl_name as string | null) ?? "", transactions: [] });
    }
    groupMap.get(key)!.transactions.push({
      id: tx.id as string,
      gl_code: tx.gl_code as string | null,
      gl_name: tx.gl_name as string | null,
      month: tx.month as string | null,
      year: tx.year as number | null,
      branch: tx.branch as string | null,
      check_description: tx.check_description as string | null,
      check_description_2: tx.check_description_2 as string | null,
      check_description_3: tx.check_description_3 as string | null,
      vendor: tx.vendor as string | null,
      debit: tx.debit as number,
      credit: tx.credit as number,
      movement: tx.movement as number | null,
      conflict_type: (tx.conflict_type as "underassigned" | "overassigned") ?? "underassigned",
      total_matched_percentage: totalPct,
      matched_rules: matchedRules,
      cost_center_id: tx.cost_center_id as string | null,
      resolved_cc: snap.resolved_cc_id
        ? { id: snap.resolved_cc_id as string, name: ccMap.get(snap.resolved_cc_id as string) ?? "(deleted Cost Center)" }
        : null,
      resolved_at: snap.resolved_at as string | null,
    });
  }

  return NextResponse.json([...groupMap.values()]);
}
