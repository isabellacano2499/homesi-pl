import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import {
  loadAllCCsWithRules,
  loadAllSplitRules,
  reevaluateRuleAssigned,
} from "@/lib/reevaluate-rule-assigned";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = createServerClient();
  const rules = await loadAllSplitRules(supabase);
  const rule = rules.find((r) => r.id === id);
  if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(rule);
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = createServerClient();

  const body = await req.json().catch(() => ({}));
  const allowed: Record<string, string | null> = {};
  if (typeof body.name === "string") allowed.name = body.name.trim() || null;
  if ("description" in body) {
    allowed.description =
      typeof body.description === "string" ? body.description.trim() || null : null;
  }

  if ("name" in allowed && !allowed.name) {
    return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
  }
  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const { error } = await supabase
    .from("split_rules")
    .update({ ...allowed, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rules = await loadAllSplitRules(supabase);
  return NextResponse.json(rules.find((r) => r.id === id) ?? null);
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = createServerClient();

  const { error } = await supabase.from("split_rules").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Re-evaluate all previously rule_split-assigned transactions against the
  // remaining rules (some may match other split rules, others become unassigned)
  const [costCenters, splitRules] = await Promise.all([
    loadAllCCsWithRules(supabase),
    loadAllSplitRules(supabase),
  ]);

  const txIds: string[] = [];
  let offset = 0;
  while (true) {
    const { data } = await supabase
      .from("pl_transactions")
      .select("id")
      .eq("assignment_origin", "rule_split")
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    txIds.push(...(data as { id: string }[]).map((r) => r.id));
    if (data.length < 1000) break;
    offset += 1000;
  }

  if (txIds.length > 0) {
    await reevaluateRuleAssigned(supabase, txIds, costCenters, splitRules);
  }

  return NextResponse.json({ ok: true, reevaluated: txIds.length });
}
