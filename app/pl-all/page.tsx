"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PivotTable } from "@/components/pivot-table";
import { PivotTableByCC } from "@/components/pivot-table-cc";
import { ReportFilter } from "@/components/report-filter";
import { buildSplitsMap, fanOutBySplits } from "@/lib/apply-splits";
import type { PLReportTx, PLReportTxCC, FilterOptionsResponse } from "@/types";
import type { SplitEntry } from "@/lib/apply-splits";

const MONTH_ORDER = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

type ViewMode = "gl" | "cc";

export default function PLAllPage() {
  const [opts, setOpts] = useState<FilterOptionsResponse | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("gl");

  const [years,    setYears]    = useState<string[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [sources,  setSources]  = useState<string[]>([]);

  const [glCodes, setGlCodes] = useState<string[]>([]);
  const [months,  setMonths]  = useState<string[]>([]);

  const [rawTxs,    setRawTxs]    = useState<PLReportTx[]>([]);
  const [allSplits, setAllSplits] = useState<SplitEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [loaded,  setLoaded]  = useState(false);
  const autoLoaded = useRef(false);

  // Extract the fetch logic so it can be called with explicit params
  // (avoids stale-closure race when the initial auto-load fires right after
  //  filter options arrive — `years` state may not have propagated yet)
  async function fetchData(yrs: string[], brs: string[], srcs: string[]) {
    setLoading(true); setError("");
    try {
      const p = new URLSearchParams();
      yrs.forEach(y => p.append("year", y));
      brs.forEach(b => p.append("branch", b));
      srcs.forEach(s => p.append("source", s));
      const res = await fetch(`/api/pl-all?${p}`);
      if (!res.ok) { const j = await res.json(); setError(j.error ?? "Error"); return; }
      setRawTxs(await res.json());
      setLoaded(true);
      setGlCodes([]); setMonths([]);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  // Load filter options + splits on mount; auto-load data with the default year
  useEffect(() => {
    Promise.all([
      fetch("/api/transactions/filter-options").then(r => r.json()),
      fetch("/api/cc-allocation-splits").then(r => r.json()),
    ]).then(([filterOpts, splits]: [FilterOptionsResponse, SplitEntry[]]) => {
      setOpts(filterOpts);
      setAllSplits(splits);
      const defaultYear = filterOpts.year.length > 0
        ? [filterOpts.year[filterOpts.year.length - 1]]
        : [];
      setYears(defaultYear);
      // Auto-load with the correct year — use explicit params to avoid stale closure
      if (!autoLoaded.current && defaultYear.length > 0) {
        autoLoaded.current = true;
        fetchData(defaultYear, [], []);
      }
    }).catch(console.error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function load() {
    return fetchData(years, branches, sources);
  }

  const glCodeOptions = useMemo(
    () => [...new Set(rawTxs.map(t => t.gl_code).filter(Boolean) as string[])].sort(),
    [rawTxs]
  );
  const monthOptions = useMemo(
    () => MONTH_ORDER.filter(m => rawTxs.some(t => t.month === m)),
    [rawTxs]
  );

  // Client-side GL/month filter (unchanged from before)
  const txs = useMemo(() => {
    let out = rawTxs;
    if (glCodes.length > 0) out = out.filter(t => t.gl_code && glCodes.includes(t.gl_code));
    if (months.length  > 0) out = out.filter(t => t.month  && months.includes(t.month));
    return out;
  }, [rawTxs, glCodes, months]);

  // Build splits map once; apply fan-out only for the CC view
  const splitsMap = useMemo(() => buildSplitsMap(allSplits), [allSplits]);

  const txsForCC = useMemo((): PLReportTxCC[] => {
    if (viewMode !== "cc") return [];
    return fanOutBySplits(txs, splitsMap);
  }, [txs, splitsMap, viewMode]);

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
            options={["original", "addback", "offshore_allocations"]}
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

          {/* View toggle */}
          <div className="ml-auto flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-0.5">
            <button
              onClick={() => setViewMode("gl")}
              className={[
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                viewMode === "gl"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-gray-500 hover:text-gray-700",
              ].join(" ")}
            >
              P&amp;L by GL
            </button>
            <button
              onClick={() => setViewMode("cc")}
              className={[
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                viewMode === "cc"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-gray-500 hover:text-gray-700",
              ].join(" ")}
            >
              P&amp;L by Cost Center
            </button>
          </div>
        </div>
      </div>

      {/* ── Page title ──────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-xl font-bold text-gray-900">P&amp;L All</h2>
        <p className="text-sm text-gray-500">
          {viewMode === "gl"
            ? "Pivot by Category 2 → Category 7 → GL Name → GL Code"
            : "Pivot by Cost Center → GL Name → Transaction · Vendor/OA allocations prorated by %"}
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

      {(loaded || loading) && viewMode === "gl" && (
        <PivotTable
          txs={txs}
          loading={loading}
          emptyMessage="No transactions found for the selected filters."
        />
      )}

      {(loaded || loading) && viewMode === "cc" && (
        <PivotTableByCC
          txs={txsForCC}
          loading={loading}
          emptyMessage="No transactions found for the selected filters."
        />
      )}
    </div>
  );
}
