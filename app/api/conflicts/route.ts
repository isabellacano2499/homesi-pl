import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import type { ConflictGroup, ConflictSplitProposal } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = createServerClient();
  const branches = new URL(req.url).searchParams.getAll("branch");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase
    .from("pl_transactions")
    .select("id,gl_code,gl_name,month,year,branch,check_description,check_description_2,check_description_3,vendor,debit,credit,movement,cost_center_conflicts")
    .eq("cost_center_status", "conflict")
    .order("gl_code", { nullsFirst: false });
  if (branches.length > 0) q = q.in("branch", branches);

  const [{ data: txs, error: txErr }, { data: ccs, error: ccErr }] = await Promise.all([
    q,
    supabase.from("cost_centers").select("id,name"),
  ]);

  if (txErr) return NextResponse.json({ error: txErr.message }, { status: 500 });
  if (ccErr) return NextResponse.json({ error: ccErr.message }, { status: 500 });

  const ccMap = new Map<string, string>((ccs ?? []).map((c) => [c.id as string, c.name as string]));

  // Collect any split rule IDs referenced in conflict arrays
  const splitRuleIds = new Set<string>();
  for (const tx of txs ?? []) {
    for (const entry of (tx.cost_center_conflicts ?? []) as string[]) {
      if (entry.startsWith("split:")) splitRuleIds.add(entry.slice(6));
    }
  }

  // Fetch split rule names + allocations if needed
  const splitRuleNameMap = new Map<string, string>();
  const splitRuleAllocMap = new Map<
    string,
    Array<{ cost_center_id: string; percentage: number }>
  >();

  if (splitRuleIds.size > 0) {
    const ids = [...splitRuleIds];
    const [{ data: srRows }, { data: allocRows }] = await Promise.all([
      supabase.from("split_rules").select("id,name").in("id", ids),
      supabase
        .from("split_rule_allocations")
        .select("split_rule_id,cost_center_id,percentage,display_order")
        .in("split_rule_id", ids)
        .order("display_order"),
    ]);
    for (const sr of srRows ?? []) {
      splitRuleNameMap.set(sr.id as string, sr.name as string);
    }
    for (const a of allocRows ?? []) {
      const arr = splitRuleAllocMap.get(a.split_rule_id as string) ?? [];
      arr.push({ cost_center_id: a.cost_center_id as string, percentage: a.percentage as number });
      splitRuleAllocMap.set(a.split_rule_id as string, arr);
    }
  }

  const groupMap = new Map<string, ConflictGroup>();

  for (const tx of txs ?? []) {
    const key = tx.gl_code ?? "(No GL Code)";
    if (!groupMap.has(key)) {
      groupMap.set(key, { gl_code: key, gl_name: tx.gl_name ?? "", transactions: [] });
    }

    const conflictIds = (tx.cost_center_conflicts ?? []) as string[];
    const isSplitConflict = conflictIds.some((id) => id.startsWith("split:"));

    let conflicting_ccs: { id: string; name: string }[] = [];
    let conflicting_split_rules: ConflictSplitProposal[] | undefined;

    if (isSplitConflict) {
      conflicting_split_rules = conflictIds
        .filter((id) => id.startsWith("split:"))
        .map((id) => {
          const srId = id.slice(6);
          return {
            split_rule_id: srId,
            split_rule_name: splitRuleNameMap.get(srId) ?? "(deleted rule)",
            allocations: (splitRuleAllocMap.get(srId) ?? []).map((a) => ({
              cost_center_id: a.cost_center_id,
              cc_name: ccMap.get(a.cost_center_id) ?? "(deleted CC)",
              percentage: a.percentage,
            })),
          };
        });
    } else {
      conflicting_ccs = conflictIds.map((id) => ({
        id,
        name: ccMap.get(id) ?? "(deleted Cost Center)",
      }));
    }

    groupMap.get(key)!.transactions.push({
      id: tx.id,
      gl_code: tx.gl_code,
      gl_name: tx.gl_name,
      month: tx.month,
      year: tx.year,
      branch: tx.branch,
      check_description: tx.check_description,
      check_description_2: tx.check_description_2,
      check_description_3: tx.check_description_3,
      vendor: tx.vendor,
      debit: tx.debit,
      credit: tx.credit,
      movement: tx.movement,
      conflicting_ccs,
      conflicting_split_rules,
    });
  }

  return NextResponse.json([...groupMap.values()]);
}
