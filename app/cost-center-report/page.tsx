"use client";

import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { PivotTableDynamic } from "@/components/pivot-table-dynamic";
import { ReportFilter } from "@/components/report-filter";
import { LoanMetricsByMonthBar } from "@/components/loan-metrics-by-month";
import { buildSplitsMap, fanOutBySplits } from "@/lib/apply-splits";
import { downloadCSV } from "@/lib/csv";
import { useActiveBranches, mergeWithGlobal } from "@/components/branch-filter-provider";
import type { SplitEntry } from "@/lib/apply-splits";
import type { CostCenter, PLReportTx, FilterOptionsResponse } from "@/types";

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

const SOURCE_LABELS: Record<string, string> = {
  original:             "Original",
  addback:              "Addback",
  offshore_allocations: "OA",
  manual_entry:         "Manual Entry",
};
function srcLabel(s: string) { return SOURCE_LABELS[s] ?? s; }

function FilterChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-100 px-2 py-0.5 text-[11px]">
      <span className="text-blue-400 font-normal">{label}:</span>
      <span className="font-medium text-blue-700">{value}</span>
    </span>
  );
}

export default function CostCenterReportPage() {
  const { activeBranches } = useActiveBranches();
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [opts, setOpts] = useState<FilterOptionsResponse | null>(null);

  const [selectedCCs, setSelectedCCs] = useState<string[]>([]);

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

  // Params from last successful load — for metrics panel and chips
  const [loadedYears,    setLoadedYears]    = useState<string[]>([]);
  const [loadedBranches, setLoadedBranches] = useState<string[]>([]);
  const [loadedSources,  setLoadedSources]  = useState<string[]>([]);
  const [loadedCCIds,    setLoadedCCIds]    = useState<string[]>([]);
  const [loadedCCNames,  setLoadedCCNames]  = useState<string[]>([]);

  useEffect(() => {
    Promise.all([
      fetch("/api/cost-centers").then(r => r.json()),
      fetch("/api/transactions/filter-options").then(r => r.json()),
      fetch("/api/cc-allocation-splits").then(r => r.json()),
    ]).then(([ccs, filterOpts, splits]: [CostCenter[], FilterOptionsResponse, SplitEntry[]]) => {
      setCostCenters(ccs);
      setOpts(filterOpts);
      setAllSplits(splits);
      setSelectedCCs(ccs.length > 0 ? [ccs[0].name] : ["Unassigned"]);
      if (filterOpts.year.length > 0)
        setYears([filterOpts.year[filterOpts.year.length - 1]]);
    }).catch(console.error);
  }, []);

  const splitsMap = useMemo(() => buildSplitsMap(allSplits), [allSplits]);

  async function load() {
    if (selectedCCs.length === 0) return;
    setLoading(true); setError("");
    try {
      const effectiveBranches = mergeWithGlobal(activeBranches, branches);
      const p = new URLSearchParams();
      years.forEach(y => p.append("year", y));
      effectiveBranches.forEach(b => p.append("branch", b));
      sources.forEach(s => p.append("source", s));
      const res = await fetch(`/api/pl-all?${p}`);
      if (!res.ok) { const j = await res.json(); setError(j.error ?? "Error"); return; }
      const allTxs: PLReportTx[] = await res.json();

      const fanned = fanOutBySplits(allTxs, splitsMap);
      const filtered = fanned.filter(tx => {
        for (const name of selectedCCs) {
          if (name === "Unassigned" && (!tx.cost_center_id || tx.cost_center_status === "unassigned")) return true;
          if (name === "Conflict" && tx.cost_center_status === "conflict") return true;
          const ccId = costCenters.find(c => c.name === name)?.id;
          if (ccId && tx.cost_center_id === ccId) return true;
        }
        return false;
      });

      setRawTxs(filtered as PLReportTx[]);
      setLoaded(true);
      setGlCodes([]); setMonths([]);
      setLoadedYears(years);
      setLoadedBranches(effectiveBranches);
      setLoadedSources(sources);
      setLoadedCCNames(selectedCCs);
      // Collect actual CC IDs for the loan metrics panel (skip Unassigned/Conflict pseudo-names)
      const ccIds = selectedCCs
        .map(name => costCenters.find(c => c.name === name)?.id)
        .filter((id): id is string => !!id);
      setLoadedCCIds(ccIds);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
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

  const ccOptions = ["Unassigned", "Conflict", ...costCenters.map(cc => cc.name)];

  function handleExport() {
    const suffix = loadedYears.length === 1 ? `_${loadedYears[0]}` : "";
    downloadCSV(`cc_report${suffix}.csv`, txs as unknown as Record<string, unknown>[], CSV_COLUMNS);
  }

  // Active filter chips (what was actually loaded)
  const loadedChips: { label: string; value: string }[] = [];
  if (loadedCCNames.length > 0)
    loadedChips.push({ label: "CC", value: loadedCCNames.length === 1 ? loadedCCNames[0] : `${loadedCCNames.length} CCs` });
  if (loadedYears.length > 0)
    loadedChips.push({ label: "Year", value: loadedYears.length === 1 ? loadedYears[0] : `${loadedYears.length} years` });
  if (loadedBranches.length > 0)
    loadedChips.push({ label: "Branch", value: loadedBranches.length === 1 ? loadedBranches[0] : `${loadedBranches.length} branches` });
  if (loadedSources.length > 0)
    loadedChips.push({ label: "Source", value: loadedSources.map(srcLabel).join(", ") });

  return (
    <div className="flex flex-col gap-3">
      {/* Sticky filter bar */}
      <div className="sticky top-0 z-30 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 shadow-sm">
        {/* Controls row */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Filters</span>

          <ReportFilter label="Cost Center" options={ccOptions}                          selected={selectedCCs} onChange={setSelectedCCs} />
          <ReportFilter label="Year"        options={(opts?.year ?? []).map(String)}     selected={years}       onChange={setYears} />
          <ReportFilter label="Branch"      options={opts?.branch ?? []}                 selected={branches}    onChange={setBranches} />
          <ReportFilter
            label="Source"
            options={opts?.source ?? []}
            selected={sources}
            onChange={setSources}
          />

          <button
            onClick={load}
            disabled={selectedCCs.length === 0 || loading}
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

          <span className="ml-auto text-xs text-gray-400">
            {loaded ? `${txs.length.toLocaleString()} rows` : ""}
          </span>
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
          <h2 className="text-xl font-bold text-gray-900">Cost Center Report</h2>
          <p className="text-sm text-gray-500">Use Pivot by: to reorder or add hierarchy levels</p>
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
          costCenterIds={loadedCCIds.length > 0 ? loadedCCIds : undefined}
        />
      )}

      {error && (
        <p className="rounded-lg border border-red-100 bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>
      )}

      {!loaded && !loading && (
        <p className="py-10 text-center text-sm text-gray-400">
          Select a cost center and click Run Report to generate the report.
        </p>
      )}

      {(loaded || loading) && (
        <PivotTableDynamic
          txs={txs}
          defaultLevels={["op_nonop", "category_2", "category_6", "category_7", "gl"]}
          storageKey="cost_center_report_hierarchy"
          loading={loading}
          emptyMessage="No transactions found for the selected filters."
        />
      )}
    </div>
  );
}
