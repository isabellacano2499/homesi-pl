"use client";

// ─── Pivot Table — P&L by Cost Center ─────────────────────────────────────────
// Hierarchy (top → bottom):
//   Total Income  (navy, sticky)
//   Operational   (emerald, expandable)
//     Category 6  (indigo, order_2)
//       Cost Center (blue / amber for unassigned/conflict)
//         GL Code - GL Name (gray)
//           Transactions (leaf)
//     Net Income (Operational)
//   Non-Operational (slate, expandable)
//     (same sub-hierarchy)
//     Net Income (Non-Operational)

import { useMemo, useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import type { PLReportTxCC } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type TxLeaf = { id: string; month: string; desc: string | null; mvmt: number };
type GLNode = { glKey: string; byMonth: Record<string, number>; total: number; txs: TxLeaf[] };
type CCNode = {
  cc_key: string;
  cc_name: string;
  order: number;
  byMonth: Record<string, number>;
  total: number;
  gl_nodes: GLNode[];
};
type Cat6Node = {
  cat6_key: string;
  cat6_name: string;
  order2: number;
  byMonth: Record<string, number>;
  total: number;
  cc_nodes: CCNode[];
};

function glLabel(code: string | null | undefined, name: string | null | undefined): string {
  const c = code?.trim();
  const n = name?.trim();
  if (c && n) return `${c} - ${n}`;
  return c || n || "(No GL)";
}

const MONTH_ORDER = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const TOTAL_BG     = "#1e3a5f";
const OP_ACCENT    = "#16a34a";   // green-600 — left-border accent only
const OP_HEADER_BG = "#f0fdf4";   // green-50
const OP_FOOTER_BG = "#dcfce7";   // green-100
const NOP_ACCENT    = "#64748b";  // slate-500 — left-border accent only
const NOP_HEADER_BG = "#f8fafc";  // slate-50
const NOP_FOOTER_BG = "#f1f5f9";  // slate-100

// ─── Build pivot ──────────────────────────────────────────────────────────────

export function buildPivotByCC(txs: PLReportTxCC[]): { cat6Nodes: Cat6Node[]; months: string[] } {
  type WGL  = { bm: Map<string, number>; total: number; txs: TxLeaf[] };
  type WCC  = { cc_name: string; order: number; bm: Map<string, number>; total: number; gl_map: Map<string, WGL> };
  type WCat = { order2: number; bm: Map<string, number>; total: number; cc_map: Map<string, WCC> };

  const cat6Map = new Map<string, WCat>();
  const monthSet = new Set<string>();

  for (const tx of txs) {
    const cat6_key  = tx.category_6 ?? "(No Category)";
    const month     = tx.month ?? "Unknown";
    const mvmt      = tx.movement ?? 0;
    const glKey     = glLabel(tx.gl_code, tx.gl_name);
    const desc      = tx.check_description;
    const order2    = tx.order_2 ?? 9999;

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

    if (!cat6Map.has(cat6_key)) cat6Map.set(cat6_key, { order2, bm: new Map(), total: 0, cc_map: new Map() });
    const wCat = cat6Map.get(cat6_key)!;
    wCat.total += mvmt; wCat.bm.set(month, (wCat.bm.get(month) ?? 0) + mvmt);

    if (!wCat.cc_map.has(cc_key)) wCat.cc_map.set(cc_key, { cc_name, order, bm: new Map(), total: 0, gl_map: new Map() });
    const wCC = wCat.cc_map.get(cc_key)!;
    wCC.total += mvmt; wCC.bm.set(month, (wCC.bm.get(month) ?? 0) + mvmt);

    if (!wCC.gl_map.has(glKey)) wCC.gl_map.set(glKey, { bm: new Map(), total: 0, txs: [] });
    const wGL = wCC.gl_map.get(glKey)!;
    wGL.total += mvmt; wGL.bm.set(month, (wGL.bm.get(month) ?? 0) + mvmt);
    wGL.txs.push({ id: tx.id, month, desc, mvmt });
  }

  const months = MONTH_ORDER.filter((m) => monthSet.has(m));

  const cat6Nodes: Cat6Node[] = [...cat6Map.entries()].map(([cat6_key, wCat]) => {
    const cc_nodes: CCNode[] = [...wCat.cc_map.entries()].map(([cc_key, wCC]) => ({
      cc_key, cc_name: wCC.cc_name, order: wCC.order,
      byMonth: Object.fromEntries(wCC.bm),
      total: wCC.total,
      gl_nodes: [...wCC.gl_map.entries()].map(([glKey, wGL]) => ({
        glKey,
        byMonth: Object.fromEntries(wGL.bm),
        total: wGL.total,
        txs: wGL.txs,
      })).sort((a, b) => a.glKey.localeCompare(b.glKey)),
    })).sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.cc_name.localeCompare(b.cc_name);
    });

    return {
      cat6_key,
      cat6_name: cat6_key,
      order2: wCat.order2,
      byMonth: Object.fromEntries(wCat.bm),
      total: wCat.total,
      cc_nodes,
    };
  }).sort((a, b) => {
    if (a.cat6_key === "(No Category)") return 1;
    if (b.cat6_key === "(No Category)") return -1;
    return a.order2 - b.order2;
  });

  return { cat6Nodes, months };
}

