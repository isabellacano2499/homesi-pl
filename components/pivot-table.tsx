"use client";

import { useMemo, useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import type { PLReportTx } from "@/types";

// ─── Constants ────────────────────────────────────────────────────────────────

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
type CodeNode = { code: string; byMonth: Record<string,number>; total: number; txs: TxLeaf[] };
type NameNode = { name: string; byMonth: Record<string,number>; total: number; codes: CodeNode[] };
type Cat7Node = { cat7: string; order2: number; byMonth: Record<string,number>; total: number; names: NameNode[] };
export type Cat2Node = { cat2: string; order1: number; byMonth: Record<string,number>; total: number; cat7s: Cat7Node[] };

function bm2rec(m: Map<string,number>): Record<string,number> {
  return Object.fromEntries(m);
}

export function buildPivot(txs: PLReportTx[]): { cat2s: Cat2Node[]; months: string[] } {
  type WCode = { bm: Map<string,number>; total: number; txs: TxLeaf[] };
  type WName = { bm: Map<string,number>; total: number; codes: Map<string,WCode> };
  type WCat7 = { order2: number; bm: Map<string,number>; total: number; names: Map<string,WName> };
  type WCat2 = { order1: number; bm: Map<string,number>; total: number; cat7s: Map<string,WCat7> };

  const cat2Map = new Map<string,WCat2>();
  const monthSet = new Set<string>();

  for (const tx of txs) {
    const cat2  = tx.category_2  ?? "Uncategorized";
    const cat7  = tx.category_7  ?? "(No Category 7)";
    const name  = tx.gl_name     ?? "(No GL Name)";
    const code  = tx.gl_code     ?? "(No GL Code)";
    const month = tx.month       ?? "Unknown";
    const mvmt  = tx.movement    ?? 0;
    if (tx.month) monthSet.add(tx.month);

    if (!cat2Map.has(cat2))
      cat2Map.set(cat2, { order1: tx.order_1 ?? 9999, bm: new Map(), total: 0, cat7s: new Map() });
    const wC2 = cat2Map.get(cat2)!;
    wC2.total += mvmt; wC2.bm.set(month, (wC2.bm.get(month)??0) + mvmt);

    if (!wC2.cat7s.has(cat7))
      wC2.cat7s.set(cat7, { order2: tx.order_2 ?? 9999, bm: new Map(), total: 0, names: new Map() });
    const wC7 = wC2.cat7s.get(cat7)!;
    wC7.total += mvmt; wC7.bm.set(month, (wC7.bm.get(month)??0) + mvmt);

    if (!wC7.names.has(name))
      wC7.names.set(name, { bm: new Map(), total: 0, codes: new Map() });
    const wN = wC7.names.get(name)!;
    wN.total += mvmt; wN.bm.set(month, (wN.bm.get(month)??0) + mvmt);

    if (!wN.codes.has(code))
      wN.codes.set(code, { bm: new Map(), total: 0, txs: [] });
    const wKode = wN.codes.get(code)!;
    wKode.total += mvmt; wKode.bm.set(month, (wKode.bm.get(month)??0) + mvmt);
    wKode.txs.push({ id: tx.id, month, branch: tx.branch, desc: tx.check_description, vendor: tx.vendor, ref: tx.ref_numb, debit: tx.debit, credit: tx.credit, mvmt });
  }

  const months = MONTH_ORDER.filter(m => monthSet.has(m));

  const cat2s: Cat2Node[] = [...cat2Map.entries()].map(([cat2, w]) => ({
    cat2, order1: w.order1, byMonth: bm2rec(w.bm), total: w.total,
    cat7s: [...w.cat7s.entries()].map(([cat7, wc7]) => ({
      cat7, order2: wc7.order2, byMonth: bm2rec(wc7.bm), total: wc7.total,
      names: [...wc7.names.entries()].map(([name, wn]) => ({
        name, byMonth: bm2rec(wn.bm), total: wn.total,
        codes: [...wn.codes.entries()].map(([code, wk]) => ({
          code, byMonth: bm2rec(wk.bm), total: wk.total, txs: wk.txs,
        })).sort((a,b) => a.code.localeCompare(b.code)),
      })).sort((a,b) => a.name.localeCompare(b.name)),
    })).sort((a,b) => a.order2 - b.order2),
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
function mvCls(n: number) { return n > 0 ? "text-green-700" : n < 0 ? "text-red-700" : "text-gray-300"; }

// ─── Cell helpers ─────────────────────────────────────────────────────────────

const numCell = "px-2 py-0.5 text-right tabular-nums font-mono text-[11px] whitespace-nowrap";
const hdrCell = "px-2 py-1 text-right text-[10px] font-semibold text-gray-500 whitespace-nowrap bg-gray-50";

function MCell({ v }: { v: number | undefined }) {
  const n = v ?? 0;
  return <td className={`${numCell} ${mvCls(n)}`}>{fmtM(n)}</td>;
}

// ─── PivotTable component ─────────────────────────────────────────────────────

interface PivotTableProps {
  txs: PLReportTx[];
  loading?: boolean;
  emptyMessage?: string;
}

export function PivotTable({ txs, loading, emptyMessage = "No data" }: PivotTableProps) {
  const { cat2s, months } = useMemo(() => buildPivot(txs), [txs]);
  const [exp, setExp] = useState<Set<string>>(new Set());

  function toggle(key: string) {
    setExp(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s; });
  }

  const colCount = months.length + 2; // label + months + total

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

  // Grand total
  const grandTotal = cat2s.reduce((s, c) => s + c.total, 0);
  const grandByMonth: Record<string,number> = {};
  for (const c of cat2s)
    for (const [m, v] of Object.entries(c.byMonth))
      grandByMonth[m] = (grandByMonth[m] ?? 0) + v;

  const rows: React.ReactNode[] = [];

  // ── Grand total row ──
  rows.push(
    <tr key="__grand__" className="border-b-2 border-gray-300 bg-[#0f1b2d]/5">
      <td className="sticky left-0 z-10 bg-[#0f1b2d]/5 px-3 py-1 text-[11px] font-bold text-gray-900 whitespace-nowrap">
        TOTAL
      </td>
      {months.map(m => <MCell key={m} v={grandByMonth[m]} />)}
      <td className={`${numCell} font-bold ${mvCls(grandTotal)}`}>{fmtM(grandTotal)}</td>
    </tr>
  );

  for (const c2 of cat2s) {
    const k2 = `c2:${c2.cat2}`;
    const open2 = exp.has(k2);

    // ── Cat2 row ──
    rows.push(
      <tr key={k2} className="border-b border-gray-200 bg-gray-100 hover:bg-gray-200/70 cursor-pointer"
          onClick={() => toggle(k2)}>
        <td className="sticky left-0 z-10 bg-gray-100 px-2 py-1 text-[11px] font-bold text-gray-800 whitespace-nowrap">
          <span className="inline-flex items-center gap-1">
            {open2 ? <ChevronDown size={11}/> : <ChevronRight size={11}/>}
            {c2.cat2}
          </span>
        </td>
        {months.map(m => <MCell key={m} v={c2.byMonth[m]} />)}
        <td className={`${numCell} font-bold ${mvCls(c2.total)}`}>{fmtM(c2.total)}</td>
      </tr>
    );

    if (!open2) continue;

    for (const c7 of c2.cat7s) {
      const k7 = `c7:${c2.cat2}|${c7.cat7}`;
      const open7 = exp.has(k7);

      // ── Cat7 row ──
      rows.push(
        <tr key={k7} className="border-b border-gray-100 bg-gray-50 hover:bg-blue-50/30 cursor-pointer"
            onClick={() => toggle(k7)}>
          <td className="sticky left-0 z-10 bg-gray-50 pl-6 pr-2 py-0.5 text-[11px] font-semibold text-gray-700 whitespace-nowrap">
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

      for (const nm of c7.names) {
        const kn = `gn:${c2.cat2}|${c7.cat7}|${nm.name}`;
        const openN = exp.has(kn);

        // ── GL Name row ──
        rows.push(
          <tr key={kn} className="border-b border-gray-50 hover:bg-blue-50/20 cursor-pointer"
              onClick={() => toggle(kn)}>
            <td className="sticky left-0 z-10 bg-white pl-10 pr-2 py-0.5 text-[11px] text-gray-700 whitespace-nowrap">
              <span className="inline-flex items-center gap-1">
                {openN ? <ChevronDown size={10}/> : <ChevronRight size={10}/>}
                {nm.name}
              </span>
            </td>
            {months.map(m => <MCell key={m} v={nm.byMonth[m]} />)}
            <td className={`${numCell} ${mvCls(nm.total)}`}>{fmtM(nm.total)}</td>
          </tr>
        );

        if (!openN) continue;

        for (const kode of nm.codes) {
          const kk = `gc:${c2.cat2}|${c7.cat7}|${nm.name}|${kode.code}`;
          const openK = exp.has(kk);

          // ── GL Code row ──
          rows.push(
            <tr key={kk} className="border-b border-gray-50 hover:bg-blue-50/30 cursor-pointer"
                onClick={() => toggle(kk)}>
              <td className="sticky left-0 z-10 bg-white pl-14 pr-2 py-0.5 text-[11px] font-mono text-gray-600 whitespace-nowrap">
                <span className="inline-flex items-center gap-1">
                  {openK ? <ChevronDown size={10}/> : <ChevronRight size={10}/>}
                  {kode.code}
                </span>
              </td>
              {months.map(m => <MCell key={m} v={kode.byMonth[m]} />)}
              <td className={`${numCell} ${mvCls(kode.total)}`}>{fmtM(kode.total)}</td>
            </tr>
          );

          if (!openK) continue;

          // ── Individual transaction rows in the same pivot matrix format ──
          // Each transaction occupies one row: description in the label column,
          // movement in its own month column only, total = that same movement.
          for (const t of kode.txs) {
            rows.push(
              <tr key={t.id} className="border-b border-gray-50 hover:bg-blue-50/10">
                <td className="sticky left-0 z-10 bg-white pl-16 pr-2 py-0.5 text-[10px] text-gray-500 max-w-[260px] truncate whitespace-nowrap">
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

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="sticky left-0 z-20 bg-gray-50 px-3 py-1 text-left text-[10px] font-semibold text-gray-500 whitespace-nowrap">
              Category
            </th>
            {months.map(m => (
              <th key={m} className={hdrCell}>{m.slice(0,3)}</th>
            ))}
            <th className={`${hdrCell} border-l border-gray-200`}>Total</th>
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  );
}
