import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/cost-centers/[id]/rules
// Returns all split rules that have at least one allocation pointing to this cost center.
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = createServerClient();

  // Find rule IDs that allocate to this CC
  const { data: allocRows, error: allocErr } = await supabase
    .from("split_rule_allocations")
    .select("split_rule_id,percentage,display_order")
    .eq("cost_center_id", id)
    .order("display_order");

  if (allocErr) return NextResponse.json({ error: allocErr.message }, { status: 500 });

  const ruleIds = [...new Set((allocRows ?? []).map((a) => a.split_rule_id as string))];
  if (ruleIds.length === 0) return NextResponse.json([]);

  const [{ data: rules, error: ruleErr }, { data: allConditions, error: condErr }, { data: allAllocs, error: allocErr2 }] = await Promise.all([
    supabase.from("split_rules").select("id,name,description,created_at,updated_at").in("id", ruleIds),
    supabase.from("split_rule_conditions").select("*").in("split_rule_id", ruleIds).order("sequence"),
    supabase.from("split_rule_allocations").select("*").in("split_rule_id", ruleIds).order("display_order"),
  ]);

  if (ruleErr) return NextResponse.json({ error: ruleErr.message }, { status: 500 });
  if (condErr) return NextResponse.json({ error: condErr.message }, { status: 500 });
  if (allocErr2) return NextResponse.json({ error: allocErr2.message }, { status: 500 });

  const condsByRule = new Map<string, unknown[]>();
  for (const c of allConditions ?? []) {
    const arr = condsByRule.get(c.split_rule_id as string) ?? [];
    arr.push(c);
    condsByRule.set(c.split_rule_id as string, arr);
  }
  const allocsByRule = new Map<string, unknown[]>();
  for (const a of allAllocs ?? []) {
    const arr = allocsByRule.get(a.split_rule_id as string) ?? [];
    arr.push(a);
    allocsByRule.set(a.split_rule_id as string, arr);
  }

  const result = (rules ?? []).map((r) => ({
    ...r,
    conditions: condsByRule.get(r.id as string) ?? [],
    allocations: allocsByRule.get(r.id as string) ?? [],
  }));

  return NextResponse.json(result);
}

export async function POST() {
  return NextResponse.json({ error: "CC-level rules are deprecated. Manage rules at /split-rules." }, { status: 410 });
}

export async function PATCH() {
  return NextResponse.json({ error: "CC-level rules are deprecated. Manage rules at /split-rules." }, { status: 410 });
}
