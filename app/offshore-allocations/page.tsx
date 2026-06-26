"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, AlertTriangle, Percent } from "lucide-react";
import { ReportFilter } from "@/components/report-filter";
import { SplitEditor } from "@/components/split-editor";
import { buildSplitsMap } from "@/lib/apply-splits";
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
): boolean {
  if (filterYears.length > 0 && !filterYears.some((y) => row.years.includes(Number(y)))) return false;
  if (filterMonths.length > 0 && !filterMonths.some((m) => row.months.includes(m))) return false;
  if (filterBranches.length > 0 && !filterBranches.some((b) => row.branches.includes(b))) return false;
  return true;
}

function BranchCell({ branches }: { branches: string[] }) {
  if (branches.length === 0) return <span className="text-gray-300">—</span>;
  if (branches.length === 1) return <span>{branches[0]}</span>;
  return <span title={branches.join(", ")}>{branches[0]} +{branches.length - 1}</span>;
}

function CCCell({ row, splitsMap }: { row: OAGroupRow; splitsMap: Map<string, SplitEntry[]> }) {
  const splits = row.assign_type && row.group_key
    ? splitsMap.get(`${row.assign_type}:${row.group_key}`)
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
        <span className="ml-1 text-amber-500 text-[10px]">
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
  splitsMap: Map<string, SplitEntry[]>;
  onEditAllocation: (row: OAGroupRow) => void;
}

function BlockTable({
  block, costCenters, filterYears, filterMonths, filterBranches, splitsMap, onEditAllocation,
}: BlockTableProps) {
  const visibleRows = useMemo(
    () => block.rows.filter((r) => rowVisible(r, filterYears, filterMonths, filterBranches)),
    [block.rows, filterYears, filterMonths, filterBranches],
  );

  if (visibleRows.length === 0) return null;

  const isRoster = block.block_type === "roster";
  const isOther  = block.block_type === "other";

  const headerBg   = isOther ? "bg-amber-50"   : isRoster ? "bg-violet-50" : "bg-blue-50";
  const headerText = isOther ? "text-amber-800" : isRoster ? "text-violet-800" : "text-blue-800";

  // Suppress unused costCenters lint (passed down for future use)
  void costCenters;

  return (
    <div className={[
      "rounded-xl border bg-white shadow-sm overflow-hidden",
      isOther ? "border-amber-200" : "border-gray-200",
    ].join(" ")}>
      <div className={`px-4 py-2.5 border-b ${isOther ? "border-amber-200" : "border-gray-200"} flex items-center justify-between ${headerBg}`}>
        <span className={`text-sm font-semibold flex items-center gap-2 ${headerText}`}>
          {isOther && <AlertTriangle size={14} className="text-amber-500" />}
          {block.block_key}
        </span>
        <span className="text-xs text-gray-400">{visibleRows.length} rows</span>
      </div>

      {isOther && (
        <div className="px-4 py-2 bg-amber-50/50 border-b border-amber-100 text-[11px] text-amber-700">
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
                    <td className="px-3 py-2 font-mono text-amber-700 whitespace-nowrap max-w-[180px] truncate"
                        title={row.raw_cd2s?.join(", ")}>
                      {row.raw_cd2s && row.raw_cd2s.length > 0
                        ? row.raw_cd2s.length === 1
                          ? row.raw_cd2s[0]
                          : `${row.raw_cd2s[0]} +${row.raw_cd2s.length - 1}`
                        : <span className="text-amber-300">(empty)</span>}
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
                      <button
                        onClick={() => onEditAllocation(row)}
                        className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:border-blue-300 hover:text-blue-700 whitespace-nowrap"
                      >
                        <Percent size={10} />
                        Edit allocation
                        <span className="text-gray-400 font-normal">({row.tx_count} tx)</span>
                      </button>
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
  const [blocks, setBlocks]           = useState<OABlock[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [allSplits, setAllSplits]     = useState<SplitEntry[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");

  const [filterYears, setFilterYears]       = useState<string[]>([]);
  const [filterMonths, setFilterMonths]     = useState<string[]>([]);
  const [filterBranches, setFilterBranches] = useState<string[]>([]);

  const [editingRow, setEditingRow] = useState<OAGroupRow | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [blocksRes, ccRes, splitsRes] = await Promise.all([
        fetch("/api/offshore-allocations"),
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
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

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

  const totalTx = useMemo(
    () => blocks.reduce((sum, b) => sum + b.rows.reduce((s, r) => s + r.tx_count, 0), 0),
    [blocks],
  );

  const splitsMap = useMemo(() => buildSplitsMap(allSplits), [allSplits]);

  const hasFilters = filterYears.length > 0 || filterMonths.length > 0 || filterBranches.length > 0;

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
        <button
          onClick={fetchData}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <ReportFilter label="Year"   options={allYears}    selected={filterYears}    onChange={setFilterYears} />
        <ReportFilter label="Month"  options={allMonths}   selected={filterMonths}   onChange={setFilterMonths} />
        <ReportFilter label="Branch" options={allBranches} selected={filterBranches} onChange={setFilterBranches} />
        {hasFilters && (
          <button
            onClick={() => { setFilterYears([]); setFilterMonths([]); setFilterBranches([]); }}
            className="text-xs text-gray-400 hover:text-gray-600 underline"
          >
            Clear filters
          </button>
        )}
        {hasFilters && (
          <span className="text-xs text-amber-600 bg-amber-50 rounded px-2 py-0.5 border border-amber-100">
            Filters affect display only — allocations apply globally to all historical data
          </span>
        )}
      </div>

      {error && (
        <p className="rounded-lg border border-red-100 bg-red-50 px-4 py-2 text-sm text-red-600 shrink-0">
          {error}
        </p>
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
              splitsMap={splitsMap}
              onEditAllocation={setEditingRow}
            />
          ))
        )}
      </div>

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
