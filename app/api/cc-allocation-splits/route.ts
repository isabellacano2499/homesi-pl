import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const CHUNK = 500;

/** GET — all splits (no params) or splits for one key (?type=&value=) */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type  = searchParams.get("type");
  const value = searchParams.get("value");

  const supabase = createServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase
    .from("cc_allocation_splits")
    .select("id,assign_type,assign_value,cost_center_id,percentage,is_operational,cost_centers(name)")
    .order("percentage", { ascending: false });

  if (type && value) {
    q = q.eq("assign_type", type).eq("assign_value", value);
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

/**
 * PUT — upsert the full allocation split for one (assign_type, assign_value) key.
 * Body: { assign_type, assign_value, splits: [{cost_center_id, percentage}] }
 * Also updates pl_transactions.cost_center_id to the primary CC.
 */
export async function PUT(req: NextRequest) {
  const body = await req.json() as {
    assign_type: "vendor" | "description3";
    assign_value: string;
    splits: { cost_center_id: string; percentage: number; is_operational?: boolean }[];
  };

  const { assign_type, assign_value, splits } = body;

  if (!assign_type || !assign_value || !Array.isArray(splits) || splits.length === 0) {
    return NextResponse.json({ error: "assign_type, assign_value, and splits are required" }, { status: 400 });
  }

  const total = splits.reduce((s, r) => s + r.percentage, 0);
  if (Math.abs(total - 100) > 0.01) {
    return NextResponse.json({ error: `Percentages must sum to 100 (currently ${total.toFixed(3)})` }, { status: 400 });
  }

  const supabase = createServerClient();

  // 1. Replace splits for this key (delete + re-insert)
  const { error: delErr } = await supabase
    .from("cc_allocation_splits")
    .delete()
    .eq("assign_type", assign_type)
    .eq("assign_value", assign_value);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  const { error: insErr } = await supabase.from("cc_allocation_splits").insert(
    splits.map((s) => ({
      assign_type,
      assign_value,
      cost_center_id: s.cost_center_id,
      percentage: s.percentage,
      is_operational: s.is_operational ?? true,
    }))
  );
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  // 2. Determine primary CC (highest %) and compute Operational %
  const primaryCcId = [...splits].sort((a, b) => b.percentage - a.percentage)[0].cost_center_id;
  const operationalPct = splits.reduce((s, r) => s + ((r.is_operational ?? true) ? r.percentage : 0), 0);

  // 3. Find matching transaction IDs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let txQ: any = supabase.from("pl_transactions").select("id");
  if (assign_type === "vendor") {
    txQ = txQ.eq("vendor", assign_value);
  } else {
    // description3 — only OA source
    txQ = txQ.eq("source", "offshore_allocations").eq("check_description_3", assign_value);
  }

  const { data: txRows, error: txErr } = await txQ;
  if (txErr) return NextResponse.json({ error: txErr.message }, { status: 500 });

  const txIds: string[] = (txRows ?? []).map((r: { id: string }) => r.id);

  // 4. Update pl_transactions with primary CC and operational_pct
  if (txIds.length > 0) {
    for (let i = 0; i < txIds.length; i += CHUNK) {
      const { error: updErr } = await supabase
        .from("pl_transactions")
        .update({
          cost_center_id:        primaryCcId,
          cost_center_status:    "assigned",
          cost_center_conflicts: null,
          assignment_origin:     "manual",
          operational_pct:       operationalPct,
        })
        .in("id", txIds.slice(i, i + CHUNK));
      if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ saved: splits.length, tx_updated: txIds.length });
}

/**
 * DELETE — remove all splits for one (assign_type, assign_value) key
 * and reset matching pl_transactions back to unassigned.
 * Query params: ?type=vendor|description3&value=...
 */
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const assign_type  = searchParams.get("type")  as "vendor" | "description3" | null;
  const assign_value = searchParams.get("value");

  if (!assign_type || !assign_value) {
    return NextResponse.json({ error: "type and value query params are required" }, { status: 400 });
  }

  const supabase = createServerClient();

  // 1. Delete all split rows for this key
  const { error: delErr } = await supabase
    .from("cc_allocation_splits")
    .delete()
    .eq("assign_type", assign_type)
    .eq("assign_value", assign_value);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  // 2. Find matching transactions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let txQ: any = supabase.from("pl_transactions").select("id");
  if (assign_type === "vendor") {
    txQ = txQ.eq("vendor", assign_value);
  } else {
    txQ = txQ.eq("source", "offshore_allocations").eq("check_description_3", assign_value);
  }
  const { data: txRows, error: txErr } = await txQ;
  if (txErr) return NextResponse.json({ error: txErr.message }, { status: 500 });

  const txIds: string[] = (txRows ?? []).map((r: { id: string }) => r.id);

  // 3. Reset to unassigned in chunks of 500
  if (txIds.length > 0) {
    for (let i = 0; i < txIds.length; i += CHUNK) {
      const { error: updErr } = await supabase
        .from("pl_transactions")
        .update({
          cost_center_id:        null,
          cost_center_status:    "unassigned",
          cost_center_conflicts: null,
          assignment_origin:     null,
          operational_pct:       100,
        })
        .in("id", txIds.slice(i, i + CHUNK));
      if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ deleted: true, tx_reset: txIds.length });
}
