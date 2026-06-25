"use client";

import { useEffect, useState, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { Pagination } from "@/components/pagination";
import { ColumnFilter } from "@/components/column-filter";
import type { PLTransaction, PLUpload, TransactionsResponse, FilterOptionsResponse } from "@/types";

const PAGE_SIZE = 100;

// ─── Filter state ─────────────────────────────────────────────────────────────

type FilterState = {
  month: string[];
  year: string[];
  gl_code: string[];
  gl_name: string[];
  branch: string[];
  vendor: string[];
  ref_numb: string[];
  cost_center: string[]; // CC names + "Unassigned" / "Conflict"
  source: string[];      // "Original" | "Addback"
  description: string;
  debit_min: string; debit_max: string;
  credit_min: string; credit_max: string;
  movement_min: string; movement_max: string;
};

const emptyFilters = (): FilterState => ({
  month: [], year: [], gl_code: [], gl_name: [], branch: [], vendor: [],
  ref_numb: [], cost_center: [], source: [],
  description: "",
  debit_min: "", debit_max: "", credit_min: "", credit_max: "",
  movement_min: "", movement_max: "",
});

type CCRef = { id: string; name: string };

function buildParams(
  uploadId: string,
  f: FilterState,
  page: number,
  ccList: CCRef[]
): URLSearchParams {
  const p = new URLSearchParams({ page: String(page) });
  if (uploadId) p.set("uploadId", uploadId);
  f.month.forEach((v) => p.append("month", v));
  f.year.forEach((v) => p.append("year", v));
  f.gl_code.forEach((v) => p.append("gl_code", v));
  f.gl_name.forEach((v) => p.append("gl_name", v));
  f.branch.forEach((v) => p.append("branch", v));
  f.vendor.forEach((v) => p.append("vendor", v));
  f.ref_numb.forEach((v) => p.append("ref_numb", v));
  if (f.description) p.set("description", f.description);
  if (f.debit_min) p.set("debit_min", f.debit_min);
  if (f.debit_max) p.set("debit_max", f.debit_max);
  if (f.credit_min) p.set("credit_min", f.credit_min);
  if (f.credit_max) p.set("credit_max", f.credit_max);
  if (f.movement_min) p.set("movement_min", f.movement_min);
  if (f.movement_max) p.set("movement_max", f.movement_max);

  // Translate CC display values → API params
  for (const val of f.cost_center) {
    if (val === "Unassigned") p.append("cc_status", "unassigned");
    else if (val === "Conflict") p.append("cc_status", "conflict");
    else {
      const cc = ccList.find((c) => c.name === val);
      if (cc) p.append("cost_center_id", cc.id);
    }
  }

  // Translate Source display values → API params
  for (const val of f.source) {
    if (val === "Original") p.append("source", "original");
    else if (val === "Addback") p.append("source", "addback");
  }

  return p;
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TotalCard({ label, value, colorClass }: { label: string; value: number; colorClass: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`mt-0.5 text-lg font-bold ${colorClass}`}>
        {new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}
      </p>
    </div>
  );
}

function TH({ label, children, className = "" }: {
  label?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <th className={`whitespace-nowrap px-3 py-3 font-medium ${className}`}>
      <span className="inline-flex items-center gap-0.5">
        {label}
        {children}
      </span>
    </th>
  );
}

// ─── Cost Center cell ─────────────────────────────────────────────────────────

function CCCell({ tx }: { tx: PLTransaction }) {
  if (tx.cost_center_status === "conflict") {
    return (
      <span className="inline-flex items-center rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">
        Conflict
      </span>
    );
  }
  if (tx.cost_center_status === "assigned" && tx.cost_centers?.name) {
    return <span className="text-gray-700">{tx.cost_centers.name}</span>;
  }
  return <span className="text-gray-400">—</span>;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TransactionsPage() {
  const [uploads, setUploads] = useState<PLUpload[]>([]);
  // Default: empty string = "All uploads"
  const [selectedUpload, setSelectedUpload] = useState("");
  const [filterOpts, setFilterOpts] = useState<FilterOptionsResponse>({
    month: [], year: [], gl_code: [], gl_name: [],
    branch: [], vendor: [], category_5: [], category_6: [], ref_numb: [],
    costCenters: [],
  });
  const [filters, setFilters] = useState<FilterState>(emptyFilters());
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<PLTransaction[]>([]);
  const [count, setCount] = useState(0);
  const [totals, setTotals] = useState({ debit: 0, credit: 0, movement: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Load upload list — default stays "All uploads" (empty string)
  useEffect(() => {
    fetch("/api/uploads")
      .then((r) => r.json())
      .then((data: PLUpload[]) => {
        const completed = data.filter((u) => u.status === "completed");
        setUploads(completed);
      })
      .catch(console.error);
  }, []);

  // Refresh filter options whenever selected upload changes
  useEffect(() => {
    const params = selectedUpload ? `?uploadId=${selectedUpload}` : "";
    fetch(`/api/transactions/filter-options${params}`)
      .then((r) => r.json())
      .then((v: FilterOptionsResponse) => setFilterOpts(v))
      .catch(console.error);
  }, [selectedUpload]);

  const fetchTransactions = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = buildParams(selectedUpload, filters, page, filterOpts.costCenters);
      const res = await fetch(`/api/transactions?${params}`);
      if (!res.ok) {
        const j = await res.json();
        setError(j.error ?? "Request failed");
        return;
      }
      const json: TransactionsResponse = await res.json();
      setRows(json.data);
      setCount(json.count);
      setTotals(json.totals);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [selectedUpload, filters, page, filterOpts.costCenters]);

  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);

  function setFilter<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }

  const totalPages = Math.ceil(count / PAGE_SIZE);

  // CC filter options: sentinel values first, then alphabetical CC names
  const ccFilterOptions = [
    "Unassigned",
    "Conflict",
    ...filterOpts.costCenters.map((cc) => cc.name),
  ];

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Transaction Review</h2>
          <p className="text-sm text-gray-500">{count.toLocaleString()} rows · read-only</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedUpload}
            onChange={(e) => {
              setSelectedUpload(e.target.value);
              setFilters(emptyFilters());
              setPage(1);
            }}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-400 focus:outline-none"
          >
            <option value="">All uploads</option>
            {uploads.map((u) => (
              <option key={u.id} value={u.id}>{u.file_name}</option>
            ))}
          </select>
          <button
            onClick={fetchTransactions}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-3 gap-3">
        <TotalCard label="Total debit" value={totals.debit} colorClass="text-red-600" />
        <TotalCard label="Total credit" value={totals.credit} colorClass="text-green-600" />
        <TotalCard
          label="Net movement"
          value={totals.movement}
          colorClass={totals.movement >= 0 ? "text-green-700" : "text-red-700"}
        />
      </div>

      {error && (
        <p className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
      )}

      {/* Table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-auto rounded-xl" style={{ maxHeight: "calc(100vh - 320px)" }}>
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-20 bg-gray-50">
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                {/* Cost Center first */}
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
                <TH label="Debit" className="text-right">
                  <ColumnFilter label="Debit" type="numeric"
                    min={filters.debit_min} max={filters.debit_max}
                    onChange={(min, max) => { setFilter("debit_min", min); setFilter("debit_max", max); }} />
                </TH>
                <TH label="Credit" className="text-right">
                  <ColumnFilter label="Credit" type="numeric"
                    min={filters.credit_min} max={filters.credit_max}
                    onChange={(min, max) => { setFilter("credit_min", min); setFilter("credit_max", max); }} />
                </TH>
                <TH label="Movement" className="text-right">
                  <ColumnFilter label="Movement" type="numeric"
                    min={filters.movement_min} max={filters.movement_max}
                    onChange={(min, max) => { setFilter("movement_min", min); setFilter("movement_max", max); }} />
                </TH>
                <TH label="Source">
                  <ColumnFilter label="Source" type="categorical"
                    options={["Original", "Addback"]} selected={filters.source}
                    onChange={(v) => setFilter("source", v)} />
                </TH>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={13} className="py-10 text-center text-gray-400">
                    <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600" />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-10 text-center text-gray-400">
                    No transactions found with the current filters.
                  </td>
                </tr>
              ) : (
                rows.map((tx) => (
                  <tr
                    key={tx.id}
                    className={[
                      "border-b border-gray-50 hover:bg-gray-50",
                      !tx.category_1 ? "bg-amber-50/40" : "",
                    ].join(" ")}
                  >
                    <td className="px-3 py-2.5">
                      <CCCell tx={tx} />
                    </td>
                    <td className="px-3 py-2.5 text-gray-700">{tx.month ?? "—"}</td>
                    <td className="px-3 py-2.5 text-gray-700">{tx.year ?? "—"}</td>
                    <td className="px-3 py-2.5 font-mono text-gray-800">{tx.gl_code ?? "—"}</td>
                    <td className="max-w-[160px] truncate px-3 py-2.5 text-gray-700">{tx.gl_name ?? "—"}</td>
                    <td className="px-3 py-2.5 text-gray-700">{tx.branch ?? "—"}</td>
                    <td className="max-w-[180px] truncate px-3 py-2.5 text-gray-600">{tx.check_description ?? "—"}</td>
                    <td className="max-w-[120px] truncate px-3 py-2.5 text-gray-600">{tx.vendor ?? "—"}</td>
                    <td className="px-3 py-2.5 font-mono text-gray-600">{tx.ref_numb ?? "—"}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-red-600">{fmt(tx.debit)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-green-600">{fmt(tx.credit)}</td>
                    <td className={`px-3 py-2.5 text-right font-mono ${(tx.movement ?? 0) >= 0 ? "text-green-700" : "text-red-700"}`}>
                      {fmt(tx.movement)}
                    </td>
                    <td className="px-3 py-2.5">
                      {tx.source === "addback" ? (
                        <span className="inline-flex items-center rounded bg-purple-100 px-1.5 py-0.5 text-xs font-medium text-purple-700">
                          Addback
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">Original</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        count={count}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />
    </div>
  );
}
