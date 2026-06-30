"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, RefreshCw, AlertTriangle, Percent, Search, X, RotateCcw, ShieldCheck, Wand2 } from "lucide-react";
import { downloadCSV } from "@/lib/csv";
import { ReportFilter } from "@/components/report-filter";
import { SplitEditor } from "@/components/split-editor";
import { buildSplitsMap } from "@/lib/apply-splits";
import { useActiveBranches } from "@/components/branch-filter-provider";
import { SplitDisplay } from "@/components/split-display";
import type { SplitEntry } from "@/lib/apply-splits";
import type { CostCenter } from "@/types";
import type { OABlock, OAGroupRow } from "@/app/api/offshore-allocations/route";

const MONTH_ORDER = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function rowVisible(
  row: OAGroupRow,
  filterYears: string[],
  filterMonths: string[],
  filterBranches: string[],
  filterCategories: string[],
  filterPositions: string[],
  filterVendors: string[],
  search: string,
): boolean {
  if (filterYears.length > 0 && !filterYears.some((y) => row.years.includes(Number(y)))) return false;
  if (filterMonths.length > 0 && !filterMonths.some((m) => row.months.includes(m))) return false;
  if (filterBranches.length > 0 && !filterBranches.some((b) => row.branches.includes(b))) return false;
  if (filterCategories.length > 0 && !filterCategories.includes(row.category ?? "")) return false;
  if (filterPositions.length > 0 && !filterPositions.includes(row.position ?? "")) return false;
  if (filterVendors.length > 0 && !filterVendors.includes(row.vendor ?? "")) return false;
  if (search) {
    const q = search.toLowerCase();
    const match = [
      row.check_description_3,
      row.category,
      row.position,
      row.vendor,
      row.branch_allocation,
      ...row.branches,
      ...(row.raw_cd2s ?? []),
    ].some((v) => v?.toLowerCase().includes(q));
    if (!match) return false;
  }
  return true;
}

function BranchCell({ branches }: { branches: string[] }) {
  if (branches.length === 0) return <span className="text-gray-300">—</span>;
  if (branches.length === 1) return <span>{branches[0]}</span>;
  return <span title={branches.join(", ")}>{branches[0]} +{branches.length - 1}</span>;
}

function normGroupKey(assignType: string | null, groupKey: string): string {
  return assignType === "vendor" ? groupKey.trim().replace(/\s+/g, " ") : groupKey;
}

function CCCell({ row, splitsMap }: { row: OAGroupRow; splitsMap: Map<string, SplitEntry[]> }) {
  const splits = row.assign_type && row.group_key
    ? splitsMap.get(`${row.assign_type}:${normGroupKey(row.assign_type, row.group_key)}`)
    : undefined;

  const hasSplits = splits && splits.length > 0;
  const hasLabels = row.cc_labels.length > 0;

  return (
    <>
      {hasSplits ? (
        <SplitDisplay splits={splits} />
      ) : hasLabels ? (
        <span className="inline-flex flex-wrap gap-1">
          {row.cc_labels.map((name) => (
            <span key={name} className="rounded bg-green-50 px-1.5 py-0.5 font-medium text-green-700">
              {name}
            </span>
          ))}
        </span>
      ) : (
        <span className="text-gray-300 text-[11px]">Unassigned</span>
      )}
      {row.tx_count_unassigned > 0 && (hasSplits || hasLabels) && (
        <span className="ml-1 text-gray-400 text-[10px]">
          ({row.tx_count_unassigned} unassigned)
        </span>
      )}
    </>
  );
}

// ─── Block table ──────────────────────────────────────────────────────────────

interface BlockTableProps {
  block: OABlock;
  costCenters: CostCenter[];
  filterYears: string[];
  filterMonths: string[];
  filterBranches: string[];
  filterCategories: string[];
  filterPositions: string[];
  filterVendors: string[];
  search: string;
  splitsMap: Map<string, SplitEntry[]>;
  unassigning: string | null;
  unassignBusy: boolean;
  onEditAllocation: (row: OAGroupRow) => void;
  onUnassign: (row: OAGroupRow) => void;
  onUnassignConfirm: (row: OAGroupRow) => void;
  onUnassignCancel: () => void;
}

