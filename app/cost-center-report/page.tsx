"use client";

import { useEffect, useState } from "react";
import { PivotTable } from "@/components/pivot-table";
import type { CostCenter, PLReportTx, FilterOptionsResponse } from "@/types";

// ─── CC option type (real CC | sentinel) ─────────────────────────────────────

type CCOption =
  | { kind: "sentinel"; value: "unassigned" | "conflict"; label: string }
  | { kind: "cc"; cc: CostCenter };

function optionValue(o: CCOption) {
  return o.kind === "sentinel" ? o.value : o.cc.id;
}
function optionLabel(o: CCOption) {
  return o.kind === "sentinel" ? o.label : o.cc.name;
}

// ─── CC Selector ──────────────────────────────────────────────────────────────

function CCSelector({
  options,
  value,
  onChange,
}: {
  options: CCOption[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {options.map(opt => {
        const v = optionValue(opt);
        const active = value === v;
        const isSentinel = opt.kind === "sentinel";
        return (
          <button
            key={v}
            onClick={() => onChange(v)}
            className={[
              "rounded-full border px-3 py-0.5 text-xs font-medium transition-colors",
              active
                ? isSentinel
                  ? "border-amber-400 bg-amber-100 text-amber-800"
                  : "border-blue-500 bg-blue-600 text-white"
                : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50",
            ].join(" ")}
          >
            {optionLabel(opt)}
          </button>
        );
      })}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CostCenterReportPage() {
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [opts, setOpts] = useState<FilterOptionsResponse | null>(null);

  const [selectedCC, setSelectedCC] = useState("");
  const [year, setYear]     = useState("");
  const [branch, setBranch] = useState("");
  const [source, setSource] = useState(""); // "" = all | "original" | "addback"

  const [txs, setTxs]     = useState<PLReportTx[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState("");
  const [loaded, setLoaded] = useState(false);

  // Load CC list + filter options on mount
  useEffect(() => {
    Promise.all([
      fetch("/api/cost-centers").then(r => r.json()),
      fetch("/api/transactions/filter-options").then(r => r.json()),
    ]).then(([ccs, filterOpts]: [CostCenter[], FilterOptionsResponse]) => {
      setCostCenters(ccs);
      setOpts(filterOpts);
      // Default: first real CC if any, else sentinel
      if (ccs.length > 0) setSelectedCC(ccs[0].id);
      else setSelectedCC("unassigned");
      // Default year = latest available
      if (filterOpts.year.length > 0)
        setYear(filterOpts.year[filterOpts.year.length - 1]);
    }).catch(console.error);
  }, []);

  async function load(cc = selectedCC, yr = year, br = branch) {
    if (!cc) return;
    setLoading(true);
    setError("");
    try {
      const p = new URLSearchParams({ cc });
      if (yr) p.set("year", yr);
      if (br) p.set("branch", br);
      if (source) p.set("source", source);
      const res = await fetch(`/api/cost-center-report?${p}`);
      if (!res.ok) { const j = await res.json(); setError(j.error ?? "Error"); return; }
      setTxs(await res.json());
      setLoaded(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  // Reload when filters change after first load
  useEffect(() => {
    if (loaded && selectedCC) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCC, year, branch, source]);

  // Build CC options: sentinels first, then real CCs alphabetically
  const ccOptions: CCOption[] = [
    { kind: "sentinel", value: "unassigned", label: "Unassigned" },
    { kind: "sentinel", value: "conflict",   label: "Conflict" },
    ...costCenters.map(cc => ({ kind: "cc" as const, cc })),
  ];

  const selectedLabel =
    ccOptions.find(o => optionValue(o) === selectedCC)
      ? optionLabel(ccOptions.find(o => optionValue(o) === selectedCC)!)
      : selectedCC;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Cost Center Report</h2>
          <p className="text-sm text-gray-500">
            {loaded
              ? `${txs.length.toLocaleString()} transactions · ${selectedLabel}`
              : "Select a cost center and click Load"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={e => setYear(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-blue-400 focus:outline-none"
          >
            <option value="">All years</option>
            {(opts?.year ?? []).map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select
            value={branch}
            onChange={e => setBranch(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-blue-400 focus:outline-none"
          >
            <option value="">All branches</option>
            {(opts?.branch ?? []).map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <select
            value={source}
            onChange={e => setSource(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-blue-400 focus:outline-none"
          >
            <option value="">All sources</option>
            <option value="original">Original only</option>
            <option value="addback">Addback only</option>
          </select>
          <button
            onClick={() => load()}
            disabled={!selectedCC || loading}
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
          >
            {loading ? "Loading…" : "Load"}
          </button>
        </div>
      </div>

      {/* CC Selector pills */}
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Cost Center</p>
        <CCSelector options={ccOptions} value={selectedCC} onChange={setSelectedCC} />
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
