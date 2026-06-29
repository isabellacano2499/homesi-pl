"use client";

import { useEffect, useState } from "react";

const MONTH_ORDER = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const MONTH_SHORT: Record<string, string> = {
  January: "Jan", February: "Feb", March: "Mar", April: "Apr",
  May: "May", June: "Jun", July: "Jul", August: "Aug",
  September: "Sep", October: "Oct", November: "Nov", December: "Dec",
};

interface MonthMetrics {
  total: number; banked: number; brokered: number; other: number;
  b2b: number; processing: number; support_on_demand: number; affinity: number; recruitment: number;
}

interface Props {
  years: string[];
  branches: string[];
  sources: string[];
  costCenterIds?: string[];
}

export function LoanMetricsByMonthBar({ years, branches, sources, costCenterIds }: Props) {
  const [byMonth, setByMonth] = useState<Record<string, MonthMetrics> | null>(null);
  const [loading, setLoading] = useState(true);

  const key = [years, branches, sources, costCenterIds ?? []].map((a) => a.join(",")).join("|");

  useEffect(() => {
    const p = new URLSearchParams({ group_by: "month" });
    years.forEach((y) => p.append("year", y));
    branches.forEach((b) => p.append("branch", b));
    sources.forEach((s) => p.append("source", s));
    (costCenterIds ?? []).forEach((id) => p.append("cost_center_id", id));

    setLoading(true);
    fetch(`/api/loan-metrics?${p}`)
      .then((r) => r.json())
      .then((d: { by_month: Record<string, MonthMetrics> }) => setByMonth(d.by_month ?? {}))
      .catch(console.error)
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (loading) {
    return <div className="h-[80px] rounded-xl border border-gray-100 bg-gray-50 animate-pulse" />;
  }

  const months = Object.keys(byMonth ?? {})
    .filter((m) => (byMonth?.[m]?.total ?? 0) > 0)
    .sort((a, b) => MONTH_ORDER.indexOf(a) - MONTH_ORDER.indexOf(b));

  if (months.length === 0) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        Loan Count by Month
      </div>
      <div className="overflow-x-auto">
        <div className="flex gap-2 min-w-max pb-0.5">
          {months.map((month) => (
            <MonthCard key={month} month={month} m={byMonth![month]} />
          ))}
        </div>
      </div>
    </div>
  );
}

function MonthCard({ month, m }: { month: string; m: MonthMetrics }) {
  const hasTags = m.b2b + m.processing + m.support_on_demand + m.affinity + m.recruitment > 0;

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/70 px-3 py-2 min-w-[100px]">
      <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
        {MONTH_SHORT[month] ?? month}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-sm font-bold text-gray-900 tabular-nums">{m.total}</span>
        <span className="text-[10px] text-gray-400">total</span>
      </div>
      <div className="flex gap-1 mt-0.5 text-[11px]">
        <span className="font-medium text-blue-700 tabular-nums">{m.banked}</span>
        <span className="text-gray-300 text-[9px]">B</span>
        <span className="text-gray-200">·</span>
        <span className="font-medium text-indigo-700 tabular-nums">{m.brokered}</span>
        <span className="text-gray-300 text-[9px]">Br</span>
        {m.other > 0 && (
          <>
            <span className="text-gray-200">·</span>
            <span className="font-medium text-orange-600 tabular-nums">{m.other}</span>
          </>
        )}
      </div>
      {hasTags && (
        <div className="flex flex-wrap gap-0.5 mt-1">
          {m.b2b > 0               && <MiniTag label="B2B"  v={m.b2b} />}
          {m.processing > 0        && <MiniTag label="Proc" v={m.processing} />}
          {m.support_on_demand > 0 && <MiniTag label="OD"   v={m.support_on_demand} />}
          {m.affinity > 0          && <MiniTag label="Aff"  v={m.affinity} />}
          {m.recruitment > 0       && <MiniTag label="Rec"  v={m.recruitment} />}
        </div>
      )}
    </div>
  );
}

function MiniTag({ label, v }: { label: string; v: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 rounded bg-indigo-50 px-1 text-[9px] text-indigo-600">
      <span className="font-semibold tabular-nums">{v}</span>
      <span className="text-indigo-400">{label}</span>
    </span>
  );
}
