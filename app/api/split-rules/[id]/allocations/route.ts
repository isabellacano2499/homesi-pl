import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { loadAllSplitRules, reevaluateRuleAssigned } from "@/lib/reevaluate-rule-assigned";

type Ctx = { params: Promise<{ id: string }> };

// PUT /api/split-rules/[id]/allocations — replaces all allocations for a rule
export async function PUT(req: NextRequest, { params }: Ctx) {
  const { id: split_rule_id } = await params;
  const supabase = createServerClient();

  const body = await req.json().catch(() => ({}));
  const allocations: Array<{ cost_center_id: string; percentage: number; display_order?: number }> =
    Array.isArray(body) ? body : body.allocations;

  if (!Array.isArray(allocations) || allocations.length < 1) {
    return NextResponse.json({ error: "At least one allocation is required" }, { status: 400 });
  }
  const total = allocations.reduce((s, a) => s + Number(a.percentage), 0);
  if (Math.abs(total - 100) > 0.01) {
    return NextResponse.json({ error: `Allocations must sum to 100% (got ${total})` }, { status: 400 });
  }

  const { error: delErr } = await supabase
    .from("split_rule_allocations")
    .delete()
    .eq("split_rule_id", split_rule_id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  const { data, error: insErr } = await supabase
    .from("split_rule_allocations")
    .insert(
      allocations.map((a, idx) => ({
        split_rule_id,
        cost_center_id: a.cost_center_id,
        percentage: a.percentage,
        display_order: a.display_order ?? idx,
      }))
    )
    .select();

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  // Touch parent rule's updated_at so the reapply protection detects this change
  await supabase
    .from("split_rules")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", split_rule_id);

  // Re-evaluate all rule-assigned transactions so cc_allocation_splits reflects the
  // new allocation immediately — without this, stale split rows (from the previous
  // multi-CC allocation) would remain and fanOutBySplits would still fan to old CCs.
  const [splitRules, settingsResult] = await Promise.all([
    loadAllSplitRules(supabase),
    supabase.from("app_settings").select("active_branches").limit(1).single(),
  ]);
  const activeBranches: string[] = Array.isArray(settingsResult.data?.active_branches)
    ? settingsResult.data.active_branches
    : [];

  const txIds: string[] = [];
  let offset = 0;
  while (true) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = supabase
      .from("pl_transactions")
      .select("id")
      .in("assignment_origin", ["rule", "rule_split"])
      .range(offset, offset + 999);
    if (activeBranches.length > 0) q = q.in("branch", activeBranches);
    const { data: txData } = await q;
    if (!txData || txData.length === 0) break;
    txIds.push(...(txData as { id: string }[]).map((r) => r.id));
    if (txData.length < 1000) break;
    offset += 1000;
  }

  if (txIds.length > 0) {
    await reevaluateRuleAssigned(supabase, txIds, splitRules);
  }

  return NextResponse.json(data);
}
