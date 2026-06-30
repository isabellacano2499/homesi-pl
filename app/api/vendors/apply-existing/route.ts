import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const CHUNK = 500;

type SplitRow = {
  assign_value: string;
  cost_center_id: string;
  percentage: number;
  is_operational: boolean;
};

/** Builds a map of assign_value → splits[] from cc_allocation_splits for vendor type. */
async function loadVendorSplits(supabase: ReturnType<typeof createServerClient>) {
  const { data, error } = await supabase
    .from("cc_allocation_splits")
    .select("assign_value,cost_center_id,percentage,is_operational")
    .eq("assign_type", "vendor");

  if (error) throw new Error(error.message);
  const splits = (data ?? []) as SplitRow[];

  const byKey = new Map<string, SplitRow[]>();
  for (const s of splits) {
    if (!byKey.has(s.assign_value)) byKey.set(s.assign_value, []);
    byKey.get(s.assign_value)!.push(s);
  }
  return byKey;
}

// GET — count of unassigned transactions that have a matching vendor assignment
export async function GET() {
  const supabase = createServerClient();

  let byKey: Map<string, SplitRow[]>;
  try { byKey = await loadVendorSplits(supabase); } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }

  if (byKey.size === 0) return NextResponse.json({ count: 0, breakdown: [] });

  const assignValues = [...byKey.keys()];

  const txRows: { vendor: string | null }[] = [];
  for (let i = 0; i < assignValues.length; i += CHUNK) {
    const chunk = assignValues.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("pl_transactions")
      .select("vendor")
      .in("vendor", chunk)
      .or("cost_center_status.eq.unassigned,cost_center_status.is.null");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    txRows.push(...((data ?? []) as { vendor: string | null }[]));
  }

  const breakdown: { key: string; count: number }[] = [];
  const countMap = new Map<string, number>();
  for (const row of txRows) {
    const k = row.vendor ?? "";
    countMap.set(k, (countMap.get(k) ?? 0) + 1);
  }
  for (const [key, count] of countMap) {
    breakdown.push({ key, count });
  }

  return NextResponse.json({ count: txRows.length, breakdown });
}

// POST — apply existing vendor assignments to all matching unassigned transactions
export async function POST() {
  const supabase = createServerClient();

  let byKey: Map<string, SplitRow[]>;
  try { byKey = await loadVendorSplits(supabase); } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }

  if (byKey.size === 0) return NextResponse.json({ assigned: 0, breakdown: [] });

  const breakdown: { key: string; count: number }[] = [];
  let totalAssigned = 0;

  for (const [vendor, keySplits] of byKey) {
    const primaryCcId = [...keySplits].sort((a, b) => b.percentage - a.percentage)[0].cost_center_id;
    const operationalPct = keySplits.reduce((sum, s) => sum + (s.is_operational ? s.percentage : 0), 0);

    const txIds: string[] = [];
    let offset = 0;
    while (true) {
      const { data, error } = await supabase
        .from("pl_transactions")
        .select("id")
        .eq("vendor", vendor)
        .or("cost_center_status.eq.unassigned,cost_center_status.is.null")
        .range(offset, offset + 999);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (!data || data.length === 0) break;
      txIds.push(...data.map((r: { id: string }) => r.id));
      if (data.length < 1000) break;
      offset += 1000;
    }

    if (txIds.length === 0) continue;

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

    breakdown.push({ key: vendor, count: txIds.length });
    totalAssigned += txIds.length;
  }

  return NextResponse.json({ assigned: totalAssigned, breakdown });
}
