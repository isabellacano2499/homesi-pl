"use client";

// ─── Pivot Table — P&L by GL ───────────────────────────────────────────────────
// Hierarchy (top → bottom):
//   Total Income  (navy, sticky)
//   Category 2    (blue-50, order_1)
//     Category 6  (indigo-50, order_2; "(No Category 6)" last)
//       Category 7  (gray-50, order_3)
//         "GL Code - GL Name"  (white, alphabetical by code)
//             Check Description 2  (sky-50, only for OA transactions)
//               Check Description 3 (sky-50/30, only for OA transactions)
//                 Transactions (leaf)
//             Transactions without CD2 (leaf)

import { useMemo, useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import type { PLReportTx } from "@/types";

// ─── Month order ──────────────────────────────────────────────────────────────

const MONTH_ORDER = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

// ─── Pivot data structure ─────────────────────────────────────────────────────

type TxLeaf = {
  id: string; month: string; branch: string | null;
  desc: string | null; vendor: string | null; ref: string | null;
  debit: number; credit: number; mvmt: number;
};
type Desc3Node = { desc3: string; byMonth: Record<string,number>; total: number; txs: TxLeaf[] };
type Desc2Node = { desc2: string; byMonth: Record<string,number>; total: number; desc3s: Desc3Node[] };
type GLNode    = { glKey: string; byMonth: Record<string,number>; total: number; txs: TxLeaf[]; desc2s: Desc2Node[] };
type Cat7Node  = { cat7: string; order3: number; byMonth: Record<string,number>; total: number; gls: GLNode[] };
type Cat6Node  = { cat6: string; order2: number; byMonth: Record<string,number>; total: number; cat7s: Cat7Node[] };
export type Cat2Node = { cat2: string; order1: number; byMonth: Record<string,number>; total: number; cat6s: Cat6Node[] };

function glLabel(code: string | null | undefined, name: string | null | undefined): string {
  const c = code?.trim();
  const n = name?.trim();
  if (c && n) return `${c} - ${n}`;
  return c || n || "(No GL)";
}

function bm2rec(m: Map<string,number>): Record<string,number> {
  return Object.fromEntries(m);
}

export function buildPivot(txs: PLReportTx[]): { cat2s: Cat2Node[]; months: string[] } {
  type WDesc3 = { bm: Map<string,number>; total: number; txs: TxLeaf[] };
  type WDesc2 = { bm: Map<string,number>; total: number; desc3s: Map<string,WDesc3> };
  type WGL    = { bm: Map<string,number>; total: number; txs: TxLeaf[]; desc2s: Map<string,WDesc2> };
  type WCat7  = { order3: number; bm: Map<string,number>; total: number; gls: Map<string,WGL> };
  type WCat6  = { order2: number; bm: Map<string,number>; total: number; cat7s: Map<string,WCat7> };
  type WCat2  = { order1: number; bm: Map<string,number>; total: number; cat6s: Map<string,WCat6> };

  const cat2Map  = new Map<string,WCat2>();
  const monthSet = new Set<string>();

  for (const tx of txs) {
    const cat2  = tx.category_2 ?? "Uncategorized";
    const cat6  = tx.category_6 ?? "(No Category 6)";
    const cat7  = tx.category_7 ?? "(No Category 7)";
    const glKey = glLabel(tx.gl_code, tx.gl_name);
    const month = tx.month ?? "Unknown";
    const mvmt  = tx.movement ?? 0;
    if (tx.month) monthSet.add(tx.month);

    if (!cat2Map.has(cat2))
      cat2Map.set(cat2, { order1: tx.order_1 ?? 9999, bm: new Map(), total: 0, cat6s: new Map() });
    const wC2 = cat2Map.get(cat2)!;
    wC2.total += mvmt; wC2.bm.set(month, (wC2.bm.get(month)??0) + mvmt);

    if (!wC2.cat6s.has(cat6))
      wC2.cat6s.set(cat6, { order2: 9999, bm: new Map(), total: 0, cat7s: new Map() });
    const wC6 = wC2.cat6s.get(cat6)!;
    if (tx.order_2 != null && tx.order_2 < wC6.order2) wC6.order2 = tx.order_2;
    wC6.total += mvmt; wC6.bm.set(month, (wC6.bm.get(month)??0) + mvmt);

    if (!wC6.cat7s.has(cat7))
      wC6.cat7s.set(cat7, { order3: tx.order_3 ?? 9999, bm: new Map(), total: 0, gls: new Map() });
    const wC7 = wC6.cat7s.get(cat7)!;
    wC7.total += mvmt; wC7.bm.set(month, (wC7.bm.get(month)??0) + mvmt);

    if (!wC7.gls.has(glKey))
      wC7.gls.set(glKey, { bm: new Map(), total: 0, txs: [], desc2s: new Map() });
    const wGL = wC7.gls.get(glKey)!;
    wGL.total += mvmt; wGL.bm.set(month, (wGL.bm.get(month)??0) + mvmt);

    const leaf: TxLeaf = {
      id: tx.id, month, branch: tx.branch,
      desc: tx.check_description, vendor: tx.vendor, ref: tx.ref_numb,
      debit: tx.debit, credit: tx.credit, mvmt,
    };

    const desc2 = (tx.check_description_2 ?? "").trim() || null;
    if (desc2) {
      const desc3 = (tx.check_description_3 ?? "").trim() || "(No Description 3)";
      if (!wGL.desc2s.has(desc2))
        wGL.desc2s.set(desc2, { bm: new Map(), total: 0, desc3s: new Map() });
      const wD2 = wGL.desc2s.get(desc2)!;
      wD2.total += mvmt; wD2.bm.set(month, (wD2.bm.get(month)??0) + mvmt);

      if (!wD2.desc3s.has(desc3))
        wD2.desc3s.set(desc3, { bm: new Map(), total: 0, txs: [] });
      const wD3 = wD2.desc3s.get(desc3)!;
      wD3.total += mvmt; wD3.bm.set(month, (wD3.bm.get(month)??0) + mvmt);
      wD3.txs.push(leaf);
    } else {
      wGL.txs.push(leaf);
    }
  }

  const months = MONTH_ORDER.filter(m => monthSet.has(m));

  const cat2s: Cat2Node[] = [...cat2Map.entries()].map(([cat2, wC2]) => ({
    cat2, order1: wC2.order1, byMonth: bm2rec(wC2.bm), total: wC2.total,
    cat6s: [...wC2.cat6s.entries()].map(([cat6, wC6]) => ({
      cat6, order2: wC6.order2, byMonth: bm2rec(wC6.bm), total: wC6.total,
      cat7s: [...wC6.cat7s.entries()].map(([cat7, wC7]) => ({
        cat7, order3: wC7.order3, byMonth: bm2rec(wC7.bm), total: wC7.total,
        gls: [...wC7.gls.entries()].map(([glKey, wGL]) => ({
          glKey, byMonth: bm2rec(wGL.bm), total: wGL.total,
          txs: wGL.txs,
          desc2s: [...wGL.desc2s.entries()].map(([desc2, wD2]) => ({
            desc2, byMonth: bm2rec(wD2.bm), total: wD2.total,
            desc3s: [...wD2.desc3s.entries()].map(([desc3, wD3]) => ({
              desc3, byMonth: bm2rec(wD3.bm), total: wD3.total,
              txs: wD3.txs,
            })).sort((a,b) => a.desc3.localeCompare(b.desc3)),
          })).sort((a,b) => a.desc2.localeCompare(b.desc2)),
        })).sort((a,b) => a.glKey.localeCompare(b.glKey)),
      })).sort((a,b) => a.order3 - b.order3),
    })).sort((a,b) => {
      if (a.cat6 === "(No Category 6)") return 1;
      if (b.cat6 === "(No Category 6)") return -1;
      return a.order2 - b.order2;
    }),
  })).sort((a,b) => {
    if (a.cat2 === "Uncategorized") return 1;
    if (b.cat2 === "Uncategorized") return -1;
    return a.order1 - b.order1;
  });

  return { cat2s, months };
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

function MCell({ v, bold }: { v: number | undefined; bold?: boolean }) {
  return <td className={`${numCell} ${bold ? "font-bold" : ""} ${mvCls(v)}`}>{fmtM(v)}</td>;
}

// ─── PivotTable ───────────────────────────────────────────────────────────────

interface PivotTableProps {
  txs: PLReportTx[];
  loading?: boolean;
  emptyMessage?: string;
}

const TOTAL_BG = "#1e3a5f";

export function PivotTable({ txs, loading, emptyMessage = "No data" }: PivotTableProps) {
  const { cat2s, months } = useMemo(() => buildPivot(txs), [txs]);
  const [exp, setExp] = useState<Set<string>>(new Set());

  function toggle(key: string) {
    setExp(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s; });
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-xs text-gray-400">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600" />
        Loading…
      </div>
    );
  }
  if (cat2s.length === 0) {
    return <p className="py-8 text-center text-xs text-gray-400">{emptyMessage}</p>;
  }

  const grandTotal = cat2s.reduce((s, c) => s + c.total, 0);
  const grandByMonth: Record<string,number> = {};
  for (const c of cat2s)
    for (const [m, v] of Object.entries(c.byMonth))
      grandByMonth[m] = (grandByMonth[m] ?? 0) + v;

  const rows: React.ReactNode[] = [];

  const gtBase: React.CSSProperties = {
    position: "sticky", top: "30px", zIndex: 14, backgroundColor: TOTAL_BG,
  };

  rows.push(
    <tr key="__grand__" className="border-b border-white/10">
      <td style={{ ...gtBase, left: 0, zIndex: 20 }}
          className="px-3 py-2 text-[11px] font-extrabold text-white whitespace-nowrap">
        Total Income
      </td>
      {months.map(m => (
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

  for (const c2 of cat2s) {
    const k2 = `c2:${c2.cat2}`;
    const open2 = exp.has(k2);

    rows.push(
      <tr key={k2}
          className="border-b border-blue-100 bg-blue-50 hover:bg-blue-100 cursor-pointer"
          onClick={() => toggle(k2)}>
        <td className="sticky left-0 z-10 bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-900 whitespace-nowrap">
          <span className="inline-flex items-center gap-1">
            {open2 ? <ChevronDown size={11}/> : <ChevronRight size={11}/>}
            {c2.cat2}
          </span>
        </td>
        {months.map(m => <MCell key={m} v={c2.byMonth[m]} bold />)}
        <td className={`${numCell} font-bold ${mvCls(c2.total)}`}>{fmtM(c2.total)}</td>
      </tr>
    );

    if (!open2) continue;

    for (const c6 of c2.cat6s) {
      const k6 = `c6:${c2.cat2}|${c6.cat6}`;
      const open6 = exp.has(k6);

      rows.push(
        <tr key={k6}
            className="border-b border-indigo-100 bg-indigo-50 hover:bg-indigo-100 cursor-pointer"
            onClick={() => toggle(k6)}>
          <td className="sticky left-0 z-10 bg-indigo-50 pl-6 pr-2 py-0.5 text-[11px] font-semibold text-indigo-800 whitespace-nowrap">
            <span className="inline-flex items-center gap-1">
              {open6 ? <ChevronDown size={10}/> : <ChevronRight size={10}/>}
              {c6.cat6}
            </span>
          </td>
          {months.map(m => <MCell key={m} v={c6.byMonth[m]} />)}
          <td className={`${numCell} font-semibold ${mvCls(c6.total)}`}>{fmtM(c6.total)}</td>
        </tr>
      );

      if (!open6) continue;

      for (const c7 of c6.cat7s) {
        const k7 = `c7:${c2.cat2}|${c6.cat6}|${c7.cat7}`;
        const open7 = exp.has(k7);

        rows.push(
          <tr key={k7}
              className="border-b border-gray-100 bg-gray-50 hover:bg-gray-100 cursor-pointer"
              onClick={() => toggle(k7)}>
            <td className="sticky left-0 z-10 bg-gray-50 pl-10 pr-2 py-0.5 text-[11px] font-semibold text-gray-700 whitespace-nowrap">
              <span className="inline-flex items-center gap-1">
                {open7 ? <ChevronDown size={10}/> : <ChevronRight size={10}/>}
                {c7.cat7}
              </span>
            </td>
            {months.map(m => <MCell key={m} v={c7.byMonth[m]} />)}
            <td className={`${numCell} font-semibold ${mvCls(c7.total)}`}>{fmtM(c7.total)}</td>
          </tr>
        );

        if (!open7) continue;

        for (const gl of c7.gls) {
          const kg = `gl:${c2.cat2}|${c6.cat6}|${c7.cat7}|${gl.glKey}`;
          const openG = exp.has(kg);

          rows.push(
            <tr key={kg}
                className="border-b border-gray-50 bg-white hover:bg-blue-50/30 cursor-pointer"
                onClick={() => toggle(kg)}>
              <td className="sticky left-0 z-10 bg-white pl-14 pr-2 py-0.5 text-[11px] text-gray-600 whitespace-nowrap">
                <span className="inline-flex items-center gap-1">
                  {openG ? <ChevronDown size={10}/> : <ChevronRight size={10}/>}
                  {gl.glKey}
                </span>
              </td>
              {months.map(m => <MCell key={m} v={gl.byMonth[m]} />)}
              <td className={`${numCell} ${mvCls(gl.total)}`}>{fmtM(gl.total)}</td>
            </tr>
          );

          if (!openG) continue;

          // ── Direct transaction leaves (Original/Addback — no CD2) ─────────
          for (const t of gl.txs) {
            rows.push(
              <tr key={t.id} className="border-b border-gray-50 bg-white hover:bg-blue-50/10">
                <td className="sticky left-0 z-10 bg-white pl-[72px] pr-2 py-0.5 text-[10px] text-gray-400 max-w-[260px] truncate whitespace-nowrap">
                  {t.desc ?? "—"}
                </td>
                {months.map(m => {
                  const match = m === t.month;
                  return (
                    <td key={m} className={`${numCell} text-[10px] ${match ? mvCls(t.mvmt) : ""}`}>
                      {match ? fmtM(t.mvmt) : ""}
                    </td>
                  );
                })}
                <td className={`${numCell} text-[10px] ${mvCls(t.mvmt)}`}>{fmtM(t.mvmt)}</td>
              </tr>
            );
          }

          // ── CD2 grouped leaves (Offshore Allocations only) ───────────────
          for (const d2 of gl.desc2s) {
            const kd2 = `d2:${c2.cat2}|${c6.cat6}|${c7.cat7}|${gl.glKey}|${d2.desc2}`;
            const openD2 = exp.has(kd2);

            rows.push(
              <tr key={kd2}
                  className="border-b border-sky-100 bg-sky-50 hover:bg-sky-100 cursor-pointer"
                  onClick={() => toggle(kd2)}>
                <td className="sticky left-0 z-10 bg-sky-50 pl-[72px] pr-2 py-0.5 text-[10px] font-semibold text-sky-700 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1">
                    {openD2 ? <ChevronDown size={9}/> : <ChevronRight size={9}/>}
                    {d2.desc2}
                  </span>
                </td>
                {months.map(m => <MCell key={m} v={d2.byMonth[m]} />)}
                <td className={`${numCell} ${mvCls(d2.total)}`}>{fmtM(d2.total)}</td>
              </tr>
            );

            if (!openD2) continue;

            for (const d3 of d2.desc3s) {
              const kd3 = `d3:${c2.cat2}|${c6.cat6}|${c7.cat7}|${gl.glKey}|${d2.desc2}|${d3.desc3}`;
              const openD3 = exp.has(kd3);

              rows.push(
                <tr key={kd3}
                    className="border-b border-sky-50 bg-white hover:bg-sky-50/50 cursor-pointer"
                    onClick={() => toggle(kd3)}>
                  <td className="sticky left-0 z-10 bg-white pl-[88px] pr-2 py-0.5 text-[10px] text-sky-600 whitespace-nowrap max-w-[260px] truncate">
                    <span className="inline-flex items-center gap-1">
                      {openD3 ? <ChevronDown size={9}/> : <ChevronRight size={9}/>}
                      {d3.desc3}
                    </span>
                  </td>
                  {months.map(m => <MCell key={m} v={d3.byMonth[m]} />)}
                  <td className={`${numCell} ${mvCls(d3.total)}`}>{fmtM(d3.total)}</td>
                </tr>
              );

              if (!openD3) continue;

              for (const t of d3.txs) {
                rows.push(
                  <tr key={t.id} className="border-b border-gray-50 bg-white hover:bg-sky-50/20">
                    <td className="sticky left-0 z-10 bg-white pl-[104px] pr-2 py-0.5 text-[10px] text-gray-400 max-w-[260px] truncate whitespace-nowrap">
                      {t.desc ?? "—"}
                    </td>
                    {months.map(m => {
                      const match = m === t.month;
                      return (
                        <td key={m} className={`${numCell} text-[10px] ${match ? mvCls(t.mvmt) : ""}`}>
                          {match ? fmtM(t.mvmt) : ""}
                        </td>
                      );
                    })}
                    <td className={`${numCell} text-[10px] ${mvCls(t.mvmt)}`}>{fmtM(t.mvmt)}</td>
                  </tr>
                );
              }
            }
          }
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
              Cat 2 / Cat 6 / Cat 7 / GL Code — GL Name
            </th>
            {months.map(m => (
              <th key={m} className="px-2 py-1.5 text-right text-[10px] font-semibold text-gray-500 whitespace-nowrap bg-gray-50">
                {m.slice(0,3)}
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
