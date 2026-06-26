"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Check } from "lucide-react";
import { ReportFilter } from "@/components/report-filter";
import type { CostCenter } from "@/types";
import type { OABlock, OAGroupRow } from "@/app/api/offshore-allocations/route";

const MONTH_ORDER = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

// ─── Confirm dialog ───────────────────────────────────────────────────────────

interface ConfirmState {
  open: boolean;
  type: "description3" | "vendor";
  value: string;
  ccId: string;
  ccName: string;
  txCount: number;
}

const CONFIRM_CLOSED: ConfirmState = {
  open: false, type: "vendor", value: "", ccId: "", ccName: "", txCount: 0,
};

// ─── Block table ──────────────────────────────────────────────────────────────

interface BlockTableProps {
  block: OABlock;
  costCenters: CostCenter[];
  filterYears: string[];
  filterMonths: string[];
  filterBranches: string[];
  rowCcId: Record<string, string>;
  onCcChange: (groupKey: string, ccId: string) => void;
  onAssign: (row: OAGroupRow, ccId: string, ccName: string) => void;
  assigning: string | null;
}

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

function BlockTable({
  block, costCenters, filterYears, filterMonths, filterBranches,
  rowCcId, onCcChange, onAssign, assigning,
}: BlockTableProps) {
  const visibleRows = useMemo(
    () => block.rows.filter((r) => rowVisible(r, filterYears, filterMonths, filterBranches)),
    [block.rows, filterYears, filterMonths, filterBranches],
  );

  if (visibleRows.length === 0) return null;

  const isRoster = block.block_type === "roster";

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Block header */}
      <div className={[
        "px-4 py-2.5 border-b border-gray-200 flex items-center justify-between",
        isRoster ? "bg-violet-50" : "bg-blue-50",
      ].join(" ")}>
        <span className={[
          "text-sm font-semibold",
          isRoster ? "text-violet-800" : "text-blue-800",
        ].join(" ")}>
          {block.block_key}
        </span>
        <span className="text-xs text-gray-400">{visibleRows.length} rows</span>
      </div>

      <div className="overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="px-3 py-2 font-medium whitespace-nowrap">Description 3</th>
              <th className="px-3 py-2 font-medium whitespace-nowrap">Branch</th>
              <th className="px-3 py-2 font-medium whitespace-nowrap">Category</th>
              <th className="px-3 py-2 font-medium whitespace-nowrap">Position</th>
              <th className="px-3 py-2 font-medium whitespace-nowrap">Vendor</th>
              <th className="px-3 py-2 font-medium whitespace-nowrap">Branch Allocation</th>
              <th className="px-3 py-2 font-medium whitespace-nowrap">Cost Center</th>
              <th className="px-3 py-2 font-medium whitespace-nowrap min-w-[220px]">Assign CC</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const selectedCcId = rowCcId[row.group_key] ?? "";
              const isAssigning = assigning === row.group_key;
              return (
                <tr key={row.group_key} className="border-b border-gray-50 hover:bg-gray-50 align-middle">
                  {/* Description 3 */}
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap max-w-[180px] truncate">
                    {row.check_description_3 ?? <span className="text-gray-300">—</span>}
                  </td>
                  {/* Branch */}
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                    {row.branches.length === 0
                      ? <span className="text-gray-300">—</span>
                      : row.branches.length === 1
                        ? row.branches[0]
                        : <span title={row.branches.join(", ")}>{row.branches[0]} +{row.branches.length - 1}</span>}
                  </td>
                  {/* Category */}
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                    {row.category ?? <span className="text-gray-300">—</span>}
                  </td>
                  {/* Position */}
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap max-w-[140px] truncate">
                    {row.position ?? <span className="text-gray-300">—</span>}
                  </td>
                  {/* Vendor */}
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap max-w-[140px] truncate">
                    {row.vendor ?? <span className="text-gray-300">—</span>}
                  </td>
                  {/* Branch Allocation */}
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                    {row.branch_allocation ?? <span className="text-gray-300">—</span>}
                  </td>
                  {/* Current CC */}
                  <td className="px-3 py-2 whitespace-nowrap">
                    {row.cc_labels.length > 0 ? (
                      <span className="inline-flex flex-wrap gap-1">
                        {row.cc_labels.map((name) => (
                          <span key={name}
                                className="rounded bg-green-50 px-1.5 py-0.5 font-medium text-green-700">
                            {name}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-[11px]">Unassigned</span>
                    )}
                    {row.tx_count_unassigned > 0 && row.cc_labels.length > 0 && (
                      <span className="ml-1 text-amber-500 text-[10px]">
                        ({row.tx_count_unassigned} unassigned)
                      </span>
                    )}
                  </td>
                  {/* Assign CC */}
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <select
                        value={selectedCcId}
                        onChange={(e) => onCcChange(row.group_key, e.target.value)}
                        className="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400 min-w-[120px]"
                      >
                        <option value="">Select CC…</option>
                        {costCenters.map((cc) => (
                          <option key={cc.id} value={cc.id}>{cc.name}</option>
                        ))}
                      </select>
                      <button
                        disabled={!selectedCcId || isAssigning}
                        onClick={() => {
                          const cc = costCenters.find((c) => c.id === selectedCcId);
                          if (cc) onAssign(row, selectedCcId, cc.name);
                        }}
                        className="flex items-center gap-1 rounded bg-blue-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                      >
                        {isAssigning ? (
                          <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        ) : (
                          <Check size={11} />
                        )}
                        Assign
                      </button>
                      <span className="text-gray-400 text-[10px] whitespace-nowrap">
                        {row.tx_count} tx
                      </span>
                    </div>
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
  const [blocks, setBlocks] = useState<OABlock[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [filterYears, setFilterYears] = useState<string[]>([]);
  const [filterMonths, setFilterMonths] = useState<string[]>([]);
  const [filterBranches, setFilterBranches] = useState<string[]>([]);

  const [rowCcId, setRowCcId] = useState<Record<string, string>>({});
  const [assigning, setAssigning] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(CONFIRM_CLOSED);

  const fetchData = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [blocksRes, ccRes] = await Promise.all([
        fetch("/api/offshore-allocations"),
        fetch("/api/cost-centers"),
      ]);
      if (!blocksRes.ok) {
        const j = await blocksRes.json();
        setError(j.error ?? "Failed to load offshore allocations");
        return;
      }
      const [b, cc] = await Promise.all([blocksRes.json(), ccRes.json()]) as [OABlock[], CostCenter[]];
      setBlocks(b);
      setCostCenters(cc);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Derive available filter options from all data
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

  // CC assignment handlers
  function handleCcChange(groupKey: string, ccId: string) {
    setRowCcId((prev) => ({ ...prev, [groupKey]: ccId }));
  }

  function handleAssignClick(row: OAGroupRow, ccId: string, ccName: string, blockType: "roster" | "vendor") {
    setConfirm({
      open: true,
      type: blockType === "roster" ? "description3" : "vendor",
      value: row.group_key,
      ccId,
      ccName,
      txCount: row.tx_count,
    });
  }

  async function handleConfirmAssign() {
    const { type, value, ccId } = confirm;
    setConfirm(CONFIRM_CLOSED);
    setAssigning(value);
    try {
      const res = await fetch("/api/offshore-allocations/assign-cc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, value, cost_center_id: ccId }),
      });
      if (!res.ok) {
        const j = await res.json();
        setError(j.error ?? "Assignment failed");
        return;
      }
      await fetchData();
    } catch (e) {
      setError(String(e));
    } finally {
      setAssigning(null);
    }
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
        <ReportFilter
          label="Year"
          options={allYears}
          selected={filterYears}
          onChange={setFilterYears}
        />
        <ReportFilter
          label="Month"
          options={allMonths}
          selected={filterMonths}
          onChange={setFilterMonths}
        />
        <ReportFilter
          label="Branch"
          options={allBranches}
          selected={filterBranches}
          onChange={setFilterBranches}
        />
        {(filterYears.length > 0 || filterMonths.length > 0 || filterBranches.length > 0) && (
          <button
            onClick={() => { setFilterYears([]); setFilterMonths([]); setFilterBranches([]); }}
            className="text-xs text-gray-400 hover:text-gray-600 underline"
          >
            Clear filters
          </button>
        )}
        {(filterYears.length > 0 || filterMonths.length > 0 || filterBranches.length > 0) && (
          <span className="text-xs text-amber-600 bg-amber-50 rounded px-2 py-0.5 border border-amber-100">
            Filters affect display only — CC assignment applies globally to all historical data
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
              rowCcId={rowCcId}
              onCcChange={handleCcChange}
              onAssign={(row, ccId, ccName) =>
                handleAssignClick(row, ccId, ccName, block.block_type)
              }
              assigning={assigning}
            />
          ))
        )}
      </div>

      {/* Confirm dialog */}
      {confirm.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-bold text-gray-900 mb-2">Confirm Assignment</h3>
            <p className="text-sm text-gray-600 mb-1">
              Assign <span className="font-semibold text-blue-700">{confirm.ccName}</span> to
            </p>
            <p className="text-sm font-medium text-gray-800 mb-3 truncate">
              {confirm.value}
            </p>
            <p className="text-sm text-gray-500 mb-5">
              This will update{" "}
              <span className="font-bold text-gray-800">{confirm.txCount.toLocaleString()} transaction{confirm.txCount !== 1 ? "s" : ""}</span>{" "}
              across all historical data regardless of active filters.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirm(CONFIRM_CLOSED)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAssign}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Assign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
