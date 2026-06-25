"use client";

import { useEffect, useMemo, useState } from "react";
import { PivotTable } from "@/components/pivot-table";
import { ReportFilter } from "@/components/report-filter";
import type { PLReportTx, FilterOptionsResponse } from "@/types";

const MONTH_ORDER = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

export default function PLAllPage() {
  const [opts, setOpts] = useState<FilterOptionsResponse | null>(null);

  // Server-side filters (trigger API reload via Load button)
  const [years,    setYears]    = useState<string[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [sources,  setSources]  = useState<string[]>([]);

  // Client-side filters (applied via useMemo, no reload)
  const [glCodes, setGlCodes] = useState<string[]>([]);
  const [months,  setMonths]  = useState<string[]>([]);

  const [rawTxs,  setRawTxs]  = useState<PLReportTx[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [loaded,  setLoaded]  = useState(false);

  // Load filter options once
  useEffect(() => {
    fetch("/api/transactions/filter-options")
      .then(r => r.json())
      .then((v: FilterOptionsResponse) => {
        setOpts(v);
        // Default to latest year
        if (v.year.length > 0) setYears([v.year[v.year.length - 1]]);
      })
      .catch(console.error);
  }, []);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const p = new URLSearchParams();
      years.forEach(y => p.append("year", y));
      branches.forEach(b => p.append("branch", b));
      sources.forEach(s => p.append("source", s));
      const res = await fetch(`/api/pl-all?${p}`);
      if (!res.ok) { const j = await res.json(); setError(j.error ?? "Error"); return; }
      setRawTxs(await res.json());
      setLoaded(true);
      // Reset client-side filters when reloading
      setGlCodes([]);
      setMonths([]);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  // Derive available GL Code / Month options from loaded data
  const glCodeOptions = useMemo(
    () => [...new Set(rawTxs.map(t => t.gl_code).filter(Boolean) as string[])].sort(),
    [rawTxs]
  );
  const monthOptions = useMemo(
    () => MONTH_ORDER.filter(m => rawTxs.some(t => t.month === m)),
    [rawTxs]
  );

  // Apply client-side filters
  const txs = useMemo(() => {
    let out = rawTxs;
    if (glCodes.length > 0) out = out.filter(t => t.gl_code && glCodes.includes(t.gl_code));
    if (months.length  > 0) out = out.filter(t => t.month  && months.includes(t.month));
    return out;
  }, [rawTxs, glCodes, months]);

  return (
    <div className="flex flex-col gap-3">
      {/* ── Sticky filter bar ───────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Filters</span>

          <ReportFilter
            label="Year"
            options={(opts?.year ?? []).map(String)}
            selected={years}
            onChange={setYears}
          />
          <ReportFilter
            label="Branch"
            options={opts?.branch ?? []}
            selected={branches}
            onChange={setBranches}
          />
          <ReportFilter
            label="Source"
            options={["original", "addback"]}
            selected={sources}
            onChange={setSources}
          />

          <button
            onClick={load}
            disabled={loading}
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
          >
            {loading ? "Loading…" : "Load"}
          </button>

          {/* Divider */}
          {loaded && (
            <>
              <span className="text-gray-300">|</span>
              <ReportFilter
                label="GL Code"
                options={glCodeOptions}
                selected={glCodes}
                onChange={setGlCodes}
              />
              <ReportFilter
                label="Month"
                options={monthOptions}
                selected={months}
                onChange={setMonths}
              />
            </>
          )}

          <span className="ml-auto text-xs text-gray-400">
            {loaded ? `${txs.length.toLocaleString()} rows` : ""}
          </span>
        </div>
      </div>

      {/* ── Page title ──────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-xl font-bold text-gray-900">P&amp;L All</h2>
        <p className="text-sm text-gray-500">
          Pivot by Category 2 → Category 7 → GL Name → GL Code
        </p>
      </div>

      {error && (
        <p className="rounded-lg border border-red-100 bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>
      )}

      {!loaded && !loading && (
        <p className="py-10 text-center text-sm text-gray-400">
          Select filters and click Load to generate the report.
        </p>
      )}

      {(loaded || loading) && (
        <PivotTable
          txs={txs}
          loading={loading}
          emptyMessage="No transactions found for the selected filters."
        />
      )}
    </div>
  );
}
