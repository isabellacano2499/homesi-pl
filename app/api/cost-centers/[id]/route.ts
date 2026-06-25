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

  // ── Pre-flight: block only on records that can't be auto-handled ──────────

  const [
    { count: manualCount },
    { count: snapCount },
  ] = await Promise.all([
    // Manual-assigned: user chose these explicitly, must reassign manually
    supabase
      .from("pl_transactions")
      .select("id", { count: "exact", head: true })
      .eq("cost_center_id", id)
      .eq("assignment_origin", "manual"),
    // Resolved conflicts pointing to this CC: user chose these explicitly
    supabase
      .from("conflict_snapshots")
      .select("id", { count: "exact", head: true })
      .eq("resolved_cc_id", id),
  ]);

  const blockers: string[] = [];
  if ((manualCount ?? 0) > 0)
    blockers.push(
      `${manualCount} manually assigned transaction${manualCount !== 1 ? "s" : ""} — reassign them first`
    );
  if ((snapCount ?? 0) > 0)
    blockers.push(
      `${snapCount} resolved conflict${snapCount !== 1 ? "s" : ""} referencing it — reopen them first`
    );

  if (blockers.length > 0) {
    return NextResponse.json(
      {
        error: `Cannot delete: ${blockers.join("; ")}.`,
        manual_count: manualCount ?? 0,
        snap_count: snapCount ?? 0,
      },
      { status: 409 }
    );
  }

  // ── Collect rule-assigned tx IDs before deletion ──────────────────────────

  const ruleAssignedIds = await getRuleAssignedTxIds(supabase, id);

  // ── Delete the CC and its rules ───────────────────────────────────────────

  await supabase.from("cost_center_rules").delete().eq("cost_center_id", id);
  const { error } = await supabase.from("cost_centers").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // ── Re-evaluate affected transactions against remaining rules ─────────────

  const remaining = await loadAllCCsWithRules(supabase); // deleted CC is gone
  const stats = await reevaluateRuleAssigned(supabase, ruleAssignedIds, remaining);

  return NextResponse.json({ deleted: true, ...stats });
}
