"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { ReportFilter } from "@/components/report-filter";

const MONTH_ORDER = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

type OATx = {
  id: string;
  month: string | null;
  year: number | null;
  branch: string | null;
  gl_code: string | null;
  gl_name: string | null;
  check_description: string | null;
  check_description_2: string | null;
  check_description_3: string | null;
  vendor: string | null;
  category: string | null;
  position: string | null;
  branch_allocation: string | null;
  debit: number;
  credit: number;
  movement: number | null;
  cost_center_id: string | null;
  cost_center_status: string | null;
  cost_centers: { name: string } | null;
};

function fmt(v: number | null | undefined): string {
  if (v == null) return "—";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

export default function OffshoreAllocationsPage() {
  const [allYears,  setAllYears]  = useState<string[]>([]);
  const [allMonths, setAllMonths] = useState<string[]>([]);

  const [filterYears,  setFilterYears]  = useState<string[]>([]);
  const [filterMonths, setFilterMonths] = useState<string[]>([]);

  const [data,    setData]    = useState<OATx[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  const fetchData = useCallback(async (
    years: string[], months: string[], isInitial = false,
  ) => {
    setLoading(true); setError("");
    try {
      const p = new URLSearchParams();
      years.forEach((y) => p.append("year", y));
      months.forEach((m) => p.append("month", m));
      const res = await fetch(`/api/offshore-allocations?${p}`);
      if (!res.ok) { const j = await res.json(); setError(j.error ?? "Failed to load"); return; }
      const rows = await res.json() as OATx[];
      setData(rows);
      if (isInitial) {
        const ys = [...new Set(rows.map((r) => String(r.year ?? "")).filter(Boolean))]
          .sort((a, b) => Number(a) - Number(b));
        const ms = MONTH_ORDER.filter((m) => rows.some((r) => r.month === m));
        setAllYears(ys);
        setAllMonths(ms);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData([], [], true); }, [fetchData]);

  // Totals
  const totals = useMemo(() => {
    const movement = data.reduce((s, r) => s + (r.movement ?? 0), 0);
    return { movement };
  }, [data]);

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-32px)]">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Offshore Allocations</h2>
          <p className="text-sm text-gray-500">
            {loading ? "Loading…" : `${data.length.toLocaleString()} transactions`}
          </p>
        </div>
        <button
          onClick={() => fetchData(filterYears, filterMonths)}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <ReportFilter
          label="Year"
          options={allYears}
          selected={filterYears}
          onChange={(v) => { setFilterYears(v); fetchData(v, filterMonths); }}
        />
        <ReportFilter
          label="Month"
          options={allMonths}
          selected={filterMonths}
          onChange={(v) => { setFilterMonths(v); fetchData(filterYears, v); }}
        />
      </div>

      {error && (
        <p className="rounded-lg border border-red-100 bg-red-50 px-4 py-2 text-sm text-red-600 shrink-0">
          {error}
        </p>
      )}

      {/* Table */}
      <div className="flex-1 rounded-xl border border-gray-200 bg-white shadow-sm overflow-auto min-h-0">
        {loading ? (
          <div className="py-12 text-center text-gray-400">
            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600" />
            <p className="mt-2 text-xs">Loading…</p>
          </div>
        ) : data.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-400">
            No offshore allocation transactions found.
          </p>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-gray-50">
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="px-3 py-3 font-medium whitespace-nowrap">Month</th>
                <th className="px-3 py-3 font-medium whitespace-nowrap">Year</th>
                <th className="px-3 py-3 font-medium whitespace-nowrap">GL Code</th>
                <th className="px-3 py-3 font-medium whitespace-nowrap">GL Name</th>
                <th className="px-3 py-3 font-medium whitespace-nowrap">Branch</th>
                <th className="px-3 py-3 font-medium whitespace-nowrap">Check Description</th>
                <th className="px-3 py-3 font-medium whitespace-nowrap">Check Desc 2</th>
                <th className="px-3 py-3 font-medium whitespace-nowrap">Check Desc 3</th>
                <th className="px-3 py-3 font-medium whitespace-nowrap">Vendor</th>
                <th className="px-3 py-3 font-medium whitespace-nowrap">Category</th>
                <th className="px-3 py-3 font-medium whitespace-nowrap">Position</th>
                <th className="px-3 py-3 font-medium whitespace-nowrap">Branch Allocation</th>
                <th className="px-3 py-3 font-medium whitespace-nowrap">Cost Center</th>
                <th className="px-3 py-3 font-medium whitespace-nowrap text-right">Movement</th>
              </tr>
            </thead>
            <tbody>
              {data.map((tx) => (
                <tr key={tx.id} className="border-b border-gray-50 hover:bg-gray-50 align-middle">
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{tx.month ?? "—"}</td>
                  <td className="px-3 py-2 text-gray-600 tabular-nums">{tx.year ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-gray-700 whitespace-nowrap">{tx.gl_code ?? "—"}</td>
                  <td className="px-3 py-2 text-gray-600 max-w-[140px] truncate whitespace-nowrap">{tx.gl_name ?? "—"}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{tx.branch ?? "—"}</td>
                  <td className="px-3 py-2 text-gray-500 max-w-[160px] truncate whitespace-nowrap">{tx.check_description ?? "—"}</td>
                  <td className="px-3 py-2 text-gray-600 max-w-[160px] truncate whitespace-nowrap">{tx.check_description_2 ?? <span className="text-gray-300">—</span>}</td>
                  <td className="px-3 py-2 text-gray-600 max-w-[160px] truncate whitespace-nowrap">{tx.check_description_3 ?? <span className="text-gray-300">—</span>}</td>
                  <td className="px-3 py-2 text-gray-600 max-w-[140px] truncate whitespace-nowrap">{tx.vendor ?? "—"}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{tx.category ?? <span className="text-gray-300">—</span>}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{tx.position ?? <span className="text-gray-300">—</span>}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{tx.branch_allocation ?? <span className="text-gray-300">—</span>}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {tx.cost_centers?.name ? (
                      <span className="rounded bg-green-50 px-1.5 py-0.5 font-medium text-green-700">
                        {tx.cost_centers.name}
                      </span>
                    ) : tx.cost_center_status === "conflict" ? (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-700">
                        Conflict
                      </span>
                    ) : (
                      <span className="text-gray-300">Unassigned</span>
                    )}
                  </td>
                  <td className={[
                    "px-3 py-2 text-right tabular-nums whitespace-nowrap font-medium",
                    (tx.movement ?? 0) >= 0 ? "text-green-700" : "text-red-700",
                  ].join(" ")}>
                    {fmt(tx.movement)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 bg-gray-50 border-t border-gray-200">
              <tr>
                <td colSpan={13} className="px-3 py-2 text-xs font-semibold text-gray-500 text-right">
                  Total Movement
                </td>
                <td className={[
                  "px-3 py-2 text-right tabular-nums text-xs font-bold whitespace-nowrap",
                  totals.movement >= 0 ? "text-green-700" : "text-red-700",
                ].join(" ")}>
                  {fmt(totals.movement)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}