// ─── Scale a tx by a multiplier ───────────────────────────────────────────────

function scaleTxCC(tx: PLReportTxCC, factor: number): PLReportTxCC {
  return {
    ...tx,
    movement: (tx.movement ?? 0) * factor,
  };
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

// ─── Render cat6 nodes for one Op/NonOp block ─────────────────────────────────

function renderCat6Nodes(
  cat6Nodes: Cat6Node[],
  months: string[],
  prefix: string,
  exp: Set<string>,
  toggle: (k: string) => void,
): React.ReactNode[] {
  const rows: React.ReactNode[] = [];

  for (const cat6Node of cat6Nodes) {
    const kCat6   = `${prefix}:cat6:${cat6Node.cat6_key}`;
    const openCat6 = exp.has(kCat6);

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
      const kCC    = `${prefix}:cc:${cat6Node.cat6_key}|${ccNode.cc_key}`;
      const openCC = exp.has(kCC);

      const isSentinel = ccNode.cc_key === "unassigned" || ccNode.cc_key === "conflict";
      const ccBg     = isSentinel ? "bg-amber-50"   : "bg-blue-50";
      const ccHover  = isSentinel ? "hover:bg-amber-100" : "hover:bg-blue-100";
      const ccBorder = isSentinel ? "border-amber-100"   : "border-blue-100";
      const ccText   = isSentinel ? "text-amber-800"     : "text-blue-900";

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

      for (const glNode of ccNode.gl_nodes) {
        const kGL    = `${prefix}:gl:${cat6Node.cat6_key}|${ccNode.cc_key}|${glNode.glKey}`;
        const openGL = exp.has(kGL);

        rows.push(
          <tr key={kGL}
              className="border-b border-gray-100 bg-gray-50 hover:bg-gray-100 cursor-pointer"
              onClick={() => toggle(kGL)}>
            <td className="sticky left-0 z-10 bg-gray-50 pl-9 pr-2 py-0.5 text-[11px] text-gray-600 whitespace-nowrap">
              <span className="inline-flex items-center gap-1">
                {openGL ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
                {glNode.glKey}
              </span>
            </td>
            {months.map((m) => (
              <td key={m} className={`${numCell} ${mvCls(glNode.byMonth[m])}`}>
                {fmtM(glNode.byMonth[m])}
              </td>
            ))}
            <td className={`${numCell} ${mvCls(glNode.total)}`}>{fmtM(glNode.total)}</td>
          </tr>
        );

        if (!openGL) continue;

        for (const tx of glNode.txs) {
          rows.push(
            <tr key={`${prefix}:tx:${tx.id}`} className="border-b border-gray-50 bg-white hover:bg-blue-50/10">
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

  return rows;
}

// ─── PivotTableByCC ───────────────────────────────────────────────────────────

export function PivotTableByCC({
  txs, loading, emptyMessage = "No data",
}: {
  txs: PLReportTxCC[]; loading?: boolean; emptyMessage?: string;
}) {
  // Split proportionally into Operational and Non-Operational subsets
  const opTxs = useMemo(() =>
    txs
      .filter(tx => (tx.operational_pct ?? 100) > 0)
      .map(tx => scaleTxCC(tx, (tx.operational_pct ?? 100) / 100)),
    [txs]
  );
  const nonOpTxs = useMemo(() =>
    txs
      .filter(tx => (tx.operational_pct ?? 100) < 100)
      .map(tx => scaleTxCC(tx, (100 - (tx.operational_pct ?? 100)) / 100)),
    [txs]
  );

  const hasNonOp = nonOpTxs.length > 0;

  const { cat6Nodes: opCat6s }    = useMemo(() => buildPivotByCC(opTxs),    [opTxs]);
  const { cat6Nodes: nonOpCat6s } = useMemo(() => buildPivotByCC(nonOpTxs), [nonOpTxs]);

  const months = useMemo(() => {
    const s = new Set(txs.map(tx => tx.month).filter(Boolean) as string[]);
    return MONTH_ORDER.filter(m => s.has(m));
  }, [txs]);

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
  if (txs.length === 0) {
    return <p className="py-8 text-center text-xs text-gray-400">{emptyMessage}</p>;
  }

  // Block totals
  const opTotal    = opCat6s.reduce((s, c) => s + c.total, 0);
  const nonOpTotal = nonOpCat6s.reduce((s, c) => s + c.total, 0);
  const combinedTotal = opTotal + nonOpTotal;

  const opByMonth: Record<string, number> = {};
  for (const c of opCat6s) for (const [m, v] of Object.entries(c.byMonth))
    opByMonth[m] = (opByMonth[m] ?? 0) + v;

  const nonOpByMonth: Record<string, number> = {};
  for (const c of nonOpCat6s) for (const [m, v] of Object.entries(c.byMonth))
    nonOpByMonth[m] = (nonOpByMonth[m] ?? 0) + v;

  const combinedByMonth: Record<string, number> = {};
  for (const m of months)
    combinedByMonth[m] = (opByMonth[m] ?? 0) + (nonOpByMonth[m] ?? 0);

  const gtBase: React.CSSProperties = {
    position: "sticky", top: "30px", zIndex: 14, backgroundColor: TOTAL_BG,
  };

  const rows: React.ReactNode[] = [];

  // ── Sticky "Total Income" header ──────────────────────────────────────────
  rows.push(
    <tr key="__grand__" className="border-b border-white/10">
      <td style={{ ...gtBase, left: 0, zIndex: 20 }}
          className="px-3 py-2 text-[11px] font-extrabold text-white whitespace-nowrap">
        Total Income
      </td>
      {months.map((m) => (
        <td key={m} style={gtBase}
            className={`${numCell} font-extrabold text-[12px] ${mvClsLight(combinedByMonth[m])}`}>
          {fmtM(combinedByMonth[m])}
        </td>
      ))}
      <td style={{ ...gtBase, borderLeft: "1px solid rgba(255,255,255,0.15)" }}
          className={`${numCell} font-extrabold text-[12px] ${mvClsLight(combinedTotal)}`}>
        {fmtM(combinedTotal)}
      </td>
    </tr>
  );

  // ── Operational block ─────────────────────────────────────────────────────
  const opOpen = exp.has("__op__");
  rows.push(
    <tr key="__op__"
        className="border-b border-emerald-100 cursor-pointer hover:bg-emerald-50/60"
        style={{ backgroundColor: OP_HEADER_BG }}
        onClick={() => toggle("__op__")}>
      <td style={{ backgroundColor: OP_HEADER_BG, borderLeft: `3px solid ${OP_ACCENT}`, position: "sticky", left: 0, zIndex: 10 }}
          className="px-3 py-1.5 text-[11px] font-bold text-emerald-800 whitespace-nowrap">
        <span className="inline-flex items-center gap-1.5">
          {opOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          Operational
        </span>
      </td>
      {months.map((m) => (
        <td key={m} className={`${numCell} font-bold ${mvCls(opByMonth[m])}`}>
          {fmtM(opByMonth[m])}
        </td>
      ))}
      <td className={`${numCell} font-bold border-l border-emerald-100 ${mvCls(opTotal)}`}>
        {fmtM(opTotal)}
      </td>
    </tr>
  );

  if (opOpen) {
    if (opCat6s.length === 0) {
      rows.push(
        <tr key="__op_empty__" className="border-b border-emerald-100">
          <td style={{ position: "sticky", left: 0, zIndex: 10 }}
              className="bg-white pl-8 pr-3 py-3 text-[11px] italic text-gray-400 whitespace-nowrap">
            No Operational transactions yet.
          </td>
          {months.map((m) => <td key={m} className="bg-white" />)}
          <td className="bg-white border-l border-gray-100" />
        </tr>
      );
    } else {
      rows.push(...renderCat6Nodes(opCat6s, months, "op", exp, toggle));

      rows.push(
        <tr key="__op_net__" className="border-b border-emerald-200" style={{ backgroundColor: OP_FOOTER_BG }}>
          <td style={{ backgroundColor: OP_FOOTER_BG, borderLeft: `3px solid ${OP_ACCENT}`, position: "sticky", left: 0, zIndex: 10 }}
              className="pl-8 pr-3 py-1.5 text-[11px] font-extrabold text-emerald-900 whitespace-nowrap">
            Net Income (Operational)
          </td>
          {months.map((m) => (
            <td key={m} className={`${numCell} font-extrabold ${mvCls(opByMonth[m])}`}>
              {fmtM(opByMonth[m])}
            </td>
          ))}
          <td className={`${numCell} font-extrabold border-l border-emerald-200 ${mvCls(opTotal)}`}>
            {fmtM(opTotal)}
          </td>
        </tr>
      );
    }
  }

  // ── Non-Operational block ─────────────────────────────────────────────────
  const nonOpOpen = exp.has("__nonop__");
  rows.push(
    <tr key="__nonop__"
        className="border-b border-slate-200 cursor-pointer hover:bg-slate-100/60"
        style={{ backgroundColor: NOP_HEADER_BG }}
        onClick={() => toggle("__nonop__")}>
      <td style={{ backgroundColor: NOP_HEADER_BG, borderLeft: `3px solid ${NOP_ACCENT}`, position: "sticky", left: 0, zIndex: 10 }}
          className="px-3 py-1.5 text-[11px] font-bold text-slate-700 whitespace-nowrap">
        <span className="inline-flex items-center gap-1.5">
          {nonOpOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          Non-Operational
        </span>
      </td>
      {months.map((m) => (
        <td key={m} className={`${numCell} font-bold ${mvCls(nonOpByMonth[m])}`}>
          {fmtM(nonOpByMonth[m])}
        </td>
      ))}
      <td className={`${numCell} font-bold border-l border-slate-200 ${mvCls(nonOpTotal)}`}>
        {fmtM(nonOpTotal)}
      </td>
    </tr>
  );

  if (nonOpOpen) {
    if (!hasNonOp) {
      rows.push(
        <tr key="__nonop_empty__" className="border-b border-slate-200">
          <td style={{ position: "sticky", left: 0, zIndex: 10 }}
              className="bg-white pl-8 pr-3 py-3 text-[11px] italic text-gray-400 whitespace-nowrap">
            No Non-Operational transactions yet — classify rules or assignments as Non-Operational to see them here.
          </td>
          {months.map((m) => <td key={m} className="bg-white" />)}
          <td className="bg-white border-l border-gray-100" />
        </tr>
      );
    } else {
      rows.push(...renderCat6Nodes(nonOpCat6s, months, "nop", exp, toggle));

      rows.push(
        <tr key="__nonop_net__" className="border-b border-slate-300" style={{ backgroundColor: NOP_FOOTER_BG }}>
          <td style={{ backgroundColor: NOP_FOOTER_BG, borderLeft: `3px solid ${NOP_ACCENT}`, position: "sticky", left: 0, zIndex: 10 }}
              className="pl-8 pr-3 py-1.5 text-[11px] font-extrabold text-slate-800 whitespace-nowrap">
            Net Income (Non-Operational)
          </td>
          {months.map((m) => (
            <td key={m} className={`${numCell} font-extrabold ${mvCls(nonOpByMonth[m])}`}>
              {fmtM(nonOpByMonth[m])}
            </td>
          ))}
          <td className={`${numCell} font-extrabold border-l border-slate-300 ${mvCls(nonOpTotal)}`}>
            {fmtM(nonOpTotal)}
          </td>
        </tr>
      );
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-auto"
         style={{ maxHeight: "calc(100vh - 160px)" }}>
      <table className="w-full border-collapse">
        <thead className="sticky top-0 z-20 bg-gray-50">
          <tr className="border-b border-gray-200">
            <th className="sticky left-0 z-30 bg-gray-50 px-3 py-1.5 text-left text-[10px] font-semibold text-gray-500 whitespace-nowrap">
              Op/Non-Op / Category 6 / Cost Center / GL Code — GL Name
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
