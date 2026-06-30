import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// Returns which tab would show this row, or null if it's an orphan
function whichTab(status: string | null, origin: string | null): string | null {
  if (status === "unassigned" || status === null) return "Unassigned";
  if (status === "assigned" && (origin === "rule" || origin === "rule_split" || origin === null)) return "Assigned by Rule";
  if (status === "assigned" && origin === "manual") return "Manual Assigned";
  if (status === "assigned" && origin === "conflict_resolved") return "Conflict Resolved (via snapshots)";
  if (status === "conflict") return "Conflict";
  return null;
}

export async function GET() {
  const supabase = createServerClient();

  const allRows: Array<{
    id: string;
    gl_code: string | null;
    check_description: string | null;
    cost_center_id: string | null;
    cost_center_status: string | null;
    assignment_origin: string | null;
    cost_center_conflicts: unknown;
  }> = [];

  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("pl_transactions")
      .select("id,gl_code,check_description,cost_center_id,cost_center_status,assignment_origin,cost_center_conflicts")
      .range(offset, offset + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data || data.length === 0) break;
    allRows.push(...(data as typeof allRows));
    if (data.length < 1000) break;
    offset += 1000;
  }

  // Build distribution: for each (tab/ORPHAN, status, origin) combination → count
  const distMap = new Map<string, number>();
  for (const r of allRows) {
    const tab = whichTab(r.cost_center_status, r.assignment_origin) ?? "⚠ ORPHAN";
    const key = `${tab} | status=${JSON.stringify(r.cost_center_status)} | origin=${JSON.stringify(r.assignment_origin)}`;
    distMap.set(key, (distMap.get(key) ?? 0) + 1);
  }

  const distribution = Object.fromEntries([...distMap.entries()].sort());

  // Full orphan details
  const orphans = allRows.filter(r => whichTab(r.cost_center_status, r.assignment_origin) === null);

  return NextResponse.json({
    total_transactions: allRows.length,
    distribution,
    orphan_count: orphans.length,
    orphans,
  });
}
