import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gl = new URL(req.url).searchParams.get("gl") ?? "66310";
  const supabase = createServerClient();

  // 1. Transactions for this GL code
  const { data: txs, error: txErr } = await supabase
    .from("pl_transactions")
    .select("id,gl_code,check_description,cost_center_id,cost_center_status,assignment_origin,operational_pct,cost_centers(name)")
    .eq("gl_code", gl);
  if (txErr) return NextResponse.json({ error: txErr.message }, { status: 500 });

  const txIds = (txs ?? []).map((t) => (t as Record<string, unknown>).id as string);

  // 2. cc_allocation_splits for these transactions (assign_type = "transaction")
  const { data: splits, error: splitErr } = await supabase
    .from("cc_allocation_splits")
    .select("assign_type,assign_value,cost_center_id,percentage,cost_centers(name)")
    .eq("assign_type", "transaction")
    .in("assign_value", txIds.length > 0 ? txIds : ["__none__"]);
  if (splitErr) return NextResponse.json({ error: splitErr.message }, { status: 500 });

  // 3. All split rules with their conditions and allocations
  const [{ data: rules }, { data: conditions }, { data: allocations }, { data: costCenters }] = await Promise.all([
    supabase.from("split_rules").select("id,name,is_operational,updated_at"),
    supabase.from("split_rule_conditions").select("*").order("sequence"),
    supabase.from("split_rule_allocations").select("*").order("display_order"),
    supabase.from("cost_centers").select("id,name"),
  ]);

  const ccMap = new Map((costCenters ?? []).map((c) => [
    (c as Record<string,unknown>).id as string,
    (c as Record<string,unknown>).name as string,
  ]));

  const condsByRule = new Map<string, unknown[]>();
  for (const c of (conditions ?? []) as Record<string, unknown>[]) {
    const arr = condsByRule.get(c.split_rule_id as string) ?? [];
    arr.push(c);
    condsByRule.set(c.split_rule_id as string, arr);
  }

  const allocsByRule = new Map<string, unknown[]>();
  for (const a of (allocations ?? []) as Record<string, unknown>[]) {
    const arr = allocsByRule.get(a.split_rule_id as string) ?? [];
    arr.push({ ...a, cc_name: ccMap.get(a.cost_center_id as string) ?? "?" });
    allocsByRule.set(a.split_rule_id as string, arr);
  }

  const rulesWithDetails = (rules ?? []).map((r) => {
    const rr = r as Record<string, unknown>;
    return {
      id: rr.id,
      name: rr.name,
      is_operational: rr.is_operational,
      updated_at: rr.updated_at,
      conditions: condsByRule.get(rr.id as string) ?? [],
      allocations: allocsByRule.get(rr.id as string) ?? [],
    };
  });

  // Filter to rules that have any condition referencing gl_code = this GL
  // (broad: show ALL rules, let the user see which ones could match)
  const glRules = rulesWithDetails.filter((r) =>
    r.conditions.some((c) => {
      const cc = c as Record<string, unknown>;
      return cc.field === "gl_code" && cc.value === gl;
    })
  );

  return NextResponse.json({
    gl_code: gl,
    transactions: (txs ?? []).map((t) => {
      const tt = t as Record<string, unknown>;
      return {
        id: tt.id,
        check_description: tt.check_description,
        cost_center_id: tt.cost_center_id,
        cost_center_name: (tt.cost_centers as Record<string, unknown> | null)?.name ?? null,
        cost_center_status: tt.cost_center_status,
        assignment_origin: tt.assignment_origin,
        operational_pct: tt.operational_pct,
      };
    }),
    cc_allocation_splits_for_these_txs: splits ?? [],
    rules_with_gl_condition: glRules,
    all_rules_count: rulesWithDetails.length,
  });
}
