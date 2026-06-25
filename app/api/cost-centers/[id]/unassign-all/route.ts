import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

type Ctx = { params: Promise<{ id: string }> };

/** Returns the number of transactions currently assigned to this cost center. */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = createServerClient();
  const { count } = await supabase
    .from("pl_transactions")
    .select("id", { count: "exact", head: true })
    .eq("cost_center_id", id);
  return NextResponse.json({ count: count ?? 0 });
}

/**
 * Resets ALL transactions assigned to this cost center to their original
 * never-evaluated state:
 *   cost_center_id       → null
 *   assignment_origin    → null
 *   cost_center_status   → "unassigned"
 *   cost_center_conflicts → null
 *
 * Also deletes any conflict_snapshots that belong to those transactions,
 * preventing ghost conflicts from accumulating.
 *
 * This is intentionally a hard reset with no re-evaluation — use it when
 * you need to fully detach a cost center from its transactions before
 * deleting it, or to manually reset assignment state.
 */
export async function POST(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = createServerClient();

  // ── Step 1: Collect all tx IDs that will be affected ─────────────────────
  // We need the IDs before the UPDATE so we can clean up conflict_snapshots.
  const txIds: string[] = [];
  let offset = 0;
  while (true) {
    const { data } = await supabase
      .from("pl_transactions")
      .select("id")
      .eq("cost_center_id", id)
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    txIds.push(...(data as { id: string }[]).map((r) => r.id));
    if (data.length < 1000) break;
    offset += 1000;
  }

  if (txIds.length === 0) {
    return NextResponse.json({ unassigned: 0 });
  }

  // ── Step 2: Reset all transactions in one UPDATE ──────────────────────────
  const { error: updateErr } = await supabase
    .from("pl_transactions")
    .update({
      cost_center_id: null,
      assignment_origin: null,
      cost_center_status: "unassigned",
      cost_center_conflicts: null,
    })
    .eq("cost_center_id", id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // ── Step 3: Delete conflict_snapshots for those transactions ──────────────
  for (let i = 0; i < txIds.length; i += 500) {
    await supabase
      .from("conflict_snapshots")
      .delete()
      .in("transaction_id", txIds.slice(i, i + 500));
  }

  return NextResponse.json({ unassigned: txIds.length });
}
