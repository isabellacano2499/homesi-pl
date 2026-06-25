"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, RefreshCw } from "lucide-react";
import { ReportFilter } from "@/components/report-filter";
import type { CostCenter, VendorSummary } from "@/types";

const MONTH_ORDER = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function sortMonths(arr: string[]): string[] {
  return [...arr].sort((a, b) => MONTH_ORDER.indexOf(a) - MONTH_ORDER.indexOf(b));
}

type Pending = {
  vendorKey: string;
  vendorName: string;
  txCount: number;
  ccId: string;
  ccName: string;
};

export default function VendorsPage() {
  // ── Options from first unfiltered load ──────────────────────────────────────
  const [allBranches, setAllBranches] = useState<string[]>([]);
  const [allMonths, setAllMonths]     = useState<string[]>([]);
  const [allYears, setAllYears]       = useState<string[]>([]);

  // ── Filters ──────────────────────────────────────────────────────────────────
  const [filterBranches, setFilterBranches] = useState<string[]>([]);
  const [filterMonths, setFilterMonths]     = useState<string[]>([]);
  const [filterYears, setFilterYears]       = useState<string[]>([]);

  // ── Data ──────────────────────────────────────────────────────────────────────
  const [vendors, setVendors] = useState<VendorSummary[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [query, setQuery]     = useState("");
  const [rowCcId, setRowCcId] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Pending | null>(null);
  const [saving, setSaving]   = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  // ── Fetch cost centers ──────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/cost-centers")
      .then((r) => r.json())
      .then((data: CostCenter[]) => setCostCenters(data))
      .catch(console.error);
  }, []);

  // ── Fetch vendors ─────────────────────────────────────────────────────────
  const fetchVendors = useCallback(async (
    branches: string[], months: string[], years: string[], isInitial = false,
  ) => {
    setLoading(true); setError(""); setSaveMsg("");
    try {
      const p = new URLSearchParams();
      branches.forEach((b) => p.append("branch", b));
      months.forEach((m) => p.append("month", m));
      years.forEach((y) => p.append("year", y));
      const res = await fetch(`/api/vendors?${p}`);
      if (!res.ok) { const j = await res.json(); setError(j.error ?? "Failed to load"); return; }
      const data = await res.json() as VendorSummary[];
      setVendors(data);
      if (isInitial) {
        const bs = [...new Set(data.flatMap((v) => v.branches))].sort();
        const ms = sortMonths([...new Set(data.flatMap((v) => v.months))]);
        const ys = [...new Set(data.flatMap((v) => v.years))].sort((a, b) => Number(a) - Number(b));
        setAllBranches(bs); setAllMonths(ms); setAllYears(ys);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => { fetchVendors([], [], [], true); }, [fetchVendors]);

  // Reload when filters change (skip initial)
  const filtersKey = `${filterBranches.join("|")}||${filterMonths.join("|")}||${filterYears.join("|")}`;
  const isInitialFilters = filterBranches.length === 0 && filterMonths.length === 0 && filterYears.length === 0;
  useEffect(() => {
    if (isInitialFilters) return; // already loaded by initial effect
    fetchVendors(filterBranches, filterMonths, filterYears, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey]);

  // ── Client-side search ────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!query.trim()) return vendors;
    const q = query.toLowerCase();
    return vendors.filter((v) => v.vendor.toLowerCase().includes(q));
  }, [vendors, query]);

  // ── Assign CC ─────────────────────────────────────────────────────────────

  function startAssign(v: VendorSummary) {
    const ccId = rowCcId[v.vendor_key];
    if (!ccId) return;
    const cc = costCenters.find((c) => c.id === ccId);
    if (!cc) return;
    setPending({ vendorKey: v.vendor_key, vendorName: v.vendor, txCount: v.tx_count, ccId, ccName: cc.name });
  }

  async function confirmAssign() {
    if (!pending) return;
    setSaving(true); setSaveMsg("");
    try {
      const body: Record<string, unknown> = {
        vendor_key: pending.vendorKey,
        cost_center_id: pending.ccId,
      };
      if (filterBranches.length > 0) body.branch = filterBranches;
      if (filterMonths.length > 0) body.month = filterMonths;
      if (filterYears.length > 0) body.year = filterYears;

      const res = await fetch("/api/vendors/assign-cc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json();
        setSaveMsg(`Error: ${j.error ?? "Unknown error"}`);
        return;
      }
      const { updated } = await res.json() as { updated: number };
      setSaveMsg(`✓ Assigned ${updated} transaction${updated !== 1 ? "s" : ""} to ${pending.ccName}`);
      setRowCcId((prev) => { const n = { ...prev }; delete n[pending.vendorKey]; return n; });
      setPending(null);
      await fetchVendors(filterBranches, filterMonths, filterYears, false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-32px)]">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Vendors</h2>
          <p className="text-sm text-gray-500">
            {loading ? "Loading…" : `${filtered.length} of ${vendors.length} vendors`}
          </p>
        </div>
        <button
          onClick={() => fetchVendors(filterBranches, filterMonths, filterYears, false)}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Filters + search */}
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <ReportFilter label="Branch" options={allBranches} selected={filterBranches}
          onChange={(v) => { setFilterBranches(v); if (!loading) fetchVendors(v, filterMonths, filterYears, false); }} />
        <ReportFilter label="Month" options={allMonths} selected={filterMonths}
          onChange={(v) => { setFilterMonths(v); if (!loading) fetchVendors(filterBranches, v, filterYears, false); }} />
        <ReportFilter label="Year" options={allYears} selected={filterYears}
          onChange={(v) => { setFilterYears(v); if (!loading) fetchVendors(filterBranches, filterMonths, v, false); }} />

        <div className="relative flex-1 max-w-xs ml-auto">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text" placeholder="Search vendors…"
            value={query} onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-8 pr-3 text-sm focus:border-blue-400 focus:outline-none"
          />
        </div>
      </div>

      {/* Status messages */}
      {error && (
        <p className="rounded-lg border border-red-100 bg-red-50 px-4 py-2 text-sm text-red-600 shrink-0">{error}</p>
      )}
      {saveMsg && (
        <p className="rounded-lg border border-green-100 bg-green-50 px-4 py-2 text-sm text-green-700 shrink-0">{saveMsg}</p>
      )}

      {/* Confirm modal */}
      {pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xl w-[360px]">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Assign Cost Center</h3>
            <p className="text-sm text-gray-600 mb-4">
              Assign <span className="font-medium text-gray-900">{pending.txCount.toLocaleString()} transaction{pending.txCount !== 1 ? "s" : ""}</span> for{" "}
              <span className="font-medium text-gray-900">&quot;{pending.vendorName}&quot;</span> to{" "}
              <span className="font-medium text-blue-700">{pending.ccName}</span>?
              {(filterBranches.length > 0 || filterMonths.length > 0 || filterYears.length > 0) && (
                <span className="block mt-1 text-xs text-gray-400">
                  Applies only to transactions matching your active filters.
                </span>
              )}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setPending(null)} disabled={saving}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40">
                Cancel
              </button>
              <button onClick={confirmAssign} disabled={saving}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40">
                {saving ? "Saving…" : "Yes, Assign"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 rounded-xl border border-gray-200 bg-white shadow-sm overflow-auto min-h-0">
        {loading ? (
          <div className="py-12 text-center text-gray-400">
            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600" />
            <p className="mt-2 text-xs">Loading vendor data…</p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-400">No vendors found.</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-gray-50">
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="px-4 py-3 font-medium whitespace-nowrap">Vendor</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap">Total Tx</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap">Unassigned</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap">Branches</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap">GL Code / Name</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap">Current CCs</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap">Assign CC</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((v) => (
                <tr key={v.vendor_key} className="border-b border-gray-50 hover:bg-gray-50 align-middle">
                  {/* Vendor name */}
                  <td className="px-4 py-2.5 font-medium text-gray-900 max-w-[200px] truncate whitespace-nowrap">
                    {v.vendor || <span className="text-gray-400 italic">—</span>}
                  </td>

                  {/* Total tx */}
                  <td className="px-4 py-2.5 text-gray-600 tabular-nums">{v.tx_count}</td>

                  {/* Unassigned */}
                  <td className="px-4 py-2.5">
                    {v.tx_count_unassigned > 0
                      ? <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-700">{v.tx_count_unassigned}</span>
                      : <span className="text-gray-300">—</span>}
                  </td>

                  {/* Branches */}
                  <td className="px-4 py-2.5">
                    <span className="inline-flex flex-wrap gap-1">
                      {v.branches.map((b) => (
                        <span key={b} className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-700">{b}</span>
                      ))}
                      {v.branches.length === 0 && <span className="text-gray-300">—</span>}
                    </span>
                  </td>

                  {/* GL items */}
                  <td className="px-4 py-2.5">
                    <div className="flex flex-col gap-0.5">
                      {v.gl_items.slice(0, 3).map((g) => (
                        <span key={g.gl_code} className="flex gap-1.5">
                          <span className="font-mono text-gray-700">{g.gl_code}</span>
                          <span className="text-gray-400 truncate max-w-[160px]">{g.gl_name}</span>
                        </span>
                      ))}
                      {v.gl_items.length > 3 && (
                        <span className="text-gray-400">+{v.gl_items.length - 3} more</span>
                      )}
                      {v.gl_items.length === 0 && <span className="text-gray-300">—</span>}
                    </div>
                  </td>

                  {/* Current CCs */}
                  <td className="px-4 py-2.5">
                    <span className="inline-flex flex-wrap gap-1">
                      {v.cost_centers.map((cc) => (
                        <span key={cc} className={[
                          "rounded px-1.5 py-0.5 font-medium",
                          cc === "Unassigned" ? "bg-gray-100 text-gray-500" :
                          cc === "Conflict" ? "bg-amber-100 text-amber-700" :
                          "bg-green-50 text-green-700",
                        ].join(" ")}>{cc}</span>
                      ))}
                      {v.cost_centers.length === 0 && <span className="text-gray-300">—</span>}
                    </span>
                  </td>

                  {/* Assign CC column */}
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <select
                        value={rowCcId[v.vendor_key] ?? ""}
                        onChange={(e) => setRowCcId((prev) => ({ ...prev, [v.vendor_key]: e.target.value }))}
                        className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:border-blue-400 focus:outline-none max-w-[160px]"
                      >
                        <option value="">Choose CC…</option>
                        {costCenters.map((cc) => (
                          <option key={cc.id} value={cc.id}>{cc.name}</option>
                        ))}
                      </select>
                      {rowCcId[v.vendor_key] && (
                        <button
                          onClick={() => startAssign(v)}
                          className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 whitespace-nowrap"
                        >
                          Assign
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