function BlockTable({
  block, costCenters, filterYears, filterMonths, filterBranches,
  filterCategories, filterPositions, filterVendors, search,
  splitsMap, unassigning, unassignBusy, onEditAllocation, onUnassign, onUnassignConfirm, onUnassignCancel,
}: BlockTableProps) {
  const visibleRows = useMemo(
    () => block.rows.filter((r) => rowVisible(r, filterYears, filterMonths, filterBranches, filterCategories, filterPositions, filterVendors, search)),
    [block.rows, filterYears, filterMonths, filterBranches, filterCategories, filterPositions, filterVendors, search],
  );

  if (visibleRows.length === 0) return null;

  const isRoster = block.block_type === "roster";
  const isOther  = block.block_type === "other";

  const headerBg   = isOther ? "bg-gray-50"  : "bg-blue-50";
  const headerText = isOther ? "text-gray-700" : "text-blue-800";

  // Suppress unused costCenters lint (passed down for future use)
  void costCenters;

  return (
    <div className={[
      "rounded-xl border bg-white shadow-sm overflow-hidden",
      "border-gray-200",
    ].join(" ")}>
      <div className={`px-4 py-2.5 border-b border-gray-200 flex items-center justify-between ${headerBg}`}>
        <span className={`text-sm font-semibold flex items-center gap-2 ${headerText}`}>
          {isOther && <AlertTriangle size={14} className="text-gray-400" />}
          {block.block_key}
        </span>
        <span className="text-xs text-gray-400">{visibleRows.length} rows</span>
      </div>

      {isOther && (
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 text-[11px] text-gray-600">
          These transactions have an unexpected or missing Check Description 2 value. Review the source file for formatting errors.
        </div>
      )}

      <div className="overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr className="border-b border-gray-200 text-left text-gray-500">
              {isOther && <th className="px-3 py-2 font-medium whitespace-nowrap">Check Desc 2 (raw)</th>}
              <th className="px-3 py-2 font-medium whitespace-nowrap">Description 3</th>
              <th className="px-3 py-2 font-medium whitespace-nowrap">Branch</th>
              <th className="px-3 py-2 font-medium whitespace-nowrap">Category</th>
              <th className="px-3 py-2 font-medium whitespace-nowrap">Position</th>
              <th className="px-3 py-2 font-medium whitespace-nowrap">Vendor</th>
              <th className="px-3 py-2 font-medium whitespace-nowrap">Branch Allocation</th>
              <th className="px-3 py-2 font-medium whitespace-nowrap">Cost Center</th>
              <th className="px-3 py-2 font-medium whitespace-nowrap min-w-[140px]">Allocation</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const canAssign = row.assign_type !== null;
              return (
                <tr key={row.group_key} className="border-b border-gray-50 hover:bg-gray-50 align-middle">
                  {isOther && (
                    <td className="px-3 py-2 font-mono text-gray-600 whitespace-nowrap max-w-[180px] truncate"
                        title={row.raw_cd2s?.join(", ")}>
                      {row.raw_cd2s && row.raw_cd2s.length > 0
                        ? row.raw_cd2s.length === 1
                          ? row.raw_cd2s[0]
                          : `${row.raw_cd2s[0]} +${row.raw_cd2s.length - 1}`
                        : <span className="text-gray-300">(empty)</span>}
                    </td>
                  )}
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap max-w-[180px] truncate">
                    {row.check_description_3 ?? <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                    <BranchCell branches={row.branches} />
                  </td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                    {row.category ?? <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap max-w-[140px] truncate">
                    {row.position ?? <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap max-w-[140px] truncate">
                    {row.vendor ?? <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                    {row.branch_allocation ?? <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <CCCell row={row} splitsMap={splitsMap} />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {canAssign ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => onEditAllocation(row)}
                          className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:border-blue-300 hover:text-blue-700 whitespace-nowrap"
                        >
                          <Percent size={10} />
                          Edit allocation
                          <span className="text-gray-400 font-normal">({row.tx_count} tx)</span>
                        </button>
                        {/* Unassign — only when a split is already defined */}
                        {splitsMap.get(`${row.assign_type}:${normGroupKey(row.assign_type, row.group_key)}`) && (
                          unassigning === row.group_key ? (
                            <span className="flex items-center gap-1 text-[11px]">
                              <span className="text-red-600 font-medium">Remove?</span>
                              <button
                                onClick={() => onUnassignConfirm(row)}
                                disabled={unassignBusy}
                                className="rounded px-1.5 py-0.5 bg-red-600 text-white text-[10px] hover:bg-red-700 disabled:opacity-40"
                              >
                                Yes
                              </button>
                              <button
                                onClick={onUnassignCancel}
                                className="rounded px-1.5 py-0.5 border border-gray-200 text-gray-500 text-[10px] hover:bg-gray-50"
                              >
                                No
                              </button>
                            </span>
                          ) : (
                            <button
                              onClick={() => onUnassign(row)}
                              title="Remove this allocation"
                              className="rounded-lg border border-gray-100 px-2 py-1 text-[11px] text-red-400 hover:border-red-200 hover:text-red-600 whitespace-nowrap"
                            >
                              Unassign
                            </button>
                          )
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-300 text-[11px]" title="No vendor or description key to assign by">
                        — ({row.tx_count} tx)
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OffshoreAllocationsPage() {
  const { activeBranches } = useActiveBranches();
  const [blocks, setBlocks]           = useState<OABlock[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [allSplits, setAllSplits]     = useState<SplitEntry[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");

  const [filterYears, setFilterYears]           = useState<string[]>([]);
  const [filterMonths, setFilterMonths]         = useState<string[]>([]);
  const [filterBranches, setFilterBranches]     = useState<string[]>([]);
  const [filterCategories, setFilterCategories] = useState<string[]>([]);
  const [filterPositions, setFilterPositions]   = useState<string[]>([]);
  const [filterVendors, setFilterVendors]       = useState<string[]>([]);
  const [search, setSearch]                     = useState("");

  const [editingRow, setEditingRow]     = useState<OAGroupRow | null>(null);
  const [unassigning, setUnassigning]   = useState<string | null>(null); // group_key being confirmed
  const [unassignBusy, setUnassignBusy] = useState(false);

  // Re-evaluate with Rules state
  const [reevalCount,   setReevalCount]   = useState<number | null>(null);
  const [reevalDialog,  setReevalDialog]  = useState(false);
  const [reevalRunning, setReevalRunning] = useState(false);
  const [reevalResult,  setReevalResult]  = useState<{
    processed: number; assigned: number; conflicts: number; unassigned: number;
  } | null>(null);

  // Apply Existing Assignments state
  const [applyCount,   setApplyCount]   = useState<number | null>(null);
  const [applyDialog,  setApplyDialog]  = useState(false);
  const [applyRunning, setApplyRunning] = useState(false);
  const [applyResult,  setApplyResult]  = useState<{
    assigned: number; breakdown: { key: string; count: number }[];
  } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const p = new URLSearchParams();
      activeBranches.forEach(b => p.append("branch", b));
      const [blocksRes, ccRes, splitsRes] = await Promise.all([
        fetch(`/api/offshore-allocations${activeBranches.length > 0 ? `?${p}` : ""}`),
        fetch("/api/cost-centers"),
        fetch("/api/cc-allocation-splits"),
      ]);
      if (!blocksRes.ok) {
        const j = await blocksRes.json();
        setError(j.error ?? "Failed to load offshore allocations");
        return;
      }
      const [b, cc, splits] = await Promise.all([
        blocksRes.json(), ccRes.json(), splitsRes.json(),
      ]) as [OABlock[], CostCenter[], SplitEntry[]];
      setBlocks(b);
      setCostCenters(cc);
      setAllSplits(splits);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [activeBranches]);

  const loadReevalCount = useCallback(async () => {
    const res = await fetch("/api/offshore-allocations/reevaluate-manual");
    if (res.ok) { const j = await res.json(); setReevalCount(j.count ?? 0); }
  }, []);

  const loadApplyCount = useCallback(async () => {
    const res = await fetch("/api/offshore-allocations/apply-existing");
    if (res.ok) { const j = await res.json(); setApplyCount(j.count ?? 0); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { loadReevalCount(); }, [loadReevalCount]);
  useEffect(() => { loadApplyCount(); }, [loadApplyCount]);

  async function handleApplyExisting() {
    setApplyRunning(true);
    setApplyResult(null);
    try {
      const res = await fetch("/api/offshore-allocations/apply-existing", { method: "POST" });
      if (!res.ok) { const j = await res.json(); setError(j.error ?? "Apply failed"); return; }
      const result = await res.json();
      setApplyResult(result);
      setApplyDialog(false);
      await Promise.all([fetchData(), loadApplyCount()]);
    } finally {
      setApplyRunning(false);
    }
  }

  async function handleReeval() {
    setReevalRunning(true);
    setReevalResult(null);
    try {
      const res = await fetch("/api/offshore-allocations/reevaluate-manual", { method: "POST" });
      if (!res.ok) { const j = await res.json(); setError(j.error ?? "Re-evaluation failed"); return; }
      const result = await res.json();
      setReevalResult(result);
      setReevalDialog(false);
      await Promise.all([fetchData(), loadReevalCount()]);
    } finally {
      setReevalRunning(false);
    }
  }

  const allYears = useMemo(() => {
    const s = new Set<number>();
    blocks.forEach((b) => b.rows.forEach((r) => r.years.forEach((y) => s.add(y))));
    return [...s].sort((a, b) => a - b).map(String);
  }, [blocks]);

  const allMonths = useMemo(() => {
    const s = new Set<string>();
    blocks.forEach((b) => b.rows.forEach((r) => r.months.forEach((m) => s.add(m))));
    return MONTH_ORDER.filter((m) => s.has(m));
  }, [blocks]);

  const allBranches = useMemo(() => {
    const s = new Set<string>();
    blocks.forEach((b) => b.rows.forEach((r) => r.branches.forEach((br) => s.add(br))));
    return [...s].sort();
  }, [blocks]);

  const allCategories = useMemo(() => {
    const s = new Set<string>();
    blocks.forEach((b) => b.rows.forEach((r) => { if (r.category) s.add(r.category); }));
    return [...s].sort();
  }, [blocks]);

  const allPositions = useMemo(() => {
    const s = new Set<string>();
    blocks.forEach((b) => b.rows.forEach((r) => { if (r.position) s.add(r.position); }));
    return [...s].sort();
  }, [blocks]);

  const allVendors = useMemo(() => {
    const s = new Set<string>();
    blocks.forEach((b) => b.rows.forEach((r) => { if (r.vendor) s.add(r.vendor); }));
    return [...s].sort();
  }, [blocks]);

  const totalTx = useMemo(
    () => blocks.reduce((sum, b) => sum + b.rows.reduce((s, r) => s + r.tx_count, 0), 0),
    [blocks],
  );

  const splitsMap = useMemo(() => buildSplitsMap(allSplits), [allSplits]);

  const hasFilters = filterYears.length > 0 || filterMonths.length > 0 || filterBranches.length > 0
    || filterCategories.length > 0 || filterPositions.length > 0 || filterVendors.length > 0 || search.length > 0;

  function handleExport() {
    const visibleRows = blocks.flatMap((block) =>
      block.rows
        .filter((r) => rowVisible(r, filterYears, filterMonths, filterBranches, filterCategories, filterPositions, filterVendors, search))
        .map((r) => ({
          block:               block.block_key,
          check_description_3: r.check_description_3 ?? "",
          branches:            r.branches.join(", "),
          years:               r.years.join(", "),
          months:              r.months.join(", "),
          category:            r.category ?? "",
          position:            r.position ?? "",
          vendor:              r.vendor ?? "",
          branch_allocation:   r.branch_allocation ?? "",
          cc_labels:           r.cc_labels.join(", "),
          tx_count:            r.tx_count,
          tx_count_unassigned: r.tx_count_unassigned,
        }))
    );
    downloadCSV("offshore_allocations.csv", visibleRows, [
      { key: "block",               label: "Block" },
      { key: "check_description_3", label: "Description 3" },
      { key: "branches",            label: "Branches" },
      { key: "years",               label: "Years" },
      { key: "months",              label: "Months" },
      { key: "category",            label: "Category" },
      { key: "position",            label: "Position" },
      { key: "vendor",              label: "Vendor" },
      { key: "branch_allocation",   label: "Branch Allocation" },
      { key: "cc_labels",           label: "Cost Centers" },
      { key: "tx_count",            label: "Total Tx" },
      { key: "tx_count_unassigned", label: "Unassigned Tx" },
    ]);
  }

  return (
    <div className="flex flex-col gap-5 h-[calc(100vh-32px)]">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Offshore Allocations</h2>
          <p className="text-sm text-gray-500">
            {loading ? "Loading…" : `${totalTx.toLocaleString()} transactions`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!loading && blocks.length > 0 && (
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              <Download size={14} />
              Export CSV
            </button>
          )}
          <button
            onClick={() => { setApplyResult(null); setApplyDialog(true); }}
            disabled={loading || applyCount === 0}
            title={applyCount === 0 ? "No unassigned OA transactions matching existing assignments" : undefined}
            className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700 hover:bg-blue-100 disabled:opacity-40 disabled:cursor-default"
          >
            <Wand2 size={14} />
            Apply Existing
            {applyCount !== null && applyCount > 0 && (
              <span className="ml-0.5 rounded-full bg-blue-200 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800">
                {applyCount}
              </span>
            )}
          </button>
          <button
            onClick={() => { setReevalResult(null); setReevalDialog(true); }}
            disabled={loading || reevalCount === 0}
            title={reevalCount === 0 ? "No manually assigned OA transactions to re-evaluate" : undefined}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-default"
          >
            <RotateCcw size={14} />
            Re-evaluate with Rules
            {reevalCount !== null && reevalCount > 0 && (
              <span className="ml-0.5 rounded-full bg-gray-200 px-1.5 py-0.5 text-[10px] font-semibold text-gray-700">
                {reevalCount}
              </span>
            )}
          </button>
          <button
            onClick={fetchData}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2 shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          <ReportFilter label="Year"     options={allYears}      selected={filterYears}      onChange={setFilterYears} />
          <ReportFilter label="Month"    options={allMonths}     selected={filterMonths}     onChange={setFilterMonths} />
          <ReportFilter label="Branch"   options={allBranches}   selected={filterBranches}   onChange={setFilterBranches} />
          <ReportFilter label="Category" options={allCategories} selected={filterCategories} onChange={setFilterCategories} />
          <ReportFilter label="Position" options={allPositions}  selected={filterPositions}  onChange={setFilterPositions} />
          <ReportFilter label="Vendor"   options={allVendors}    selected={filterVendors}    onChange={setFilterVendors} />
          <div className="relative">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search description, vendor, position…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white pl-7 pr-7 py-1.5 text-sm text-gray-700 focus:border-blue-400 focus:outline-none min-w-[260px]"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X size={12} />
              </button>
            )}
          </div>
          {hasFilters && (
            <button
              onClick={() => { setFilterYears([]); setFilterMonths([]); setFilterBranches([]); setFilterCategories([]); setFilterPositions([]); setFilterVendors([]); setSearch(""); }}
              className="text-xs text-gray-400 hover:text-gray-600 underline"
            >
              Clear all
            </button>
          )}
        </div>
        {hasFilters && (
          <span className="text-xs text-gray-500 bg-gray-50 rounded px-2 py-0.5 border border-gray-200 w-fit">
            Filters affect display only — allocations apply globally to all historical data
          </span>
        )}
      </div>

      {error && (
        <p className="rounded-lg border border-red-100 bg-red-50 px-4 py-2 text-sm text-red-600 shrink-0">
          {error}
        </p>
      )}

      {applyResult && (
        <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 shrink-0">
          <div className="flex items-center gap-2">
            <Wand2 size={15} className="shrink-0 text-blue-600" />
            <span className="text-sm text-blue-800">
              Applied existing assignments to{" "}
              <strong>{applyResult.assigned}</strong> transaction{applyResult.assigned !== 1 ? "s" : ""}.
              {applyResult.breakdown.length > 0 && (
                <span className="ml-1 text-blue-600">
                  ({applyResult.breakdown.map((b) => `${b.key}: ${b.count}`).join(", ")})
                </span>
              )}
            </span>
          </div>
          <button onClick={() => setApplyResult(null)} className="ml-3 text-blue-400 hover:text-blue-600">
            <X size={14} />
          </button>
        </div>
      )}

      {reevalResult && (
        <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 shrink-0">
          <div className="flex items-center gap-2">
            <ShieldCheck size={15} className="shrink-0 text-gray-600" />
            <span className="text-sm text-gray-800">
              Re-evaluated <strong>{reevalResult.processed}</strong> transaction{reevalResult.processed !== 1 ? "s" : ""} —{" "}
              <strong>{reevalResult.assigned}</strong> assigned by rule,{" "}
              <strong>{reevalResult.conflicts}</strong> conflict{reevalResult.conflicts !== 1 ? "s" : ""},{" "}
              <strong>{reevalResult.unassigned}</strong> unassigned.
            </span>
          </div>
          <button onClick={() => setReevalResult(null)} className="ml-3 text-gray-400 hover:text-gray-600">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Blocks */}
      <div className="flex-1 min-h-0 overflow-auto space-y-5 pb-4">
        {loading ? (
          <div className="py-12 text-center text-gray-400">
            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600" />
            <p className="mt-2 text-xs">Loading…</p>
          </div>
        ) : blocks.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-400">
            No offshore allocation transactions found. Upload an Offshore Allocations file to get started.
          </p>
        ) : (
          blocks.map((block) => (
            <BlockTable
              key={block.block_key}
              block={block}
              costCenters={costCenters}
              filterYears={filterYears}
              filterMonths={filterMonths}
              filterBranches={filterBranches}
              filterCategories={filterCategories}
              filterPositions={filterPositions}
              filterVendors={filterVendors}
              search={search}
              splitsMap={splitsMap}
              unassigning={unassigning}
              unassignBusy={unassignBusy}
              onEditAllocation={setEditingRow}
              onUnassign={(row) => setUnassigning(row.group_key)}
              onUnassignConfirm={async (row) => {
                if (!row.assign_type) return;
                setUnassignBusy(true);
                await fetch(
                  `/api/cc-allocation-splits?type=${encodeURIComponent(row.assign_type)}&value=${encodeURIComponent(row.group_key)}`,
                  { method: "DELETE" }
                );
                setUnassignBusy(false);
                setUnassigning(null);
                fetchData();
              }}
              onUnassignCancel={() => setUnassigning(null)}
            />
          ))
        )}
      </div>

      {/* Re-evaluate with Rules confirmation dialog */}
      {reevalDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-xl">
            <div className="flex items-start gap-3 border-b border-gray-100 px-5 py-4">
              <RotateCcw size={18} className="mt-0.5 shrink-0 text-gray-600" />
              <div>
                <h3 className="text-base font-semibold text-gray-900">Re-evaluate with Rules</h3>
                <p className="mt-1 text-sm text-gray-600">
                  This will re-evaluate{" "}
                  <span className="font-semibold text-gray-900">{reevalCount}</span>{" "}
                  manually assigned Offshore Allocations transaction{reevalCount !== 1 ? "s" : ""} against
                  all current rules. Their current manual assignments may be overwritten.
                </p>
                <p className="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                  The global Re-apply All Rules continues to skip manual OA assignments — this is the
                  only place where they can be re-evaluated.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4">
              <button
                onClick={() => setReevalDialog(false)}
                disabled={reevalRunning}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleReeval}
                disabled={reevalRunning}
                className="flex items-center gap-2 rounded-lg bg-gray-700 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {reevalRunning && (
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                )}
                {reevalRunning
                  ? "Re-evaluating…"
                  : `Re-evaluate ${reevalCount} transaction${reevalCount !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Apply Existing Assignments confirmation dialog */}
      {applyDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-xl">
            <div className="flex items-start gap-3 border-b border-gray-100 px-5 py-4">
              <Wand2 size={18} className="mt-0.5 shrink-0 text-blue-600" />
              <div>
                <h3 className="text-base font-semibold text-gray-900">Apply Existing Assignments</h3>
                <p className="mt-1 text-sm text-gray-600">
                  Found{" "}
                  <span className="font-semibold text-gray-900">{applyCount}</span>{" "}
                  unassigned Offshore Allocations transaction{applyCount !== 1 ? "s" : ""} matching
                  existing manual assignments. Apply the same Cost Center assignments to these transactions?
                </p>
                <p className="mt-2 text-xs text-gray-400">
                  Only unassigned transactions will be affected. Transactions already assigned will not be changed.
                  Assignment origin will be set to "manual".
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4">
              <button
                onClick={() => setApplyDialog(false)}
                disabled={applyRunning}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyExisting}
                disabled={applyRunning}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {applyRunning && (
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                )}
                {applyRunning
                  ? "Applying…"
                  : `Apply to ${applyCount} transaction${applyCount !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Split editor modal */}
      {editingRow && editingRow.assign_type && (
        <SplitEditor
          assignType={editingRow.assign_type}
          assignValue={editingRow.group_key}
          displayName={editingRow.check_description_3 ?? editingRow.group_key}
          txCount={editingRow.tx_count}
          costCenters={costCenters}
          onClose={() => setEditingRow(null)}
          onSaved={() => {
            setEditingRow(null);
            fetchData(); // fetchData already reloads splits
          }}
        />
      )}
    </div>
  );
}
