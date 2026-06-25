import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

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

  // Assign next sequence (max + 1)
  const { data: existing } = await supabase
    .from("cost_center_rules")
    .select("sequence")
    .eq("cost_center_id", id)
    .order("sequence", { ascending: false })
    .limit(1);
  const nextSeq = existing && existing.length > 0 ? existing[0].sequence + 1 : 1;

  const { data, error } = await supabase
    .from("cost_center_rules")
    .insert({
      cost_center_id: id,
      sequence: nextSeq,
      logic_connector: nextSeq === 1 ? null : (logic_connector ?? "AND"),
      field,
      operator,
      value: String(value),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Bump rules_last_modified_at on the cost center
  await supabase
    .from("cost_centers")
    .update({ rules_last_modified_at: new Date().toISOString() })
    .eq("id", id);

  return NextResponse.json(data, { status: 201 });
}
