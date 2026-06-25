"use client";

import { useMemo, useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import type { PLReportTxCC } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type TxLeaf = { id: string; month: string; desc: string | null; mvmt: number };
type GLNameNode = { gl_name: string; byMonth: Record<string, number>; total: number; txs: TxLeaf[] };
type CCNode = {
  cc_key: string;   // UUID | "unassigned" | "conflict"
  cc_name: string;
  order: number;    // for sorting: 0=named, 1=unassigned, 2=conflict
  byMonth: Record<string, number>;
  total: number;
  gl_names: GLNameNode[];
};

const MONTH_ORDER = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const TOTAL_BG = "#1e3a5f";

// ─── Build pivot ──────────────────────────────────────────────────────────────

export function buildPivotByCC(txs: PLReportTxCC[]): { ccNodes: CCNode[]; months: string[] } {
  type WAcc = { bm: Map<string, number>; total: number };
  type WGL  = WAcc & { txs: TxLeaf[] };
  type WCC  = WAcc & { gl_names: Map<string, WGL> };

  const ccMap = new Map<string, WCC>();
  const monthSet = new Set<string>();

  for (const tx of txs) {
    const month = tx.month ?? "Unknown";
    const mvmt  = tx.movement ?? 0;
    const glN   = tx.gl_name ?? "(No GL Name)";
    const desc  = tx.check_description;

    let cc_key: string;
    let cc_name: string;
    let order: number;

    if (tx.cost_center_status === "unassigned" || (!tx.cost_center_id && tx.cost_center_status !== "conflict")) {
      cc_key = "unassigned"; cc_name = "Unassigned"; order = 1;
    } else if (tx.cost_center_status === "conflict") {
      cc_key = "conflict"; cc_name = "Conflict"; order = 2;
    } else {
      cc_key = tx.cost_center_id!;
      cc_name = tx.cost_centers?.name ?? cc_key;
      order = 0;
    }

    if (tx.month) monthSet.add(tx.month);

    if (!ccMap.has(cc_key)) ccMap.set(cc_key, { bm: new Map(), total: 0, gl_names: new Map() });
    const wCC = ccMap.get(cc_key)!;
    wCC.total += mvmt; wCC.bm.set(month, (wCC.bm.get(month) ?? 0) + mvmt);

    if (!wCC.gl_names.has(glN)) wCC.gl_names.set(glN, { bm: new Map(), total: 0, txs: [] });
    const wGL = wCC.gl_names.get(glN)!;
    wGL.total += mvmt; wGL.bm.set(month, (wGL.bm.get(month) ?? 0) + mvmt);
    wGL.txs.push({ id: tx.id, month, desc, mvmt });
  }

  const months = MONTH_ORDER.filter((m) => monthSet.has(m));

  const ccNodes: CCNode[] = [...ccMap.entries()].map(([cc_key, w]) => {
    const order = cc_key === "unassigned" ? 1 : cc_key === "conflict" ? 2 : 0;
    const cc_name = cc_key === "unassigned" ? "Unassigned" : cc_key === "conflict" ? "Conflict"
      : txs.find((t) => t.cost_center_id === cc_key)?.cost_centers?.name ?? cc_key;
    return {
      cc_key, cc_name, order,
      byMonth: Object.fromEntries(w.bm),
      total: w.total,
      gl_names: [...w.gl_names.entries()].map(([gl_name, wGL]) => ({
        gl_name,
        byMonth: Object.fromEntries(wGL.bm),
        total: wGL.total,
        txs: wGL.txs,
      })).sort((a, b) => a.gl_name.localeCompare(b.gl_name)),
    };
  }).sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.cc_name.localeCompare(b.cc_name);
  });

  return { ccNodes, months };
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtM(n: number | undefined): string {
  if (!n) return "";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
function mvCls(n: number | undefined) {
  const v = n ?? 0;
  return v > 0 ? "text-green-700" : v < 0 ? "text-red-600" : "text-gray-300";
}
function mvClsLight(n: number | undefined) {
  const v = n ?? 0;
  return v > 0 ? "text-emerald-300" : v < 0 ? "text-red-300" : "text-white/30";
}

const numCell = "px-2 py-0.5 text-right tabular-nums font-mono text-[11px] whitespace-nowrap";

// ─── PivotTableByCC ───────────────────────────────────────────────────────────

export function PivotTableByCC({
  txs, loading, emptyMessage = "No data",
}: {
  txs: PLReportTxCC[]; loading?: boolean; emptyMessage?: string;
}) {
  const { ccNodes, months } = useMemo(() => buildPivotByCC(txs), [txs]);
  const [exp, setExp] = useState<Set<string>>(new Set());

  function toggle(key: string) {
    setExp((prev) => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s; });
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-xs text-gray-400">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600" />
        Loading…
      </div>
    );
  }
  if (ccNodes.length === 0) {
    return <p className="py-8 text-center text-xs text-gray-400">{emptyMessage}</p>;
  }

  const grandTotal = ccNodes.reduce((s, c) => s + c.total, 0);
  const grandByMonth: Record<string, number> = {};
  for (const c of ccNodes) for (const [m, v] of Object.entries(c.byMonth))
    grandByMonth[m] = (grandByMonth[m] ?? 0) + v;

  const gtBase: React.CSSProperties = {
    position: "sticky", top: "30px", zIndex: 14, backgroundColor: TOTAL_BG,
  };

  const rows: React.ReactNode[] = [];

  // Grand total row
  rows.push(
    <tr key="__grand__" className="border-b border-white/10">
      <td style={{ ...gtBase, left: 0, zIndex: 20 }}
          className="px-3 py-2 text-[11px] font-extrabold text-white whitespace-nowrap">
        Total Income
      </td>
      {months.map((m) => (
        <td key={m} style={gtBase}
            className={`${numCell} font-extrabold text-[12px] ${mvClsLight(grandByMonth[m])}`}>
          {fmtM(grandByMonth[m])}
        </td>
      ))}
      <td style={{ ...gtBase, borderLeft: "1px solid rgba(255,255,255,0.15)" }}
          className={`${numCell} font-extrabold text-[12px] ${mvClsLight(grandTotal)}`}>
        {fmtM(grandTotal)}
      </td>
    </tr>
  );

  for (const ccNode of ccNodes) {
    const kCC = `cc:${ccNode.cc_key}`;
    const openCC = exp.has(kCC);

    const isSentinel = ccNode.cc_key === "unassigned" || ccNode.cc_key === "conflict";
    const ccRowCls = isSentinel
      ? "border-b border-amber-100 bg-amber-50 hover:bg-amber-100 cursor-pointer"
      : "border-b border-blue-100 bg-blue-50 hover:bg-blue-100 cursor-pointer";
    const ccTextCls = isSentinel ? "text-amber-800" : "text-blue-900";

    rows.push(
      <tr key={kCC} className={ccRowCls} onClick={() => toggle(kCC)}>
        <td className={`sticky left-0 z-10 ${isSentinel ? "bg-amber-50" : "bg-blue-50"} px-2 py-1 text-[11px] font-bold ${ccTextCls} whitespace-nowrap`}>
          <span className="inline-flex items-center gap-1">
            {openCC ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            {ccNode.cc_name}
          </span>
        </td>
        {months.map((m) => (
          <td key={m} className={`${numCell} font-bold ${mvCls(ccNode.byMonth[m])}`}>
            {fmtM(ccNode.byMonth[m])}
          </td>
        ))}
        <td className={`${numCell} font-bold ${mvCls(ccNode.total)}`}>{fmtM(ccNode.total)}</td>
      </tr>
    );

    if (!openCC) continue;

    for (const glNode of ccNode.gl_names) {
      const kGL = `gl:${ccNode.cc_key}|${glNode.gl_name}`;
      const openGL = exp.has(kGL);

      rows.push(
        <tr key={kGL} className="border-b border-gray-100 bg-gray-50 hover:bg-gray-100 cursor-pointer" onClick={() => toggle(kGL)}>
          <td className="sticky left-0 z-10 bg-gray-50 pl-6 pr-2 py-0.5 text-[11px] font-semibold text-gray-700 whitespace-nowrap">
            <span className="inline-flex items-center gap-1">
              {openGL ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
              {glNode.gl_name}
            </span>
          </td>
          {months.map((m) => (
            <td key={m} className={`${numCell} font-semibold ${mvCls(glNode.byMonth[m])}`}>
              {fmtM(glNode.byMonth[m])}
            </td>
          ))}
          <td className={`${numCell} font-semibold ${mvCls(glNode.total)}`}>{fmtM(glNode.total)}</td>
        </tr>
      );

      if (!openGL) continue;

      for (const tx of glNode.txs) {
        rows.push(
          <tr key={tx.id} className="border-b border-gray-50 bg-white hover:bg-blue-50/10">
            <td className="sticky left-0 z-10 bg-white pl-10 pr-2 py-0.5 text-[10px] text-gray-400 max-w-[260px] truncate whitespace-nowrap">
              {tx.desc ?? "—"}
            </td>
            {months.map((m) => {
              const match = m === tx.month;
              return (
                <td key={m} className={`${numCell} text-[10px] ${match ? mvCls(tx.mvmt) : ""}`}>
                  {match ? fmtM(tx.mvmt) : ""}
                </td>
              );
            })}
            <td className={`${numCell} text-[10px] ${mvCls(tx.mvmt)}`}>{fmtM(tx.mvmt)}</td>
          </tr>
        );
      }
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-auto"
         style={{ maxHeight: "calc(100vh - 160px)" }}>
      <table className="w-full border-collapse">
        <thead className="sticky top-0 z-20 bg-gray-50">
          <tr className="border-b border-gray-200">
            <th className="sticky left-0 z-30 bg-gray-50 px-3 py-1.5 text-left text-[10px] font-semibold text-gray-500 whitespace-nowrap">
              Cost Center / GL Name
            </th>
            {months.map((m) => (
              <th key={m} className="px-2 py-1.5 text-right text-[10px] font-semibold text-gray-500 whitespace-nowrap bg-gray-50">
                {m.slice(0, 3)}
              </th>
            ))}
            <th className="px-2 py-1.5 text-right text-[10px] font-semibold text-gray-500 whitespace-nowrap bg-gray-50 border-l border-gray-200">
              Total
            </th>
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  );
}
