"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReportFilter } from "@/components/report-filter";
import type { LoanOfficial } from "@/types";

const BOOL_FIELDS: { key: keyof LoanOfficial; label: string }[] = [
  { key: "affinity",          label: "Affinity" },
  { key: "b2b",               label: "B2B" },
  { key: "support_on_demand", label: "Support on demand" },
  { key: "processing",        label: "Processing" },
  { key: "recruitment",       label: "Recruitment" },
];

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function BoolToggle({
  value,
  onChange,
  disabled,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
}) {
  return (
    <button
      disabled={disabled}
      onClick={() => onChange(!value)}
      className={[
        "h-5 w-9 rounded-full transition-colors focus:outline-none disabled:opacity-40",
        value ? "bg-green-500" : "bg-gray-200",
      ].join(" ")}
      title={value ? "Yes — click to set No" : "No — click to set Yes"}
    >
      <span
        className={[
          "block h-4 w-4 rounded-full bg-white shadow transition-transform mx-0.5",
          value ? "translate-x-4" : "translate-x-0",
        ].join(" ")}
      />
    </button>
  );
}

function TextCell({
  value,
  onSave,
  disabled,
}: {
  value: string | null;
  onSave: (v: string | null) => Promise<void>;
  disabled: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    if (disabled) return;
    setDraft(value ?? "");
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  async function commit() {
    setEditing(false);
    const next = draft.trim() || null;
    if (next !== value) await onSave(next);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-full min-w-[100px] rounded border border-blue-300 bg-white px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
      />
    );
  }

  return (
    <button
      disabled={disabled}
      onClick={startEdit}
      className="w-full text-left text-xs truncate disabled:opacity-50 hover:text-blue-600"
      title={value ?? undefined}
    >
      {value ?? <span className="text-gray-300">—</span>}
    </button>
  );
}

export default function LoanCountPage() {
  const [loans, setLoans] = useState<LoanOfficial[]>([]);
  const [loading, setLoading] = useState(true);
  const [allMonths, setAllMonths] = useState<string[]>([]);
  const [allYears, setAllYears] = useState<number[]>([]);
  const [selMonths, setSelMonths] = useState<string[]>([]);
  const [selYears, setSelYears] = useState<string[]>([]);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saveErr, setSaveErr] = useState("");

  useEffect(() => {
    fetch("/api/loan-officials/filter-options")
      .then((r) => r.json())
      .then((d: { months: string[]; years: number[] }) => {
        setAllMonths(d.months ?? []);
        setAllYears(d.years ?? []);
      })
      .catch(console.error);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      selMonths.forEach((m) => params.append("month", m));
      selYears.forEach((y) => params.append("year", y));
      const res = await fetch(`/api/loan-officials?${params}`);
      if (res.ok) setLoans(await res.json());
    } finally { setLoading(false); }
  }, [selMonths, selYears]);

  useEffect(() => { load(); }, [load]);

  async function handleUpdate(loan: LoanOfficial, field: keyof LoanOfficial, newValue: boolean | string | null) {
    setSaving((prev) => ({ ...prev, [loan.id]: true }));
    setSaveErr("");
    try {
      const res = await fetch(`/api/loan-officials/${loan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: newValue }),
      });
      const json = await res.json();
      if (!res.ok) { setSaveErr(json.error ?? "Failed to save"); return; }
      setLoans((prev) => prev.map((l) => l.id === loan.id ? { ...l, ...json } : l));
    } catch (err) {
      setSaveErr(String(err));
    } finally {
      setSaving((prev) => ({ ...prev, [loan.id]: false }));
    }
  }

  const yearOptions = useMemo(() => allYears.map(String), [allYears]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Loan Count</h2>
        <p className="text-sm text-gray-500">Master loan list — upload via Upload P&L → Loan Count.</p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs text-gray-500 font-medium">Filter:</span>
        <ReportFilter label="Month" options={allMonths} selected={selMonths} onChange={setSelMonths} />
        <ReportFilter label="Year" options={yearOptions} selected={selYears} onChange={setSelYears} />
        {(selMonths.length > 0 || selYears.length > 0) && (
          <button
            onClick={() => { setSelMonths([]); setSelYears([]); }}
            className="text-xs text-gray-400 hover:text-gray-600 underline"
          >
            Clear
          </button>
        )}
        <span className="ml-auto text-xs text-gray-400">
          {loading ? "Loading…" : `${loans.length} loan${loans.length !== 1 ? "s" : ""}`}
        </span>
      </div>

      {saveErr && (
        <p className="rounded-lg border border-red-100 bg-red-50 px-4 py-2 text-xs text-red-600">{saveErr}</p>
      )}

      {loading ? (
        <div className="py-12 text-center">
          <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600" />
        </div>
      ) : loans.length === 0 ? (
        <div className="rounded-xl border border-gray-100 bg-white py-12 text-center">
          <p className="text-sm text-gray-400">
            No loan data found.{" "}
            {allMonths.length === 0
              ? "Upload a Loan Count file first (Upload P&L → Loan Count)."
              : "Try adjusting the Month / Year filters."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                <th className="px-3 py-2.5 font-medium whitespace-nowrap">Month</th>
                <th className="px-3 py-2.5 font-medium whitespace-nowrap">Borrower Name</th>
                <th className="px-3 py-2.5 font-medium whitespace-nowrap">Loan Officer</th>
                <th className="px-3 py-2.5 font-medium whitespace-nowrap">Lead Source LO</th>
                <th className="px-3 py-2.5 font-medium whitespace-nowrap">Loan Info Channel</th>
                <th className="px-3 py-2.5 font-medium whitespace-nowrap">Branch</th>
                <th className="px-3 py-2.5 font-medium text-right whitespace-nowrap">Loan Amount</th>
                <th className="px-3 py-2.5 font-medium whitespace-nowrap">BD Owner</th>
                {BOOL_FIELDS.map((f) => (
                  <th key={f.key} className="px-3 py-2.5 font-medium text-center whitespace-nowrap">
                    {f.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loans.map((loan) => (
                <tr key={loan.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                    {loan.month ?? "—"}{loan.year ? ` ${loan.year}` : ""}
                  </td>
                  <td className="max-w-[180px] truncate px-3 py-2 font-medium text-gray-800">
                    {loan.borrower_name ?? "—"}
                  </td>
                  <td className="max-w-[140px] truncate px-3 py-2 text-gray-600">
                    {loan.loan_officer ?? "—"}
                  </td>
                  <td className="max-w-[120px] px-3 py-2 text-gray-600">
                    <TextCell
                      value={loan.lead_source_lo}
                      onSave={(v) => handleUpdate(loan, "lead_source_lo", v)}
                      disabled={!!saving[loan.id]}
                    />
                  </td>
                  <td className="px-3 py-2 text-gray-500">
                    {loan.loan_info_channel ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-gray-600">
                    {loan.branch ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-gray-700">
                    {fmt(loan.loan_amount)}
                  </td>
                  <td className="max-w-[120px] px-3 py-2 text-gray-600">
                    <TextCell
                      value={loan.bd_owner}
                      onSave={(v) => handleUpdate(loan, "bd_owner", v)}
                      disabled={!!saving[loan.id]}
                    />
                  </td>
                  {BOOL_FIELDS.map((f) => (
                    <td key={f.key} className="px-3 py-2 text-center">
                      <BoolToggle
                        value={loan[f.key] as boolean}
                        onChange={(v) => handleUpdate(loan, f.key, v)}
                        disabled={!!saving[loan.id]}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
