"use client";

import { useEffect, useState } from "react";
import { PivotTable } from "@/components/pivot-table";
import type { PLReportTx, FilterOptionsResponse } from "@/types";

export default function PLAllPage() {
  const [opts, setOpts] = useState<FilterOptionsResponse | null>(null);
  const [year, setYear]     = useState("");
  const [branch, setBranch] = useState("");
  const [source, setSource] = useState(""); // "" = all | "original" | "addback"
  const [txs, setTxs]   = useState<PLReportTx[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState("");
  const [loaded, setLoaded] = useState(false);

  // Load filter options once
  useEffect(() => {
    fetch("/api/transactions/filter-options")
      .then(r => r.json())
      .then((v: FilterOptionsResponse) => {
        setOpts(v);
        if (v.year.length > 0) setYear(v.year[v.year.length - 1]); // default = latest year
      })
      .catch(console.error);
  }, []);

  async function load() {
    if (!year) return;
    setLoading(true);
    setError("");
    try {
      const p = new URLSearchParams({ year });
      if (branch) p.set("branch", branch);
      if (source) p.set("source", source);
      const res = await fetch(`/api/pl-all?${p}`);
      if (!res.ok) { const j = await res.json(); setError(j.error ?? "Error"); return; }
      setTxs(await res.json());
      setLoaded(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  // Auto-load when filters change (if already loaded once)
  useEffect(() => {
    if (loaded) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, branch, source]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">P&amp;L All</h2>
          <p className="text-sm text-gray-500">
            Pivot by Category 2 → Category 7 → GL Name → GL Code
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={e => { setYear(e.target.value); }}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-blue-400 focus:outline-none"
          >
            <option value="">Select year…</option>
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
            onClick={load}
            disabled={!year || loading}
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
          >
            {loading ? "Loading…" : "Load"}
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-red-100 bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>
      )}

      {!loaded && !loading && (
        <p className="py-10 text-center text-sm text-gray-400">Select a year and click Load to generate the report.</p>
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
