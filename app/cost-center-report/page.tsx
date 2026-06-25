"use client";

import { useEffect, useMemo, useState } from "react";
import { PivotTable } from "@/components/pivot-table";
import { ReportFilter } from "@/components/report-filter";
import type { CostCenter, PLReportTx, FilterOptionsResponse } from "@/types";

const MONTH_ORDER = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

export default function CostCenterReportPage() {
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [opts, setOpts] = useState<FilterOptionsResponse | null>(null);

  // Multi-select CC filter: stores display names ("Unassigned", "Conflict", CC name)
  const [selectedCCs, setSelectedCCs] = useState<string[]>([]);

  // Server-side filters
  const [years,    setYears]    = useState<string[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [sources,  setSources]  = useState<string[]>([]);

  // Client-side filters
  const [glCodes, setGlCodes] = useState<string[]>([]);
  const [months,  setMonths]  = useState<string[]>([]);

  const [rawTxs,  setRawTxs]  = useState<PLReportTx[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [loaded,  setLoaded]  = useState(false);

  // Load CC list + filter options on mount
  useEffect(() => {
    Promise.all([
      fetch("/api/cost-centers").then(r => r.json()),
      fetch("/api/transactions/filter-options").then(r => r.json()),
    ]).then(([ccs, filterOpts]: [CostCenter[], FilterOptionsResponse]) => {
      setCostCenters(ccs);
      setOpts(filterOpts);
      // Default: first CC name, or "Unassigned" if none
      setSelectedCCs(ccs.length > 0 ? [ccs[0].name] : ["Unassigned"]);
      if (filterOpts.year.length > 0)
        setYears([filterOpts.year[filterOpts.year.length - 1]]);
    }).catch(console.error);
  }, []);

  // Map display name → API param (UUID or sentinel)
  function displayToApiParam(name: string): string {
    if (name === "Unassigned") return "unassigned";
    if (name === "Conflict") return "conflict";
    return costCenters.find(cc => cc.name === name)?.id ?? name;
  }

  async function load() {
    if (selectedCCs.length === 0) return;
    setLoading(true); setError("");
    try {
      const p = new URLSearchParams();
      selectedCCs.forEach(name => p.append("cc", displayToApiParam(name)));
      years.forEach(y => p.append("year", y));
      branches.forEach(b => p.append("branch", b));
      sources.forEach(s => p.append("source", s));
      const res = await fetch(`/api/cost-center-report?${p}`);
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

  // Derive client-side filter options from loaded data
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

  // CC options for ReportFilter
  const ccOptions = ["Unassigned", "Conflict", ...costCenters.map(cc => cc.name)];

  return (
    <div className="flex flex-col gap-3">
      {/* ── Sticky filter bar ───────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Filters</span>

          <ReportFilter
            label="Cost Center"
            options={ccOptions}
            selected={selectedCCs}
            onChange={setSelectedCCs}
          />
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
            disabled={selectedCCs.length === 0 || loading}
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

          <span className="ml-auto text-xs text-gray-400">
            {loaded ? `${txs.length.toLocaleString()} rows` : ""}
          </span>
        </div>
      </div>

      {/* ── Page title ──────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-xl font-bold text-gray-900">Cost Center Report</h2>
        <p className="text-sm text-gray-500">Pivot by Category 2 → Category 7 → GL Name → GL Code</p>
      </div>

      {error && (
        <p className="rounded-lg border border-red-100 bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>
      )}

      {!loaded && !loading && (
        <p className="py-10 text-center text-sm text-gray-400">
          Select a cost center and click Load to generate the report.
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
