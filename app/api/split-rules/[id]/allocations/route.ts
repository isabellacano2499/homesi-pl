import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

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
  return NextResponse.json(data);
}
