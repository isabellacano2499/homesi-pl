import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id: split_rule_id } = await params;
  const supabase = createServerClient();

  const body = await req.json().catch(() => ({}));
  const { sequence, logic_connector, field, operator, value, opens_group, closes_group } = body;

  if (!field || !operator || value === undefined) {
    return NextResponse.json({ error: "field, operator, and value are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("split_rule_conditions")
    .insert({
      split_rule_id,
      sequence: Number(sequence) || 1,
      logic_connector: logic_connector ?? null,
      field,
      operator,
      value: String(value),
      opens_group: !!opens_group,
      closes_group: !!closes_group,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// PUT — replace all conditions for this rule
export async function PUT(req: NextRequest, { params }: Ctx) {
  const { id: split_rule_id } = await params;
  const supabase = createServerClient();

  const body = await req.json().catch(() => ({}));
  const conditions: Array<{
    sequence: number;
    logic_connector: "AND" | "OR" | null;
    field: string;
    operator: string;
    value: string;
    opens_group?: boolean;
    closes_group?: boolean;
  }> = Array.isArray(body) ? body : body.conditions;

  if (!Array.isArray(conditions)) {
    return NextResponse.json({ error: "conditions must be an array" }, { status: 400 });
  }

  const { error: delErr } = await supabase
    .from("split_rule_conditions")
    .delete()
    .eq("split_rule_id", split_rule_id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  if (conditions.length === 0) return NextResponse.json([]);

  const { data, error: insErr } = await supabase
    .from("split_rule_conditions")
    .insert(conditions.map((c) => ({ ...c, split_rule_id })))
    .select();

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  return NextResponse.json(data);
}
