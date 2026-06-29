"use client";

import { useEffect, useState } from "react";

interface LoanMetrics {
  total: number;
  banked: number;
  brokered: number;
  other: number;
  b2b: number;
  processing: number;
  support_on_demand: number;
  affinity: number;
  recruitment: number;
}

interface Props {
  years: string[];
  branches: string[];
  sources: string[];
  costCenterIds?: string[];
}

export function LoanMetricsPanel({ years, branches, sources, costCenterIds }: Props) {
  const [metrics, setMetrics] = useState<LoanMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  const key = [years, branches, sources, costCenterIds ?? []].map((a) => a.join(",")).join("|");

  useEffect(() => {
    const p = new URLSearchParams();
    years.forEach((y) => p.append("year", y));
    branches.forEach((b) => p.append("branch", b));
    sources.forEach((s) => p.append("source", s));
    (costCenterIds ?? []).forEach((id) => p.append("cost_center_id", id));

    setLoading(true);
    fetch(`/api/loan-metrics?${p}`)
      .then((r) => r.json())
      .then(setMetrics)
      .catch(console.error)
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-2.5 text-xs text-gray-400 animate-pulse">
        Loading loan metrics…
      </div>
    );
  }

  if (!metrics || metrics.total === 0) {
    return (
      <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-2.5 text-xs text-gray-400">
        No loan records found for the selected filters.
      </div>
    );
  }

  const hasOther = metrics.other > 0;
  const hasTags =
    metrics.b2b > 0 ||
    metrics.processing > 0 ||
    metrics.support_on_demand > 0 ||
    metrics.affinity > 0 ||
    metrics.recruitment > 0;

  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        Loan Count
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-end gap-3">
          <MetricCard label="Total" value={metrics.total} accent="gray" />
          <MetricCard label="Banked" value={metrics.banked} accent="blue" />
          <MetricCard label="Brokered" value={metrics.brokered} accent="indigo" />
          {hasOther && <MetricCard label="Other" value={metrics.other} accent="orange" />}
        </div>

        {hasTags && (
          <>
            <div className="h-10 w-px self-stretch bg-gray-100" />
            <div className="flex flex-wrap gap-1.5">
              {metrics.b2b > 0 && <TagPill label="B2B" value={metrics.b2b} />}
              {metrics.processing > 0 && <TagPill label="Processing" value={metrics.processing} />}
              {metrics.support_on_demand > 0 && <TagPill label="On Demand" value={metrics.support_on_demand} />}
              {metrics.affinity > 0 && <TagPill label="Affinity" value={metrics.affinity} />}
              {metrics.recruitment > 0 && <TagPill label="Recruitment" value={metrics.recruitment} />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value, accent }: { label: string; value: number; accent: "gray" | "blue" | "indigo" | "orange" }) {
  const colors = {
    gray: "text-gray-900",
    blue: "text-blue-700",
    indigo: "text-indigo-700",
    orange: "text-orange-700",
  };
  return (
    <div className="flex flex-col items-center min-w-[42px]">
      <span className={`text-xl font-bold tabular-nums ${colors[accent]}`}>
        {value.toLocaleString()}
      </span>
      <span className="text-[10px] text-gray-400 mt-0.5">{label}</span>
    </div>
  );
}

function TagPill({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 border border-indigo-100 px-2 py-0.5 text-[11px]">
      <span className="font-semibold text-indigo-700">{value}</span>
      <span className="text-indigo-500">{label}</span>
    </span>
  );
}
