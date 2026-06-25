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

  // ── Pre-flight: classify ALL transactions pointing to this CC ─────────────
  // Three parallel counts to characterize what we're dealing with.

  const [
    { count: manualCount },
    { count: snapCount },
    { count: nullOriginCount },
  ] = await Promise.all([
    // (1) Manual: user chose these explicitly — must block
    supabase
      .from("pl_transactions")
      .select("id", { count: "exact", head: true })
      .eq("cost_center_id", id)
      .eq("assignment_origin", "manual"),

    // (2) Resolved conflicts snapshot: user resolved explicitly — must block
    supabase
      .from("conflict_snapshots")
      .select("id", { count: "exact", head: true })
      .eq("resolved_cc_id", id),

    // (3) NULL-origin: legacy rows assigned before the column existed — will re-evaluate
    supabase
      .from("pl_transactions")
      .select("id", { count: "exact", head: true })
      .eq("cost_center_id", id)
      .is("assignment_origin", null),
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
        null_origin_count: nullOriginCount ?? 0,
      },
      { status: 409 }
    );
  }

  // ── Collect all re-evaluable tx IDs before deletion ───────────────────────
  // This now includes: 'rule', NULL (legacy), 'conflict_resolved' edge-cases, etc.
  // Anything that isn't explicitly 'manual'.

  const idsToReeval = await getRuleAssignedTxIds(supabase, id);

  // ── Delete rules then the CC ──────────────────────────────────────────────

  await supabase.from("cost_center_rules").delete().eq("cost_center_id", id);

  const { error } = await supabase.from("cost_centers").delete().eq("id", id);

  if (error) {
    // Safety net: catch FK violation in case any transactions slipped through
    // the pre-flight (e.g. a race condition or a data inconsistency in the DB).
    const isForeignKey =
      (error as { code?: string }).code === "23503" ||
      error.message.toLowerCase().includes("foreign key") ||
      error.message.toLowerCase().includes("fkey");

    if (isForeignKey) {
      return NextResponse.json(
        {
          error:
            "Cannot delete: some transactions still reference this Cost Center " +
            "despite the pre-flight check. This usually means there are transactions " +
            "with an unexpected status in the database. Please open a Supabase SQL " +
            "editor and run: SELECT assignment_origin, COUNT(*) FROM pl_transactions " +
            `WHERE cost_center_id = '${id}' GROUP BY assignment_origin`,
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // ── Re-evaluate against remaining rules ───────────────────────────────────

  const remaining = await loadAllCCsWithRules(supabase);
  const stats = await reevaluateRuleAssigned(supabase, idsToReeval, remaining);

  return NextResponse.json({
    deleted: true,
    null_origin_count: nullOriginCount ?? 0, // how many were legacy/unknown-origin
    ...stats,
  });
}
