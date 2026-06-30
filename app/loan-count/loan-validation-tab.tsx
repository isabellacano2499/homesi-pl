"use client";

import { useState, useCallback, useEffect } from "react";
import { ChevronDown, ChevronRight, Download, AlertTriangle, CheckCircle, TrendingUp } from "lucide-react";
import { ReportFilter } from "@/components/report-filter";
import { downloadCSV } from "@/lib/csv";
import type { ValidationResult, ValidationRow, SurplusRow } from "@/app/api/loan-validation/route";

// ─── Sub-tab config ───────────────────────────────────────────────────────────

type ValType = "b2b" | "on_demand" | "processing" | "all_loans";

const SUB_TABS: { type: ValType; label: string; glLabel: string }[] = [
  { type: "b2b",        label: "B2B",         glLabel: "DM Margin (41309)" },
  { type: "on_demand",  label: "On Demand",    glLabel: "Other HUD Fees (41205)" },
  { type: "processing", label: "Processing",   glLabel: "Processing Fee (55275)" },
  { type: "all_loans",  label: "All Loans",    glLabel: "DM Margin (41309)" },
];

// ─── Formatting ───────────────────────────────────────────────────────────────

function fmtUSD(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}
function fmtBPS(n: number | null | undefined) {
  if (n == null) return "—";
  return `${n.toFixed(1)} bps`;
}
function fmtMov(n: number) {
  const cls = n >= 0 ? "text-emerald-700" : "text-red-600";
  const s = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Math.abs(n));
  return <span className={`font-mono ${cls}`}>{n < 0 ? `(${s})` : s}</span>;
}

// ─── Summary strip ────────────────────────────────────────────────────────────

function SummaryStrip({ summary }: { summary: ValidationResult["summary"] }) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5">
        <CheckCircle size={13} className="text-green-600" />
        <span className="text-xs font-semibold text-green-700">{summary.match_count}</span>
        <span className="text-xs text-green-600">match{summary.match_count !== 1 ? "es" : ""}</span>
      </div>
      <div className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5">
        <AlertTriangle size={13} className="text-amber-600" />
        <span className="text-xs font-semibold text-amber-700">{summary.missing_count}</span>
        <span className="text-xs text-amber-600">missing in accounting</span>
      </div>
      <div className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5">
        <TrendingUp size={13} className="text-blue-600" />
        <span className="text-xs font-semibold text-blue-700">{summary.surplus_count}</span>
        <span className="text-xs text-blue-600">surplus in accounting</span>
      </div>
    </div>
  );
}

// ─── Surplus section ──────────────────────────────────────────────────────────

