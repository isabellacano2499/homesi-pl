import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type OfficialRow = {
  loan_number: string;
  loan_info_channel: string | null;
  b2b: boolean;
  processing: boolean;
  support_on_demand: boolean;
  affinity: boolean;
  recruitment: boolean;
};

function computeMetrics(offs: OfficialRow[]) {
  return {
    total:            offs.length,
    banked:           offs.filter((o) => o.loan_info_channel === "Banked - Retail").length,
    brokered:         offs.filter((o) => o.loan_info_channel === "Brokered").length,
    other:            offs.filter((o) => o.loan_info_channel && o.loan_info_channel !== "Banked - Retail" && o.loan_info_channel !== "Brokered").length,
    b2b:              offs.filter((o) => o.b2b).length,
    processing:       offs.filter((o) => o.processing).length,
    support_on_demand:offs.filter((o) => o.support_on_demand).length,
    affinity:         offs.filter((o) => o.affinity).length,
    recruitment:      offs.filter((o) => o.recruitment).length,
  };
}

export async function GET(req: NextRequest) {
  const supabase = createServerClient();
  const sp = new URL(req.url).searchParams;

  const years    = sp.getAll("year").map(Number).filter(Boolean);
  const branches = sp.getAll("branch");
  const sources  = sp.getAll("source");
  const ccIds    = sp.getAll("cost_center_id");
  const groupBy  = sp.get("group_by"); // "month" for per-month breakdown

  // ── Per-month mode ────────────────────────────────────────────────────────────
  if (groupBy === "month") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = supabase
      .from("pl_transactions")
      .select("month,loan_number")
      .not("loan_number", "is", null)
      .not("loan_number_incomplete", "eq", true);

    if (years.length)    q = q.in("year", years);
    if (branches.length) q = q.in("branch", branches);
    if (sources.length)  q = q.in("source", sources);
    if (ccIds.length)    q = q.in("cost_center_id", ccIds);

    const { data: txRows, error: txErr } = await q;
    if (txErr) return NextResponse.json({ error: txErr.message }, { status: 500 });

    // Group loan_numbers by month
    const monthToLoans = new Map<string, Set<string>>();
    for (const row of txRows ?? []) {
      const m  = row.month as string | null;
      const ln = row.loan_number as string | null;
      if (!m || !ln) continue;
      const s = monthToLoans.get(m) ?? new Set<string>();
      s.add(ln);
      monthToLoans.set(m, s);
    }

    if (monthToLoans.size === 0) return NextResponse.json({ by_month: {} });

    const allLns = [...new Set((txRows ?? []).map((r: { loan_number: string | null }) => r.loan_number).filter(Boolean))] as string[];

    const { data: officials, error: loErr } = await supabase
      .from("loan_officials")
      .select("loan_number,loan_info_channel,b2b,processing,support_on_demand,affinity,recruitment")
      .in("loan_number", allLns);
    if (loErr) return NextResponse.json({ error: loErr.message }, { status: 500 });

    const officialMap = new Map<string, OfficialRow>();
    for (const o of officials ?? []) officialMap.set(o.loan_number as string, o as OfficialRow);

    const by_month: Record<string, ReturnType<typeof computeMetrics>> = {};
    for (const [month, loanSet] of monthToLoans) {
      const offs = [...loanSet].map((ln) => officialMap.get(ln)).filter((o): o is OfficialRow => !!o);
      by_month[month] = computeMetrics(offs);
    }

    return NextResponse.json({ by_month });
  }

  // ── Total mode (original behaviour) ──────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase
    .from("pl_transactions")
    .select("loan_number")
    .not("loan_number", "is", null)
    .not("loan_number_incomplete", "eq", true);

  if (years.length)    q = q.in("year", years);
  if (branches.length) q = q.in("branch", branches);
  if (sources.length)  q = q.in("source", sources);
  if (ccIds.length)    q = q.in("cost_center_id", ccIds);

  const { data: txRows, error: txErr } = await q;
  if (txErr) return NextResponse.json({ error: txErr.message }, { status: 500 });

  const loanNumbers = [
    ...new Set((txRows ?? []).map((r: { loan_number: string }) => r.loan_number)),
  ] as string[];

  if (loanNumbers.length === 0) {
    return NextResponse.json({ total: 0, banked: 0, brokered: 0, other: 0, b2b: 0, processing: 0, support_on_demand: 0, affinity: 0, recruitment: 0 });
  }

  const { data: officials, error: loErr } = await supabase
    .from("loan_officials")
    .select("loan_number,loan_info_channel,b2b,processing,support_on_demand,affinity,recruitment")
    .in("loan_number", loanNumbers);
  if (loErr) return NextResponse.json({ error: loErr.message }, { status: 500 });

  return NextResponse.json(computeMetrics((officials ?? []) as OfficialRow[]));
}
