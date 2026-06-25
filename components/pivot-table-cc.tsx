"use client";

import { useMemo, useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import type { PLReportTxCC } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type TxLeaf = { id: string; month: string; desc: string | null; mvmt: number };
type GLNameNode  = { gl_name: string; byMonth: Record<string, number>; total: number; txs: TxLeaf[] };
type CCNode = {
  cc_key: string;
  cc_name: string;
  order: number;   // 0=named CC, 1=Unassigned, 2=Conflict
  byMonth: Record<string, number>;
  total: number;
  gl_names: GLNameNode[];
};
type Cat6Node = {
  cat6_key: string;
  cat6_name: string;
  byMonth: Record<string, number>;
  total: number;
  cc_nodes: CCNode[];
};

const MONTH_ORDER = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const TOTAL_BG = "#1e3a5f";

// ─── Build pivot (4-level) ────────────────────────────────────────────────────

export function buildPivotByCC(txs: PLReportTxCC[]): { cat6Nodes: Cat6Node[]; months: string[] } {
  type WGL  = { bm: Map<string, number>; total: number; txs: TxLeaf[] };
  type WCC  = { cc_name: string; order: number; bm: Map<string, number>; total: number; gl_map: Map<string, WGL> };
  type WCat = { bm: Map<string, number>; total: number; cc_map: Map<string, WCC> };

  const cat6Map = new Map<string, WCat>();
  const monthSet = new Set<string>();

  for (const tx of txs) {
    const cat6_key  = tx.category_6 ?? "(No Category)";
    const month     = tx.month ?? "Unknown";
    const mvmt      = tx.movement ?? 0;
    const glN       = tx.gl_name ?? "(No GL Name)";
    const desc      = tx.check_description;

    let cc_key: string, cc_name: string, order: number;
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

    if (!cat6Map.has(cat6_key)) cat6Map.set(cat6_key, { bm: new Map(), total: 0, cc_map: new Map() });
    const wCat = cat6Map.get(cat6_key)!;
    wCat.total += mvmt; wCat.bm.set(month, (wCat.bm.get(month) ?? 0) + mvmt);

    if (!wCat.cc_map.has(cc_key)) wCat.cc_map.set(cc_key, { cc_name, order, bm: new Map(), total: 0, gl_map: new Map() });
    const wCC = wCat.cc_map.get(cc_key)!;
    wCC.total += mvmt; wCC.bm.set(month, (wCC.bm.get(month) ?? 0) + mvmt);

    if (!wCC.gl_map.has(glN)) wCC.gl_map.set(glN, { bm: new Map(), total: 0, txs: [] });
    const wGL = wCC.gl_map.get(glN)!;
    wGL.total += mvmt; wGL.bm.set(month, (wGL.bm.get(month) ?? 0) + mvmt);
    wGL.txs.push({ id: tx.id, month, desc, mvmt });
  }

  const months = MONTH_ORDER.filter((m) => monthSet.has(m));

  const cat6Nodes: Cat6Node[] = [...cat6Map.entries()].map(([cat6_key, wCat]) => {
    const cc_nodes: CCNode[] = [...wCat.cc_map.entries()].map(([cc_key, wCC]) => ({
      cc_key, cc_name: wCC.cc_name, order: wCC.order,
      byMonth: Object.fromEntries(wCC.bm),
      total: wCC.total,
      gl_names: [...wCC.gl_map.entries()].map(([gl_name, wGL]) => ({
        gl_name,
        byMonth: Object.fromEntries(wGL.bm),
        total: wGL.total,
        txs: wGL.txs,
      })).sort((a, b) => a.gl_name.localeCompare(b.gl_name)),
    })).sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.cc_name.localeCompare(b.cc_name);
    });

    return {
      cat6_key,
      cat6_name: cat6_key,
      byMonth: Object.fromEntries(wCat.bm),
      total: wCat.total,
      cc_nodes,
    };
  }).sort((a, b) => {
    // "(No Category)" goes last
    if (a.cat6_key === "(No Category)") return 1;
    if (b.cat6_key === "(No Category)") return -1;
    return a.cat6_name.localeCompare(b.cat6_name);
  });

  return { cat6Nodes, months };
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
  const { cat6Nodes, months } = useMemo(() => buildPivotByCC(txs), [txs]);
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
  if (cat6Nodes.length === 0) {
    return <p className="py-8 text-center text-xs text-gray-400">{emptyMessage}</p>;
  }

  const grandTotal = cat6Nodes.reduce((s, c) => s + c.total, 0);
  const grandByMonth: Record<string, number> = {};
  for (const c of cat6Nodes) for (const [m, v] of Object.entries(c.byMonth))
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

  for (const cat6Node of cat6Nodes) {
    const kCat6  = `cat6:${cat6Node.cat6_key}`;
    const openCat6 = exp.has(kCat6);

    // Category 6 row (level 1)
    rows.push(
      <tr key={kCat6}
          className="border-b border-indigo-100 bg-indigo-50 hover:bg-indigo-100 cursor-pointer"
          onClick={() => toggle(kCat6)}>
        <td className="sticky left-0 z-10 bg-indigo-50 px-2 py-1 text-[11px] font-bold text-indigo-900 whitespace-nowrap">
          <span className="inline-flex items-center gap-1">
            {openCat6 ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            {cat6Node.cat6_name}
          </span>
        </td>
        {months.map((m) => (
          <td key={m} className={`${numCell} font-bold ${mvCls(cat6Node.byMonth[m])}`}>
            {fmtM(cat6Node.byMonth[m])}
          </td>
        ))}
        <td className={`${numCell} font-bold ${mvCls(cat6Node.total)}`}>{fmtM(cat6Node.total)}</td>
      </tr>
    );

    if (!openCat6) continue;

    for (const ccNode of cat6Node.cc_nodes) {
      const kCC = `cc:${cat6Node.cat6_key}|${ccNode.cc_key}`;
      const openCC = exp.has(kCC);

      const isSentinel = ccNode.cc_key === "unassigned" || ccNode.cc_key === "conflict";
      const ccBg = isSentinel ? "bg-amber-50" : "bg-blue-50";
      const ccHover = isSentinel ? "hover:bg-amber-100" : "hover:bg-blue-100";
      const ccBorder = isSentinel ? "border-amber-100" : "border-blue-100";
      const ccText = isSentinel ? "text-amber-800" : "text-blue-900";

      // Cost Center row (level 2)
      rows.push(
        <tr key={kCC}
            className={`border-b ${ccBorder} ${ccBg} ${ccHover} cursor-pointer`}
            onClick={() => toggle(kCC)}>
          <td className={`sticky left-0 z-10 ${ccBg} pl-5 pr-2 py-1 text-[11px] font-bold ${ccText} whitespace-nowrap`}>
            <span className="inline-flex items-center gap-1">
              {openCC ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
              {ccNode.cc_name}
            </span>
          </td>
          {months.map((m) => (
            <td key={m} className={`${numCell} font-semibold ${mvCls(ccNode.byMonth[m])}`}>
              {fmtM(ccNode.byMonth[m])}
            </td>
          ))}
          <td className={`${numCell} font-semibold ${mvCls(ccNode.total)}`}>{fmtM(ccNode.total)}</td>
        </tr>
      );

      if (!openCC) continue;

      for (const glNode of ccNode.gl_names) {
        const kGL = `gl:${cat6Node.cat6_key}|${ccNode.cc_key}|${glNode.gl_name}`;
        const openGL = exp.has(kGL);

        // GL Name row (level 3)
        rows.push(
          <tr key={kGL}
              className="border-b border-gray-100 bg-gray-50 hover:bg-gray-100 cursor-pointer"
              onClick={() => toggle(kGL)}>
            <td className="sticky left-0 z-10 bg-gray-50 pl-9 pr-2 py-0.5 text-[11px] font-semibold text-gray-700 whitespace-nowrap">
              <span className="inline-flex items-center gap-1">
                {openGL ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
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

        // Description rows (level 4 — leaf)
        for (const tx of glNode.txs) {
          rows.push(
            <tr key={tx.id} className="border-b border-gray-50 bg-white hover:bg-blue-50/10">
              <td className="sticky left-0 z-10 bg-white pl-12 pr-2 py-0.5 text-[10px] text-gray-400 max-w-[280px] truncate whitespace-nowrap">
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
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-auto"
         style={{ maxHeight: "calc(100vh - 160px)" }}>
      <table className="w-full border-collapse">
        <thead className="sticky top-0 z-20 bg-gray-50">
          <tr className="border-b border-gray-200">
            <th className="sticky left-0 z-30 bg-gray-50 px-3 py-1.5 text-left text-[10px] font-semibold text-gray-500 whitespace-nowrap">
              Category 6 / Cost Center / GL Name
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