function SurplusSection({ rows }: { rows: SurplusRow[] }) {
  const [open, setOpen] = useState(false);
  if (rows.length === 0) return null;

  const csvData = rows.map((r) => ({
    loan_number: r.loan_number ?? "",
    check_description: r.check_description ?? "",
    movement: r.movement,
    month: r.month ?? "",
    year: r.year ?? "",
    branch: r.branch ?? "",
    incomplete: r.incomplete ? "Yes" : "No",
  }));

  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50/40 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-blue-50/80 transition-colors"
      >
        {open ? <ChevronDown size={13} className="text-blue-500" /> : <ChevronRight size={13} className="text-blue-500" />}
        <span className="text-xs font-semibold text-blue-700">
          {rows.length} surplus in accounting
        </span>
        <span className="text-xs text-blue-500">
          — transactions with this GL code whose loan number is not in the filtered Loan Officials set
        </span>
        {open && (
          <button
            onClick={(e) => { e.stopPropagation(); downloadCSV("surplus.csv", csvData, [
              { key: "loan_number", label: "Loan Number" },
              { key: "check_description", label: "Description" },
              { key: "movement", label: "Movement" },
              { key: "month", label: "Month" },
              { key: "year", label: "Year" },
              { key: "branch", label: "Branch" },
              { key: "incomplete", label: "Incomplete Loan#" },
            ]); }}
            className="ml-auto flex items-center gap-1 rounded-lg border border-blue-200 bg-white px-2 py-1 text-[11px] text-blue-600 hover:bg-blue-50"
          >
            <Download size={11} /> CSV
          </button>
        )}
      </button>

      {open && (
        <div className="overflow-auto max-h-72 border-t border-blue-100">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-blue-50">
              <tr className="text-left text-blue-600/70 border-b border-blue-100">
                <th className="px-3 py-2 font-medium">Loan Number</th>
                <th className="px-3 py-2 font-medium">Description</th>
                <th className="px-3 py-2 font-medium text-right">Movement</th>
                <th className="px-3 py-2 font-medium">Month</th>
                <th className="px-3 py-2 font-medium">Year</th>
                <th className="px-3 py-2 font-medium">Branch</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-blue-50 hover:bg-blue-50/60">
                  <td className="px-3 py-1.5 font-mono text-gray-700">
                    {r.loan_number ?? <span className="text-gray-400 italic">no loan#</span>}
                    {r.incomplete && (
                      <span className="ml-1 rounded bg-orange-100 px-1 py-0.5 text-[10px] font-medium text-orange-600">ambiguous</span>
                    )}
                  </td>
                  <td className="max-w-[200px] truncate px-3 py-1.5 text-gray-600" title={r.check_description ?? ""}>
                    {r.check_description ?? "—"}
                  </td>
                  <td className="px-3 py-1.5 text-right">{fmtMov(r.movement)}</td>
                  <td className="px-3 py-1.5 text-gray-600">{r.month ?? "—"}</td>
                  <td className="px-3 py-1.5 text-gray-600">{r.year ?? "—"}</td>
                  <td className="px-3 py-1.5 text-gray-600">{r.branch ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main table ───────────────────────────────────────────────────────────────

function ValidationTable({ rows, showBps }: { rows: ValidationRow[]; showBps: boolean }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-gray-100 bg-white px-6 py-10 text-center text-sm text-gray-400">
        No loans found for this filter combination.
      </div>
    );
  }

  return (
    <div className="overflow-auto rounded-xl border border-gray-200 bg-white shadow-sm max-h-[420px]">
      <table className="w-full text-xs">
        <thead className="sticky top-0 z-10 bg-gray-50">
          <tr className="border-b border-gray-100 text-left text-gray-500">
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium whitespace-nowrap">Loan Number</th>
            <th className="px-3 py-2 font-medium">Borrower Name</th>
            <th className="px-3 py-2 font-medium">Branch</th>
            {showBps && <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Loan Amount</th>}
            <th className="px-3 py-2 font-medium text-right whitespace-nowrap">
              {showBps ? "DM Margin" : "Accounting Amt."}
            </th>
            {showBps && <th className="px-3 py-2 font-medium text-right">BPS</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const missing = row.status === "missing";
            return (
              <tr
                key={row.loan_number}
                className={`border-b border-gray-50 hover:brightness-95 ${missing ? "bg-amber-50/70" : ""}`}
              >
                <td className="px-3 py-1.5">
                  {missing ? (
                    <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                      <AlertTriangle size={9} /> Missing
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">
                      <CheckCircle size={9} /> Match
                    </span>
                  )}
                </td>
                <td className="px-3 py-1.5 font-mono text-gray-800 whitespace-nowrap">{row.loan_number}</td>
                <td className="max-w-[160px] truncate px-3 py-1.5 text-gray-700" title={row.borrower_name ?? ""}>
                  {row.borrower_name ?? "—"}
                </td>
                <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{row.branch ?? "—"}</td>
                {showBps && (
                  <td className="px-3 py-1.5 text-right font-mono text-gray-700 whitespace-nowrap">
                    {fmtUSD(row.loan_amount)}
                  </td>
                )}
                <td className="px-3 py-1.5 text-right whitespace-nowrap">
                  {missing ? <span className="text-gray-300">—</span> : fmtMov(row.accounting_total)}
                </td>
                {showBps && (
                  <td className="px-3 py-1.5 text-right font-mono text-gray-600 whitespace-nowrap">
                    {missing ? <span className="text-gray-300">—</span> : fmtBPS(row.bps)}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Single validation section (one sub-tab) ──────────────────────────────────

function ValidationSection({
  type, glLabel, months, years, branches,
}: {
  type: ValType;
  glLabel: string;
  months: string[];
  years: string[];
  branches: string[];
}) {
  const [data, setData] = useState<ValidationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const p = new URLSearchParams({ type });
      months.forEach((m) => p.append("month", m));
      years.forEach((y) => p.append("year", y));
      branches.forEach((b) => p.append("branch", b));
      const res = await fetch(`/api/loan-validation?${p}`);
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to load"); return; }
      setData(json);
    } finally {
      setLoading(false);
    }
  }, [type, months, years, branches]);

  useEffect(() => { load(); }, [load]);

  const showBps = type === "b2b" || type === "all_loans";

  function handleExport() {
    if (!data) return;
    const csvRows = data.rows.map((r) => ({
      status: r.status,
      loan_number: r.loan_number,
      borrower_name: r.borrower_name ?? "",
      branch: r.branch ?? "",
      loan_amount: r.loan_amount ?? "",
      accounting_total: r.accounting_total,
      bps: r.bps ?? "",
    }));
    const cols = [
      { key: "status",           label: "Status" },
      { key: "loan_number",      label: "Loan Number" },
      { key: "borrower_name",    label: "Borrower Name" },
      { key: "branch",           label: "Branch" },
      ...(showBps ? [{ key: "loan_amount", label: "Loan Amount" }] : []),
      { key: "accounting_total", label: showBps ? "DM Margin" : "Accounting Amt." },
      ...(showBps ? [{ key: "bps", label: "BPS" }] : []),
    ];
    downloadCSV(`loan_validation_${type}.csv`, csvRows, cols);
  }

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">
          GL {glLabel}
          {type === "on_demand" && <span className="ml-1 text-gray-400">· desc contains "LOA ON DEMAND FEE ON FILE"</span>}
          {type === "processing" && <span className="ml-1 text-gray-400">· desc contains "PROCESSING FEE ON FILE"</span>}
        </p>
        {data && data.rows.length > 0 && (
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 shadow-sm"
          >
            <Download size={13} /> Export CSV
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-12 text-center">
          <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs text-red-600">{error}</div>
      ) : data ? (
        <>
          <SummaryStrip summary={data.summary} />
          <ValidationTable rows={data.rows} showBps={showBps} />
          <SurplusSection rows={data.surplus} />
        </>
      ) : null}
    </div>
  );
}

// ─── Loan Validation Tab (root export) ───────────────────────────────────────

export function LoanValidationTab({
  allMonths,
  allYears,
  allBranches,
}: {
  allMonths: string[];
  allYears: number[];
  allBranches: string[];
}) {
  const [activeType, setActiveType] = useState<ValType>("b2b");
  const [selMonths, setSelMonths] = useState<string[]>([]);
  const [selYears, setSelYears] = useState<string[]>([]);
  const [selBranches, setSelBranches] = useState<string[]>([]);

  const yearOptions = allYears.map(String);
  const hasFilters = selMonths.length > 0 || selYears.length > 0 || selBranches.length > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs text-gray-500 font-medium">Filter:</span>
        <ReportFilter label="Month"  options={allMonths}   selected={selMonths}   onChange={setSelMonths} />
        <ReportFilter label="Year"   options={yearOptions} selected={selYears}    onChange={setSelYears} />
        <ReportFilter label="Branch" options={allBranches} selected={selBranches} onChange={setSelBranches} />
        {hasFilters && (
          <button
            onClick={() => { setSelMonths([]); setSelYears([]); setSelBranches([]); }}
            className="text-xs text-gray-400 hover:text-gray-600 underline"
          >
            Clear
          </button>
        )}
      </div>

      {/* Sub-tab bar */}
      <div className="flex gap-1 border-b border-gray-200">
        {SUB_TABS.map((t) => (
          <button
            key={t.type}
            onClick={() => setActiveType(t.type)}
            className={[
              "px-4 py-2 text-xs font-medium border-b-2 -mb-px transition-colors",
              activeType === t.type
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Active section */}
      {SUB_TABS.filter((t) => t.type === activeType).map((t) => (
        <ValidationSection
          key={t.type}
          type={t.type}
          glLabel={t.glLabel}
          months={selMonths}
          years={selYears}
          branches={selBranches}
        />
      ))}
    </div>
  );
}
