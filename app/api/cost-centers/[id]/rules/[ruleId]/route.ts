import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import {
  getRuleAssignedTxIds,
  loadAllCCsWithRules,
  loadAllSplitRules,
  reevaluateRuleAssigned,
} from "@/lib/reevaluate-rule-assigned";

type Ctx = { params: Promise<{ id: string; ruleId: string }> };

async function bumpRulesModified(
  supabase: ReturnType<typeof createServerClient>,
  ccId: string,
) {
  await supabase
    .from("cost_centers")
    .update({ rules_last_modified_at: new Date().toISOString() })
    .eq("id", ccId);
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const { id, ruleId } = await params;
  const { logic_connector, field, operator, value } = await req.json();
  const supabase = createServerClient();

  // Collect affected txs BEFORE changing the rule (captures current assignments)
  const ruleAssignedIds = await getRuleAssignedTxIds(supabase, id);

  // Apply the rule update
  const { data, error } = await supabase
    .from("cost_center_rules")
    .update({ logic_connector, field, operator, value: String(value) })
    .eq("id", ruleId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await bumpRulesModified(supabase, id);

  // Re-evaluate against the updated ruleset
  const [allCCs, splitRules] = await Promise.all([loadAllCCsWithRules(supabase), loadAllSplitRules(supabase)]);
  const stats = await reevaluateRuleAssigned(supabase, ruleAssignedIds, allCCs, splitRules);

  return NextResponse.json({ rule: data, ...stats });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id, ruleId } = await params;
  const supabase = createServerClient();

  // Collect affected txs BEFORE deleting the rule
  const ruleAssignedIds = await getRuleAssignedTxIds(supabase, id);

  // Delete the rule
  const { error } = await supabase.from("cost_center_rules").delete().eq("id", ruleId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await bumpRulesModified(supabase, id);

  // Re-evaluate against the ruleset minus the deleted condition
  const [allCCs, splitRules] = await Promise.all([loadAllCCsWithRules(supabase), loadAllSplitRules(supabase)]);
  const stats = await reevaluateRuleAssigned(supabase, ruleAssignedIds, allCCs, splitRules);

  return NextResponse.json({ deleted: true, ...stats });
}

/** PATCH { direction: "up" | "down" } — swap sequence with neighbor (no re-eval needed) */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id, ruleId } = await params;
  const { direction } = (await req.json()) as { direction: "up" | "down" };
  const supabase = createServerClient();

  const { data: rules } = await supabase
    .from("cost_center_rules")
    .select("id,sequence")
    .eq("cost_center_id", id)
    .order("sequence");

  if (!rules) return NextResponse.json({ error: "Failed to load rules" }, { status: 500 });

  const idx = rules.findIndex((r) => r.id === ruleId);
  if (idx === -1) return NextResponse.json({ error: "Rule not found" }, { status: 404 });

  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= rules.length) {
    return NextResponse.json({ error: "Cannot move further in that direction" }, { status: 400 });
  }

  const cur = rules[idx];
  const nb  = rules[swapIdx];

  await Promise.all([
    supabase.from("cost_center_rules").update({ sequence: nb.sequence }).eq("id", cur.id),
    supabase.from("cost_center_rules").update({ sequence: cur.sequence }).eq("id", nb.id),
  ]);

  return NextResponse.json({ ok: true });
}
