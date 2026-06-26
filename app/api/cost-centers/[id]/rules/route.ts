import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import {
  getRuleAssignedTxIds,
  loadAllCCsWithRules,
  reevaluateRuleAssigned,
} from "@/lib/reevaluate-rule-assigned";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("cost_center_rules")
    .select("*")
    .eq("cost_center_id", id)
    .order("sequence");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json();
  const { logic_connector, field, operator, value } = body;
  if (!field || !operator || value === undefined) {
    return NextResponse.json({ error: "field, operator, value are required" }, { status: 400 });
  }

  const supabase = createServerClient();

  // Get max sequence and max group_number for this CC
  const { data: existing } = await supabase
    .from("cost_center_rules")
    .select("sequence,group_number")
    .eq("cost_center_id", id)
    .order("sequence", { ascending: false });

  const nextSeq = existing && existing.length > 0 ? (existing[0].sequence as number) + 1 : 1;
  const maxGroup = existing && existing.length > 0
    ? Math.max(...(existing as { group_number: number }[]).map((r) => r.group_number))
    : 0;
  // Each new condition is its own singleton group
  const nextGroup = maxGroup + 1;

  const { data, error } = await supabase
    .from("cost_center_rules")
    .insert({
      cost_center_id: id,
      sequence: nextSeq,
      logic_connector: nextSeq === 1 ? null : (logic_connector ?? "AND"),
      field,
      operator,
      value: String(value),
      group_number: nextGroup,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await supabase
    .from("cost_centers")
    .update({ rules_last_modified_at: new Date().toISOString() })
    .eq("id", id);

  return NextResponse.json(data, { status: 201 });
}

/** PATCH { action: "group" | "ungroup", rule_ids: string[] } */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { action, rule_ids } = body as { action: string; rule_ids: string[] };

  if (!action || !Array.isArray(rule_ids) || rule_ids.length === 0) {
    return NextResponse.json({ error: "action and rule_ids are required" }, { status: 400 });
  }

  const supabase = createServerClient();

  // Load all rules for this CC to compute current max group_number
  const { data: allForCC, error: loadErr } = await supabase
    .from("cost_center_rules")
    .select("id,sequence,group_number")
    .eq("cost_center_id", id);

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });

  const allRules = (allForCC ?? []) as { id: string; sequence: number; group_number: number }[];
  const maxGroup = allRules.length > 0
    ? Math.max(...allRules.map((r) => r.group_number))
    : 0;

  if (action === "group") {
    // Merge all selected rules into a single new group
    const newGroup = maxGroup + 1;
    const { error } = await supabase
      .from("cost_center_rules")
      .update({ group_number: newGroup })
      .in("id", rule_ids)
      .eq("cost_center_id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  } else if (action === "ungroup") {
    // Give each selected rule its own unique group_number
    const toUngroup = allRules
      .filter((r) => rule_ids.includes(r.id))
      .sort((a, b) => a.sequence - b.sequence);
    let nextG = maxGroup + 1;
    for (const r of toUngroup) {
      const { error } = await supabase
        .from("cost_center_rules")
        .update({ group_number: nextG++ })
        .eq("id", r.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    }

  } else {
    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }

  await supabase
    .from("cost_centers")
    .update({ rules_last_modified_at: new Date().toISOString() })
    .eq("id", id);

  // Re-evaluate transactions assigned to this CC under the new grouping
  const ruleAssignedIds = await getRuleAssignedTxIds(supabase, id);
  const allCCs = await loadAllCCsWithRules(supabase);
  const stats = await reevaluateRuleAssigned(supabase, ruleAssignedIds, allCCs);

  return NextResponse.json(stats);
}
