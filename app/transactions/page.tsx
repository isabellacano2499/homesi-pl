"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { RefreshCw } from "lucide-react";
import { ColumnFilter } from "@/components/column-filter";
import type { PLTransaction, FilterOptionsResponse, TransactionTotals } from "@/types";

// ─── Virtual scroll constants ─────────────────────────────────────────────────

const ROW_H = 38;
const OVERSCAN = 25;

// ─── Filter state ─────────────────────────────────────────────────────────────

type FilterState = {
  month: string[];
  year: string[];
  gl_code: string[];
  gl_name: string[];
  branch: string[];
  vendor: string[];
  ref_numb: string[];
  cost_center: string[];
  source: string[];
  description: string;
  check_description_2: string[];
  check_description_3: string[];
  movement_min: string; movement_max: string;
};

const emptyFilters = (): FilterState => ({
  month: [], year: [], gl_code: [], gl_name: [], branch: [], vendor: [],
  ref_numb: [], cost_center: [], source: [],
  description: "",
  check_description_2: [], check_description_3: [],
  movement_min: "", movement_max: "",
});

type CCRef = { id: string; name: string };

function buildParams(uploadId: string, f: FilterState, ccList: CCRef[]): URLSearchParams {
  const p = new URLSearchParams({ all: "true" });
  if (uploadId) p.set("uploadId", uploadId);
  f.month.forEach((v) => p.append("month", v));
  f.year.forEach((v) => p.append("year", v));
  f.gl_code.forEach((v) => p.append("gl_code", v));
  f.gl_name.forEach((v) => p.append("gl_name", v));
  f.branch.forEach((v) => p.append("branch", v));
  f.vendor.forEach((v) => p.append("vendor", v));
  f.ref_numb.forEach((v) => p.append("ref_numb", v));
  f.check_description_2.forEach((v) => p.append("check_description_2", v));
  f.check_description_3.forEach((v) => p.append("check_description_3", v));
  if (f.description) p.set("description", f.description);
  if (f.movement_min) p.set("movement_min", f.movement_min);
  if (f.movement_max) p.set("movement_max", f.movement_max);
  for (const val of f.cost_center) {
    if (val === "Unassigned") p.append("cc_status", "unassigned");
    else if (val === "Conflict") p.append("cc_status", "conflict");
    else { const cc = ccList.find((c) => c.name === val); if (cc) p.append("cost_center_id", cc.id); }
  }
  for (const val of f.source) {
    if (val === "Original") p.append("source", "original");
    else if (val === "Addback") p.append("source", "addback");
    else if (val === "Offshore") p.append("source", "offshore_allocations");
  }
  return p;
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmt(v: unknown): string {
  const n = Number(v);
  if (v == null || v === "" || isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function mvColor(v: unknown): string {
  return (Number(v) || 0) >= 0 ? "text-green-700" : "text-red-700";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TotalCard({ label, value, colorClass }: { label: string; value: number; colorClass: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`mt-0.5 text-lg font-bold ${colorClass}`}>{fmt(value)}</p>
    </div>
  );
}

function TH({ label, children, className = "" }: { label?: string; children?: React.ReactNode; className?: string }) {
  return (
    <th className={`px-2 py-2.5 font-medium text-left ${className}`}>
      <span className="inline-flex items-center gap-0.5 whitespace-nowrap">{label}{children}</span>
    </th>
  );
}

function CCCell({ tx }: { tx: PLTransaction }) {
  if (tx.cost_center_status === "conflict")
    return <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">Conflict</span>;
  if (tx.cost_center_status === "assigned" && tx.cost_centers?.name)
    return <span className="text-gray-700 truncate">{tx.cost_centers.name}</span>;
  return <span className="text-gray-300">—</span>;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const COL_COUNT = 13;

export default function TransactionsPage() {
  const [uploads, setUploads] = useState<{ id: string; file_name: string }[]>([]);
  const [selectedUpload, setSelectedUpload] = useState("");
  const [filterOpts, setFilterOpts] = useState<FilterOptionsResponse>({
    month: [], year: [], gl_code: [], gl_name: [],
    branch: [], vendor: [], category_5: [], category_6: [], ref_numb: [],
    check_description_2: [], check_description_3: [],
    costCenters: [],
  });
  const [filters, setFilters] = useState<FilterState>(emptyFilters());

  const [rows, setRows] = useState<PLTransaction[]>([]);
  const [totals, setTotals] = useState<TransactionTotals>({ debit: 0, credit: 0, movement: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // ── Virtual scroll ──────────────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerH, setContainerH] = useState(600);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((es) => setContainerH(es[0].contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    setScrollTop(e.currentTarget.scrollTop);
  }

  const N = rows.length;
  const firstV = Math.floor(scrollTop / ROW_H);
  const lastV = Math.ceil((scrollTop + containerH) / ROW_H);
  const renderFrom = Math.max(0, firstV - OVERSCAN);
  const renderTo = Math.min(N, lastV + OVERSCAN);
  const visibleRows = rows.slice(renderFrom, renderTo);
  const topPad = renderFrom * ROW_H;
  const botPad = Math.max(0, (N - renderTo) * ROW_H);

  // ── Data loading ────────────────────────────────────────────────────────────

  useEffect(() => {
    fetch("/api/uploads")
      .then((r) => r.json())
      .then((data: { id: string; file_name: string; status: string }[]) =>
        setUploads(data.filter((u) => u.status === "completed"))
      )
      .catch(console.error);
  }, []);

  useEffect(() => {
    const params = selectedUpload ? `?uploadId=${selectedUpload}` : "";
    fetch(`/api/transactions/filter-options${params}`)
      .then((r) => r.json())
      .then((v: FilterOptionsResponse) => setFilterOpts(v))
      .catch(console.error);
  }, [selectedUpload]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError("");
    if (containerRef.current) { containerRef.current.scrollTop = 0; setScrollTop(0); }
    try {
      const p = buildParams(selectedUpload, filters, filterOpts.costCenters);
      const res = await fetch(`/api/transactions?${p}`);
      if (!res.ok) { const j = await res.json(); setError(j.error ?? "Request failed"); return; }
      const json = await res.json() as { data: PLTransaction[]; totals: TransactionTotals };
      setRows(json.data);
      setTotals(json.totals);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [selectedUpload, filters, filterOpts.costCenters]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  function setFilter<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  const ccFilterOptions = ["Unassigned", "Conflict", ...filterOpts.costCenters.map((cc) => cc.name)];

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-32px)]">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Transaction Review</h2>
          <p className="text-sm text-gray-500">
            {loading ? "Loading…" : `${N.toLocaleString()} rows`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedUpload}
            onChange={(e) => { setSelectedUpload(e.target.value); setFilters(emptyFilters()); }}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-400 focus:outline-none"
          >
            <option value="">All uploads</option>
            {uploads.map((u) => <option key={u.id} value={u.id}>{u.file_name}</option>)}
          </select>
          <button
            onClick={fetchAll}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {/* Totals — only movement shown */}
      <div className="grid grid-cols-1 gap-3 shrink-0 max-w-xs">
        <TotalCard label="Net movement" value={totals.movement}
          colorClass={totals.movement >= 0 ? "text-green-700" : "text-red-700"} />
      </div>

      {error && (
        <p className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600 shrink-0">{error}</p>
      )}

      {/* Virtual scroll table */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto rounded-xl border border-gray-200 bg-white shadow-sm min-h-0"
        onScroll={onScroll}
      >
        <table className="w-full text-xs table-fixed border-collapse">
          <colgroup>
            {/* CC | Month | Year | GL Code | GL Name | Branch | Desc | CD2 | CD3 | Vendor | Ref | Movement | Source */}
            {["100px","68px","44px","62px","120px","55px",undefined,"90px","90px","110px","65px","88px","62px"].map((w, i) => (
              <col key={i} style={w ? { width: w } : undefined} />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-20 bg-gray-50">
            <tr className="border-b border-gray-200 text-gray-500">
              <TH label="Cost Center">
                <ColumnFilter label="Cost Center" type="categorical"
                  options={ccFilterOptions} selected={filters.cost_center}
                  onChange={(v) => setFilter("cost_center", v)} />
              </TH>
              <TH label="Month">
                <ColumnFilter label="Month" type="categorical"
                  options={filterOpts.month} selected={filters.month}
                  onChange={(v) => setFilter("month", v)} />
              </TH>
              <TH label="Year">
                <ColumnFilter label="Year" type="categorical"
                  options={filterOpts.year} selected={filters.year}
                  onChange={(v) => setFilter("year", v)} />
              </TH>
              <TH label="GL Code">
                <ColumnFilter label="GL Code" type="categorical"
                  options={filterOpts.gl_code} selected={filters.gl_code}
                  onChange={(v) => setFilter("gl_code", v)} />
              </TH>
              <TH label="GL Name">
                <ColumnFilter label="GL Name" type="categorical"
                  options={filterOpts.gl_name} selected={filters.gl_name}
                  onChange={(v) => setFilter("gl_name", v)} />
              </TH>
              <TH label="Branch">
                <ColumnFilter label="Branch" type="categorical"
                  options={filterOpts.branch} selected={filters.branch}
                  onChange={(v) => setFilter("branch", v)} />
              </TH>
              <TH label="Description">
                <ColumnFilter label="Description" type="text"
                  value={filters.description}
                  onChange={(v) => setFilter("description", v)} />
              </TH>
              <TH label="Check Desc 2">
                <ColumnFilter label="Check Desc 2" type="categorical"
                  options={filterOpts.check_description_2 ?? []} selected={filters.check_description_2}
                  onChange={(v) => setFilter("check_description_2", v)} />
              </TH>
              <TH label="Check Desc 3">
                <ColumnFilter label="Check Desc 3" type="categorical"
                  options={filterOpts.check_description_3 ?? []} selected={filters.check_description_3}
                  onChange={(v) => setFilter("check_description_3", v)} />
              </TH>
              <TH label="Vendor">
                <ColumnFilter label="Vendor" type="categorical"
                  options={filterOpts.vendor} selected={filters.vendor}
                  onChange={(v) => setFilter("vendor", v)} />
              </TH>
              <TH label="Ref Numb">
                <ColumnFilter label="Ref Numb" type="categorical"
                  options={filterOpts.ref_numb} selected={filters.ref_numb}
                  onChange={(v) => setFilter("ref_numb", v)} />
              </TH>
              <TH label="Movement" className="text-right">
                <ColumnFilter label="Movement" type="numeric"
                  min={filters.movement_min} max={filters.movement_max}
                  onChange={(min, max) => { setFilter("movement_min", min); setFilter("movement_max", max); }} />
              </TH>
              <TH label="Source">
                <ColumnFilter label="Source" type="categorical"
                  options={["Original", "Addback", "Offshore"]} selected={filters.source}
                  onChange={(v) => setFilter("source", v)} />
              </TH>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr style={{ height: 200 }}>
                <td colSpan={COL_COUNT} className="text-center align-middle text-gray-400">
                  <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600" />
                  <span className="ml-2">Loading all transactions…</span>
                </td>
              </tr>
            ) : N === 0 ? (
              <tr style={{ height: 120 }}>
                <td colSpan={COL_COUNT} className="text-center align-middle text-gray-400">
                  No transactions found with the current filters.
                </td>
              </tr>
            ) : (
              <>
                {topPad > 0 && (
                  <tr aria-hidden="true"><td colSpan={COL_COUNT} style={{ height: topPad, padding: 0 }} /></tr>
                )}
                {visibleRows.map((tx) => (
                  <tr
                    key={tx.id}
                    style={{ height: ROW_H }}
                    className={[
                      "border-b border-gray-50 hover:bg-blue-50/20",
                      !tx.category_1 ? "bg-amber-50/30" : "",
                    ].join(" ")}
                  >
                    <td className="px-2 py-0 overflow-hidden"><CCCell tx={tx} /></td>
                    <td className="px-2 py-0 text-gray-700 overflow-hidden whitespace-nowrap">{tx.month ?? "—"}</td>
                    <td className="px-2 py-0 text-gray-700 overflow-hidden whitespace-nowrap">{tx.year ?? "—"}</td>
                    <td className="px-2 py-0 font-mono text-gray-800 overflow-hidden whitespace-nowrap">{tx.gl_code ?? "—"}</td>
                    <td className="px-2 py-0 text-gray-700 overflow-hidden whitespace-nowrap truncate">{tx.gl_name ?? "—"}</td>
                    <td className="px-2 py-0 text-gray-700 overflow-hidden whitespace-nowrap">{tx.branch ?? "—"}</td>
                    <td className="px-2 py-0 text-gray-600 overflow-hidden whitespace-nowrap truncate">{tx.check_description ?? "—"}</td>
                    <td className="px-2 py-0 text-sky-700 overflow-hidden whitespace-nowrap truncate">{tx.check_description_2 ?? <span className="text-gray-300">—</span>}</td>
                    <td className="px-2 py-0 text-sky-600 overflow-hidden whitespace-nowrap truncate">{tx.check_description_3 ?? <span className="text-gray-300">—</span>}</td>
                    <td className="px-2 py-0 text-gray-600 overflow-hidden whitespace-nowrap truncate">{tx.vendor ?? "—"}</td>
                    <td className="px-2 py-0 font-mono text-gray-600 overflow-hidden whitespace-nowrap">{tx.ref_numb ?? "—"}</td>
                    <td className={`px-2 py-0 text-right font-mono overflow-hidden whitespace-nowrap ${mvColor(tx.movement)}`}>{fmt(tx.movement)}</td>
                    <td className="px-2 py-0 overflow-hidden whitespace-nowrap">
                      {tx.source === "addback"
                        ? <span className="rounded bg-purple-100 px-1 py-0.5 text-[10px] font-medium text-purple-700">Addback</span>
                        : tx.source === "offshore_allocations"
                          ? <span className="rounded bg-blue-100 px-1 py-0.5 text-[10px] font-medium text-blue-700">Offshore</span>
                          : <span className="text-gray-400 text-[10px]">Original</span>}
                    </td>
                  </tr>
                ))}
                {botPad > 0 && (
                  <tr aria-hidden="true"><td colSpan={COL_COUNT} style={{ height: botPad, padding: 0 }} /></tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
