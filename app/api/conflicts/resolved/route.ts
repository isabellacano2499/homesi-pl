import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import type { ResolvedConflictGroup } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = createServerClient();
  const branches = new URL(req.url).searchParams.getAll("branch");

  const [{ data: snapshots, error: snapErr }, { data: ccs, error: ccErr }] = await Promise.all([
    supabase
      .from("conflict_snapshots")
      .select("transaction_id,conflicting_cc_ids,resolved_cc_id,resolved_at")
      .eq("is_resolved", true)
      .order("resolved_at", { ascending: false }),
    supabase.from("cost_centers").select("id,name"),
  ]);

  if (snapErr) return NextResponse.json({ error: snapErr.message }, { status: 500 });
  if (ccErr) return NextResponse.json({ error: ccErr.message }, { status: 500 });
  if (!snapshots || snapshots.length === 0) return NextResponse.json([]);

  const ccMap = new Map<string, string>((ccs ?? []).map((c) => [c.id, c.name]));

  const txIds = snapshots.map((s) => s.transaction_id);
  let txQ = supabase
    .from("pl_transactions")
    .select("id,gl_code,gl_name,month,year,branch,check_description,vendor,debit,credit,movement,cost_center_id")
    .in("id", txIds);
  if (branches.length > 0) txQ = txQ.in("branch", branches);
  const { data: txs, error: txErr } = await txQ;
  if (txErr) return NextResponse.json({ error: txErr.message }, { status: 500 });

  const txMap = new Map((txs ?? []).map((t) => [t.id, t]));

  const groupMap = new Map<string, ResolvedConflictGroup>();
  for (const snap of snapshots) {
    const tx = txMap.get(snap.transaction_id);
    if (!tx) continue; // filtered out by branch
    const key = tx.gl_code ?? "(No GL Code)";
    if (!groupMap.has(key)) groupMap.set(key, { gl_code: key, gl_name: tx.gl_name ?? "", transactions: [] });
    groupMap.get(key)!.transactions.push({
      id: tx.id,
      gl_code: tx.gl_code,
      gl_name: tx.gl_name,
      month: tx.month,
      year: tx.year,
      branch: tx.branch,
      check_description: tx.check_description,
      vendor: tx.vendor,
      debit: tx.debit,
      credit: tx.credit,
      movement: tx.movement,
      cost_center_id: tx.cost_center_id,
      conflicting_ccs: (snap.conflicting_cc_ids ?? []).map((id: string) => ({
        id,
        name: ccMap.get(id) ?? id,
      })),
      resolved_cc: snap.resolved_cc_id
        ? { id: snap.resolved_cc_id, name: ccMap.get(snap.resolved_cc_id) ?? snap.resolved_cc_id }
        : null,
      resolved_at: snap.resolved_at,
    });
  }

  return NextResponse.json([...groupMap.values()]);
}
