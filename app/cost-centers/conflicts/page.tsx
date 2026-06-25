"use client";

import { useEffect, useState, useCallback } from "react";
import { AlertTriangle } from "lucide-react";
import { Pagination } from "@/components/pagination";
import type { PLTransaction, CostCenter } from "@/types";

const PAGE_SIZE = 50;

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export default function ConflictsPage() {
  const [rows, setRows] = useState<PLTransaction[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [ccMap, setCCMap] = useState<Map<string, string>>(new Map());

  // Load cost center name map once
  useEffect(() => {
    fetch("/api/cost-centers")
      .then((r) => r.json())
      .then((data: CostCenter[]) => {
        const m = new Map<string, string>(data.map((cc) => [cc.id, cc.name]));
        setCCMap(m);
      })
      .catch(console.error);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rangeFrom = (page - 1) * PAGE_SIZE;
      const rangeTo = rangeFrom + PAGE_SIZE - 1;
      // Use the transactions API with a custom filter — we query Supabase directly
      // via a dedicated param rather than the generic transactions endpoint
      const res = await fetch(
        `/api/transactions/conflicts?page=${page}`
      );
      if (!res.ok) return;
      const json = await res.json();
      setRows(json.data ?? []);
      setCount(json.count ?? 0);
      void rangeFrom; void rangeTo;
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(count / PAGE_SIZE);

  function conflictNames(ids: string[] | null): string {
    if (!ids || ids.length === 0) return "—";
    return ids.map((id) => ccMap.get(id) ?? id).join(", ");
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Conflicts</h2>
        <p className="text-sm text-gray-500">
          Transactions that matched rules from two or more Cost Centers simultaneously.
          Review and resolve manually.
        </p>
      </div>

      {count === 0 && !loading && (
        <div className="rounded-xl border border-green-100 bg-green-50 px-6 py-8 text-center">
          <p className="text-sm font-medium text-green-700">No conflicts — all transactions are resolved.</p>
        </div>
      )}

      {(count > 0 || loading) && (
        <>
          <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-700 flex items-center gap-2">
            <AlertTriangle size={14} />
            {count} transaction{count !== 1 ? "s" : ""} in conflict
          </div>

          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                    <th className="px-4 py-3 font-medium">Month</th>
                    <th className="px-4 py-3 font-medium">Year</th>
                    <th className="px-4 py-3 font-medium">GL Code</th>
                    <th className="px-4 py-3 font-medium">GL Name</th>
                    <th className="px-4 py-3 font-medium">Branch</th>
                    <th className="px-4 py-3 font-medium">Description</th>
                    <th className="px-4 py-3 font-medium text-right">Movement</th>
                    <th className="px-4 py-3 font-medium">Conflicting Cost Centers</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-gray-400">
                        <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600" />
                      </td>
                    </tr>
                  ) : (
                    rows.map((tx) => (
                      <tr key={tx.id} className="border-b border-gray-50 hover:bg-amber-50/30">
                        <td className="px-4 py-2.5 text-gray-700">{tx.month ?? "—"}</td>
                        <td className="px-4 py-2.5 text-gray-700">{tx.year ?? "—"}</td>
                        <td className="px-4 py-2.5 font-mono text-gray-800">{tx.gl_code ?? "—"}</td>
                        <td className="max-w-[140px] truncate px-4 py-2.5 text-gray-700">
                          {tx.gl_name ?? "—"}
                        </td>
                        <td className="px-4 py-2.5 text-gray-700">{tx.branch ?? "—"}</td>
                        <td className="max-w-[180px] truncate px-4 py-2.5 text-gray-600">
                          {tx.check_description ?? "—"}
                        </td>
                        <td
                          className={`px-4 py-2.5 text-right font-mono ${
                            (tx.movement ?? 0) >= 0 ? "text-green-700" : "text-red-700"
                          }`}
                        >
                          {fmt(tx.movement)}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="inline-flex flex-wrap gap-1">
                            {(tx.cost_center_conflicts ?? []).map((ccId) => (
                              <span
                                key={ccId}
                                className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800 font-medium"
                              >
                                {ccMap.get(ccId) ?? ccId}
                              </span>
                            ))}
                          </span>
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
        </>
      )}
    </div>
  );
}
