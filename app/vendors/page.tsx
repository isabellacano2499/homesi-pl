"use client";

import { useEffect, useState, useMemo } from "react";
import { Search } from "lucide-react";
import type { VendorSummary } from "@/types";

export default function VendorsPage() {
  const [vendors, setVendors] = useState<VendorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch("/api/vendors")
      .then((r) => r.json())
      .then((data) => {
        if (data.tooMany) {
          setError(data.message);
          return;
        }
        if (data.error) { setError(data.error); return; }
        setVendors(data as VendorSummary[]);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return vendors;
    const q = query.toLowerCase();
    return vendors.filter((v) => v.vendor.toLowerCase().includes(q));
  }, [vendors, query]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Vendors</h2>
          <p className="text-sm text-gray-500">
            {loading ? "Loading…" : `${filtered.length} of ${vendors.length} vendors`}
          </p>
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">{error}</p>
      )}

      {!error && (
        <>
          {/* Search */}
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search vendors…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-4 text-sm focus:border-blue-400 focus:outline-none"
            />
          </div>

          {/* Table */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            {loading ? (
              <div className="py-10 text-center text-gray-400">
                <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600" />
                <p className="mt-2 text-xs">Aggregating vendor data…</p>
              </div>
            ) : filtered.length === 0 ? (
              <p className="py-10 text-center text-sm text-gray-400">No vendors found.</p>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 bg-gray-50">
                  <tr className="border-b border-gray-200 text-left text-gray-500">
                    <th className="px-4 py-3 font-medium">Vendor</th>
                    <th className="px-4 py-3 font-medium">Branches</th>
                    <th className="px-4 py-3 font-medium">Months</th>
                    <th className="px-4 py-3 font-medium">GL Code / Name</th>
                    <th className="px-4 py-3 font-medium">Cost Centers</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((v) => (
                    <tr key={v.vendor} className="border-b border-gray-50 hover:bg-gray-50 align-top">
                      <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap max-w-[200px] truncate">
                        {v.vendor}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        <span className="inline-flex flex-wrap gap-1">
                          {v.branches.map((b) => (
                            <span key={b} className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-700">{b}</span>
                          ))}
                          {v.branches.length === 0 && <span className="text-gray-300">—</span>}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        <span className="inline-flex flex-wrap gap-1">
                          {v.months.map((m) => (
                            <span key={m} className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700 text-[10px]">{m.slice(0,3)}</span>
                          ))}
                          {v.months.length === 0 && <span className="text-gray-300">—</span>}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        <div className="flex flex-col gap-0.5">
                          {v.gl_items.map((g) => (
                            <span key={g.gl_code} className="flex gap-1.5">
                              <span className="font-mono text-gray-700">{g.gl_code}</span>
                              <span className="text-gray-400 truncate max-w-[180px]">{g.gl_name}</span>
                            </span>
                          ))}
                          {v.gl_items.length === 0 && <span className="text-gray-300">—</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex flex-wrap gap-1">
                          {v.cost_centers.map((cc) => (
                            <span
                              key={cc}
                              className={[
                                "rounded px-1.5 py-0.5 text-[10px] font-medium",
                                cc === "Unassigned"
                                  ? "bg-gray-100 text-gray-500"
                                  : cc === "Conflict"
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-green-50 text-green-700",
                              ].join(" ")}
                            >
                              {cc}
                            </span>
                          ))}
                          {v.cost_centers.length === 0 && <span className="text-gray-300">—</span>}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
