import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import type { ConflictGroup } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = createServerClient();
  const branches = new URL(req.url).searchParams.getAll("branch");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase
    .from("pl_transactions")
    .select("id,gl_code,gl_name,month,year,branch,check_description,vendor,debit,credit,movement,cost_center_conflicts")
    .eq("cost_center_status", "conflict")
    .order("gl_code", { nullsFirst: false });
  if (branches.length > 0) q = q.in("branch", branches);

  const [{ data: txs, error: txErr }, { data: ccs, error: ccErr }] = await Promise.all([
    q,
    supabase.from("cost_centers").select("id,name"),
  ]);

  if (txErr) return NextResponse.json({ error: txErr.message }, { status: 500 });
  if (ccErr) return NextResponse.json({ error: ccErr.message }, { status: 500 });

  const ccMap = new Map<string, string>((ccs ?? []).map((c) => [c.id, c.name]));

  const groupMap = new Map<string, ConflictGroup>();
  for (const tx of txs ?? []) {
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
      conflicting_ccs: (tx.cost_center_conflicts ?? []).map((id: string) => ({
        id,
        name: ccMap.get(id) ?? "(deleted Cost Center)",
      })),
    });
  }

  return NextResponse.json([...groupMap.values()]);
}
