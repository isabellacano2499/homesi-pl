import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export async function GET() {
  const supabase = createServerClient();
  const [{ data: ccs }, { data: rules }] = await Promise.all([
    supabase.from("cost_centers").select("*").order("name"),
    supabase.from("cost_center_rules").select("cost_center_id"),
  ]);

  const countByCC = new Map<string, number>();
  (rules ?? []).forEach((r) =>
    countByCC.set(r.cost_center_id, (countByCC.get(r.cost_center_id) ?? 0) + 1)
  );

  return NextResponse.json(
    (ccs ?? []).map((cc) => ({ ...cc, rule_count: countByCC.get(cc.id) ?? 0 }))
  );
}

export async function POST(req: NextRequest) {
  const { name, description } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("cost_centers")
    .insert({ name: name.trim(), description: description?.trim() || null })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
