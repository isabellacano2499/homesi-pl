"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download } from "lucide-react";
import { PivotTable } from "@/components/pivot-table";
import { PivotTableByCC } from "@/components/pivot-table-cc";
import { ReportFilter } from "@/components/report-filter";
import { LoanMetricsByMonthBar } from "@/components/loan-metrics-by-month";
import { buildSplitsMap, fanOutBySplits } from "@/lib/apply-splits";
import { downloadCSV } from "@/lib/csv";
import { useActiveBranches, mergeWithGlobal } from "@/components/branch-filter-provider";
import type { PLReportTx, PLReportTxCC, FilterOptionsResponse } from "@/types";
import type { SplitEntry } from "@/lib/apply-splits";

const MONTH_ORDER = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const CSV_COLUMNS = [
  { key: "month",            label: "Month" },
  { key: "branch",           label: "Branch" },
  { key: "gl_code",          label: "GL Code" },
  { key: "gl_name",          label: "GL Name" },
  { key: "category_2",       label: "Category 2" },
  { key: "category_6",       label: "Category 6" },
  { key: "category_7",       label: "Category 7" },
  { key: "check_description",label: "Description" },
  { key: "vendor",           label: "Vendor" },
  { key: "ref_numb",         label: "Ref #" },
  { key: "debit",            label: "Debit" },
  { key: "credit",           label: "Credit" },
  { key: "movement",         label: "Movement" },
];

type ViewMode = "gl" | "cc";

function FilterChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-100 px-2 py-0.5 text-[11px]">
      <span className="text-blue-400 font-normal">{label}:</span>
      <span className="font-medium text-blue-700">{value}</span>
    </span>
  );
}

export default function PLAllPage() {
  const { activeBranches, isLoaded: branchFilterLoaded } = useActiveBranches();
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

  // Params that were last successfully loaded — for metrics panel and chips
  const [loadedYears,    setLoadedYears]    = useState<string[]>([]);
  const [loadedBranches, setLoadedBranches] = useState<string[]>([]);
  const [loadedSources,  setLoadedSources]  = useState<string[]>([]);

  async function fetchData(yrs: string[], brs: string[], srcs: string[]) {
    setLoading(true); setError("");
    try {
      const effectiveBranches = mergeWithGlobal(activeBranches, brs);
      const p = new URLSearchParams();
      yrs.forEach(y => p.append("year", y));
      effectiveBranches.forEach(b => p.append("branch", b));
      srcs.forEach(s => p.append("source", s));
      const res = await fetch(`/api/pl-all?${p}`);
      if (!res.ok) { const j = await res.json(); setError(j.error ?? "Error"); return; }
      setRawTxs(await res.json());
      setLoaded(true);
      setGlCodes([]); setMonths([]);
      setLoadedYears(yrs);
      setLoadedBranches(effectiveBranches);
      setLoadedSources(srcs);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!branchFilterLoaded) return;
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
      if (!autoLoaded.current && defaultYear.length > 0) {
        autoLoaded.current = true;
        fetchData(defaultYear, [], []);
      }
    }).catch(console.error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchFilterLoaded]);

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

  const txs = useMemo(() => {
    let out = rawTxs;
    if (glCodes.length > 0) out = out.filter(t => t.gl_code && glCodes.includes(t.gl_code));
    if (months.length  > 0) out = out.filter(t => t.month  && months.includes(t.month));
    return out;
  }, [rawTxs, glCodes, months]);

  const splitsMap = useMemo(() => buildSplitsMap(allSplits), [allSplits]);

  const txsForCC = useMemo((): PLReportTxCC[] => {
    if (viewMode !== "cc") return [];
    return fanOutBySplits(txs, splitsMap);
  }, [txs, splitsMap, viewMode]);

  function handleExport() {
    const suffix = loadedYears.length === 1 ? `_${loadedYears[0]}` : "";
    if (viewMode === "cc") {
      const flat = txsForCC.map((tx) => ({
        ...tx,
        cost_center_name: (tx.cost_centers as { name: string } | null)?.name ?? "",
      })) as Record<string, unknown>[];
      downloadCSV(`pl_cc${suffix}.csv`, flat, [...CSV_COLUMNS, { key: "cost_center_name", label: "Cost Center" }]);
    } else {
      downloadCSV(`pl_all${suffix}.csv`, txs as unknown as Record<string, unknown>[], CSV_COLUMNS);
    }
  }

  // Active filter chips (what was actually loaded)
  const loadedChips: { label: string; value: string }[] = [];
  if (loadedYears.length > 0)
    loadedChips.push({ label: "Year", value: loadedYears.length === 1 ? loadedYears[0] : `${loadedYears.length} years` });
  if (loadedBranches.length > 0)
    loadedChips.push({ label: "Branch", value: loadedBranches.length === 1 ? loadedBranches[0] : `${loadedBranches.length} branches` });
  if (loadedSources.length > 0)
    loadedChips.push({ label: "Source", value: loadedSources.map(s => s === "offshore_allocations" ? "OA" : s).join(", ") });

  return (
    <div className="flex flex-col gap-3">
      {/* Sticky filter bar */}
      <div className="sticky top-0 z-30 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 shadow-sm">
        {/* Controls row */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Filters</span>

          <ReportFilter label="Year"   options={(opts?.year ?? []).map(String)} selected={years}    onChange={setYears} />
          <ReportFilter label="Branch" options={opts?.branch ?? []}              selected={branches} onChange={setBranches} />
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
            {loading ? "Loading…" : "Run Report"}
          </button>

          {loaded && (
            <>
              <span className="text-gray-300">|</span>
              <ReportFilter label="GL Code" options={glCodeOptions} selected={glCodes} onChange={setGlCodes} />
              <ReportFilter label="Month"   options={monthOptions}  selected={months}  onChange={setMonths} />
            </>
          )}

          {/* View toggle */}
          <div className="ml-auto flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-0.5">
            <button
              onClick={() => setViewMode("gl")}
              className={[
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                viewMode === "gl" ? "bg-blue-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-700",
              ].join(" ")}
            >
              P&amp;L by GL
            </button>
            <button
              onClick={() => setViewMode("cc")}
              className={[
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                viewMode === "cc" ? "bg-blue-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-700",
              ].join(" ")}
            >
              P&amp;L by Cost Center
            </button>
          </div>
        </div>

        {/* Active filter chips — shown after successful load */}
        {loaded && loadedChips.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-300">Loaded:</span>
            {loadedChips.map((chip) => (
              <FilterChip key={chip.label} label={chip.label} value={chip.value} />
            ))}
          </div>
        )}
      </div>

      {/* Page title + export */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">P&amp;L All</h2>
          <p className="text-sm text-gray-500">
            {viewMode === "gl"
              ? "Pivot by Category 2 → Category 7 → GL Name → GL Code"
              : "Pivot by Cost Center → GL Name → Transaction · Vendor/OA allocations prorated by %"}
          </p>
        </div>
        {loaded && (
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 shadow-sm"
          >
            <Download size={13} /> Export CSV
          </button>
        )}
      </div>

      {/* Per-month loan metrics — shown after first successful load */}
      {loaded && (
        <LoanMetricsByMonthBar
          years={loadedYears}
          branches={loadedBranches}
          sources={loadedSources}
        />
      )}

      {error && (
        <p className="rounded-lg border border-red-100 bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>
      )}

      {!loaded && !loading && (
        <p className="py-10 text-center text-sm text-gray-400">
          Select filters and click Run Report to generate the report.
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
