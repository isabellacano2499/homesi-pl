import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = createServerClient();
  const [{ data: cc }, { data: rules }] = await Promise.all([
    supabase.from("cost_centers").select("*").eq("id", id).single(),
    supabase.from("cost_center_rules").select("*").eq("cost_center_id", id).order("sequence"),
  ]);
  if (!cc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ...cc, rules: rules ?? [] });
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const { name, description } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("cost_centers")
    .update({ name: name.trim(), description: description?.trim() || null })
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = createServerClient();

  // Pre-flight: count records that reference this CC and can't be auto-deleted
  const [
    { count: txCount },
    { count: snapCount },
  ] = await Promise.all([
    supabase
      .from("pl_transactions")
      .select("id", { count: "exact", head: true })
      .eq("cost_center_id", id),
    supabase
      .from("conflict_snapshots")
      .select("id", { count: "exact", head: true })
      .eq("resolved_cc_id", id),
  ]);

  const blockers: string[] = [];
  if ((txCount ?? 0) > 0)
    blockers.push(`${txCount} transaction${txCount !== 1 ? "s" : ""} assigned to it`);
  if ((snapCount ?? 0) > 0)
    blockers.push(`${snapCount} resolved conflict${snapCount !== 1 ? "s" : ""} referencing it`);

  if (blockers.length > 0) {
    return NextResponse.json(
      {
        error: `Cannot delete: ${blockers.join(" and ")}. Reassign or reopen them first.`,
        tx_count: txCount ?? 0,
        snap_count: snapCount ?? 0,
      },
      { status: 409 }
    );
  }

  // Rules are owned by the CC — delete them first (cascade guard)
  await supabase.from("cost_center_rules").delete().eq("cost_center_id", id);

  const { error } = await supabase.from("cost_centers").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return new NextResponse(null, { status: 204 });
}
