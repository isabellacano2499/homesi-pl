"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  ALL_FIELDS,
  FIELD_LABELS,
  buildDynamicPivot,
  expandForOpNonOp,
  type ExpandedTx,
  type PivotField,
  type PivotNode,
} from "@/lib/pivot-engine";
import type { PLReportTx } from "@/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTH_ORDER = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const TOTAL_BG = "#1e3a5f";

const DEPTH_STYLES = [
  { bg: "#eff6ff", text: "text-blue-900",   font: "font-bold",     border: "border-blue-100"   },
  { bg: "#eef2ff", text: "text-indigo-800", font: "font-semibold", border: "border-indigo-100" },
  { bg: "#f9fafb", text: "text-gray-700",   font: "font-semibold", border: "border-gray-100"   },
  { bg: "#ffffff", text: "text-gray-600",   font: "",              border: "border-gray-50"    },
  { bg: "#ffffff", text: "text-gray-500",   font: "",              border: "border-gray-50"    },
] as const;

const numCell = "px-2 py-1 text-right text-[11px] tabular-nums whitespace-nowrap";

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtM(v: number | undefined): string {
  if (!v) return "—";
  return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function mvCls(v: number | undefined): string {
  if (!v) return "text-gray-300";
  return v > 0 ? "text-emerald-700" : "text-red-600";
}

function mvClsLight(v: number | undefined): string {
  if (!v) return "text-white/40";
  return v > 0 ? "text-emerald-300" : "text-red-300";
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface PivotTableDynamicProps {
  txs: PLReportTx[];
  defaultLevels: PivotField[];
  availableFields?: PivotField[];
  storageKey?: string;
  loading?: boolean;
  emptyMessage?: string;
}

// ─── Recursive renderer (mutates `rows` for performance) ─────────────────────

function renderPivotNodes(
  nodes: PivotNode[],
  depth: number,
  months: string[],
  exp: Set<string>,
  toggle: (k: string) => void,
  rows: React.ReactNode[],
  pathPrefix: string,
) {
  const ds = DEPTH_STYLES[Math.min(depth, DEPTH_STYLES.length - 1)];
  const pl = depth * 16 + 8;

  for (const node of nodes) {
    const nodeKey    = `${pathPrefix}|${node.field}:${node.key}`;
    const isOpen     = exp.has(nodeKey);
    const isOpNonOp  = node.field === "op_nonop";
    const isOp       = isOpNonOp && node.key === "Operational";
    const isNonOp    = isOpNonOp && node.key === "Non-Operational";
    const hasContent = node.children.length > 0 || node.txLeaves.length > 0;
    const canToggle  = hasContent || isOpNonOp;

    // Flat (no-level) case: render leaf rows directly without a group header
    if (node.key === "__flat__") {
      for (const t of node.txLeaves) {
        rows.push(
          <tr key={`flat|leaf:${t.id}`} className="border-b border-gray-50 hover:bg-blue-50/20">
            <td
              style={{ paddingLeft: 8, position: "sticky", left: 0, zIndex: 10, backgroundColor: "#fff" }}
              className="pr-2 py-0.5 text-[10px] text-gray-500 max-w-[280px] truncate whitespace-nowrap"
            >
              {t.desc ?? t.vendor ?? "—"}
            </td>
            {months.map(m => (
              <td key={m} className={`${numCell} text-[10px] ${m === t.month ? mvCls(t.mvmt) : "text-gray-200"}`}>
                {m === t.month ? fmtM(t.mvmt) : ""}
              </td>
            ))}
            <td className={`${numCell} text-[10px] ${mvCls(t.mvmt)} border-l border-gray-100`}>{fmtM(t.mvmt)}</td>
          </tr>
        );
      }
      continue;
    }

    // Determine row styling
    let rowBg: string;
    let firstTdExtra: React.CSSProperties = {};
    let textClass: string;
    let fontClass: string;
    let borderClass: string;

    if (isOp) {
      rowBg       = "#f0fdf4";
      firstTdExtra = { borderLeft: "3px solid #16a34a" };
      textClass   = "text-emerald-800";
      fontClass   = "font-bold";
      borderClass = "border-emerald-100";
    } else if (isNonOp) {
      rowBg       = "#f8fafc";
      firstTdExtra = { borderLeft: "3px solid #64748b" };
      textClass   = "text-slate-700";
      fontClass   = "font-bold";
      borderClass = "border-slate-200";
    } else {
      rowBg       = ds.bg;
      textClass   = ds.text;
      fontClass   = ds.font;
      borderClass = ds.border;
    }

    rows.push(
      <tr
        key={nodeKey}
        className={`border-b ${borderClass} ${canToggle ? "cursor-pointer" : ""}`}
        style={{ backgroundColor: rowBg }}
        onClick={() => { if (canToggle) toggle(nodeKey); }}
      >
        <td
          style={{ backgroundColor: rowBg, paddingLeft: pl, position: "sticky", left: 0, zIndex: 10, ...firstTdExtra }}
          className={`pr-2 py-1 text-[11px] ${textClass} ${fontClass} whitespace-nowrap max-w-[320px] truncate`}
        >
          <span className="inline-flex items-center gap-1">
            {canToggle
              ? (isOpen
                  ? <ChevronDown  size={10} className="shrink-0" />
                  : <ChevronRight size={10} className="shrink-0" />)
              : <span className="inline-block w-[10px]" />}
            {node.label}
          </span>
        </td>
        {months.map(m => (
          <td key={m} className={`${numCell} ${fontClass} ${mvCls(node.byMonth[m])}`}>
            {fmtM(node.byMonth[m])}
          </td>
        ))}
        <td className={`${numCell} ${fontClass} ${mvCls(node.total)} border-l border-gray-100`}>
          {fmtM(node.total)}
        </td>
      </tr>
    );

    if (!isOpen) continue;

    // Recurse into children
    if (node.children.length > 0) {
      renderPivotNodes(node.children, depth + 1, months, exp, toggle, rows, nodeKey);
    }

    // Leaf transaction rows
    if (node.txLeaves.length > 0) {
      const leafPl = (depth + 1) * 16 + 8;
      for (const t of node.txLeaves) {
        rows.push(
          <tr key={`${nodeKey}|leaf:${t.id}`} className="border-b border-gray-50 hover:bg-blue-50/20">
            <td
              style={{ paddingLeft: leafPl, position: "sticky", left: 0, zIndex: 10, backgroundColor: "#fff" }}
              className="pr-2 py-0.5 text-[10px] text-gray-400 max-w-[280px] truncate whitespace-nowrap"
            >
              {t.desc ?? t.vendor ?? "—"}
            </td>
            {months.map(m => (
              <td key={m} className={`${numCell} text-[10px] ${m === t.month ? mvCls(t.mvmt) : "text-gray-200"}`}>
                {m === t.month ? fmtM(t.mvmt) : ""}
              </td>
            ))}
            <td className={`${numCell} text-[10px] ${mvCls(t.mvmt)} border-l border-gray-100`}>{fmtM(t.mvmt)}</td>
          </tr>
        );
      }
    }

    // Op/NonOp empty state
    if (isOpNonOp && !hasContent) {
      const emptyPl  = (depth + 1) * 16 + 8;
      const emptyMsg = isOp
        ? "No Operational transactions yet."
        : "No Non-Operational transactions yet — classify rules or assignments as Non-Operational to see them here.";
      rows.push(
        <tr key={`${nodeKey}|empty`} className={`border-b ${isOp ? "border-emerald-100" : "border-slate-200"}`}>
          <td
            colSpan={months.length + 2}
            style={{ paddingLeft: emptyPl, backgroundColor: isOp ? "#f0fdf4" : "#f8fafc" }}
            className="py-3 text-[11px] italic text-gray-400"
          >
            {emptyMsg}
          </td>
        </tr>
      );
    }

    // Op/NonOp Net Income footer (when has content)
    if (isOpNonOp && hasContent) {
      const footerBg    = isOp ? "#dcfce7" : "#f1f5f9";
      const footerAcc   = isOp ? "#16a34a" : "#64748b";
      const footerText  = isOp ? "text-emerald-900" : "text-slate-800";
      const footerLabel = isOp ? "Net Income (Operational)" : "Net Income (Non-Operational)";
      rows.push(
        <tr key={`${nodeKey}|net`} style={{ backgroundColor: footerBg }} className="border-b border-gray-200">
          <td
            style={{ backgroundColor: footerBg, borderLeft: `3px solid ${footerAcc}`, paddingLeft: pl + 16, position: "sticky", left: 0, zIndex: 10 }}
            className={`pr-3 py-1.5 text-[11px] font-extrabold ${footerText} whitespace-nowrap`}
          >
            {footerLabel}
          </td>
          {months.map(m => (
            <td key={m} className={`${numCell} font-extrabold ${mvCls(node.byMonth[m])}`}>
              {fmtM(node.byMonth[m])}
            </td>
          ))}
          <td className={`${numCell} font-extrabold ${mvCls(node.total)} border-l border-gray-100`}>{fmtM(node.total)}</td>
        </tr>
      );
    }
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

function readStorage(key: string, defaultLevels: PivotField[]): PivotField[] {
  try {
    if (typeof window === "undefined") return defaultLevels;
    const raw = localStorage.getItem(key);
    if (!raw) return defaultLevels;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaultLevels;
    const valid = new Set<string>(ALL_FIELDS);
    // Discard entirely if any item is unrecognised (field was renamed/removed)
    if (!parsed.every((item): item is PivotField => typeof item === "string" && valid.has(item))) {
      return defaultLevels;
    }
    if (parsed.length === 0) return defaultLevels;
    return parsed;
  } catch {
    return defaultLevels;
  }
}

export function PivotTableDynamic({
  txs,
  defaultLevels,
  availableFields = ALL_FIELDS,
  storageKey,
  loading,
  emptyMessage = "No data",
}: PivotTableDynamicProps) {
  const [activeLevels, setActiveLevels] = useState<PivotField[]>(() =>
    storageKey ? readStorage(storageKey, defaultLevels) : defaultLevels
  );
  const [addOpen, setAddOpen] = useState(false);
  const [exp, setExp] = useState<Set<string>>(new Set());
  const addRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!addOpen) return;
    function onDown(e: MouseEvent) {
      if (addRef.current && !addRef.current.contains(e.target as Node)) {
        setAddOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [addOpen]);

  // Persist hierarchy to localStorage whenever it changes
  useEffect(() => {
    if (!storageKey) return;
    try { localStorage.setItem(storageKey, JSON.stringify(activeLevels)); } catch { /* ignore */ }
  }, [storageKey, activeLevels]);

  function toggle(key: string) {
    setExp(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s; });
  }

  function moveLevel(idx: number, dir: -1 | 1) {
    const swap = idx + dir;
    setActiveLevels(prev => {
      if (swap < 0 || swap >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
    setExp(new Set());
  }

  function removeLevel(idx: number) {
    setActiveLevels(prev => prev.filter((_, i) => i !== idx));
    setExp(new Set());
  }

  function addLevel(f: PivotField) {
    setActiveLevels(prev => [...prev, f]);
    setAddOpen(false);
    setExp(new Set());
  }

  function resetLevels() {
    setActiveLevels(defaultLevels);
    setExp(new Set());
  }

  const isDefault = useMemo(
    () => activeLevels.length === defaultLevels.length && activeLevels.every((f, i) => f === defaultLevels[i]),
    [activeLevels, defaultLevels],
  );

  const months = useMemo(() => {
    const s = new Set(txs.map(t => t.month).filter(Boolean) as string[]);
    return MONTH_ORDER.filter(m => s.has(m));
  }, [txs]);

  const grandTotal = useMemo(() => txs.reduce((s, t) => s + (t.movement ?? 0), 0), [txs]);
  const grandByMonth = useMemo(() => {
    const m: Record<string, number> = {};
    for (const tx of txs) {
      const month = tx.month ?? "Unknown";
      m[month] = (m[month] ?? 0) + (tx.movement ?? 0);
    }
    return m;
  }, [txs]);

  const hasNonOp = useMemo(() => txs.some(t => (t.operational_pct ?? 100) < 100), [txs]);

  const workingTxs = useMemo(
    () => activeLevels.includes("op_nonop") ? expandForOpNonOp(txs) : txs as ExpandedTx[],
    [txs, activeLevels],
  );

  const tree = useMemo(
    () => buildDynamicPivot(workingTxs, activeLevels),
    [workingTxs, activeLevels],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600" />
      </div>
    );
  }

  if (txs.length === 0) {
    return <p className="py-10 text-center text-sm text-gray-400">{emptyMessage}</p>;
  }

  const available   = availableFields.filter(f => !activeLevels.includes(f));
  const levelHeader = activeLevels.length > 0
    ? activeLevels.map(f => FIELD_LABELS[f]).join(" → ")
    : "All Transactions";

  const gtStyle: React.CSSProperties = {
    position: "sticky", top: 30, zIndex: 14, backgroundColor: TOTAL_BG,
  };

  const rows: React.ReactNode[] = [];

  // Total Income sticky row (always visible, based on raw txs)
  rows.push(
    <tr key="__grand__">
      <td
        style={{ ...gtStyle, left: 0, zIndex: 20, paddingLeft: 12 }}
        className="pr-3 py-2 text-[11px] font-extrabold text-white whitespace-nowrap"
      >
        Total Income
      </td>
      {months.map(m => (
        <td key={m} style={gtStyle} className={`${numCell} font-extrabold text-[12px] ${mvClsLight(grandByMonth[m])}`}>
          {fmtM(grandByMonth[m])}
        </td>
      ))}
      <td
        style={{ ...gtStyle, borderLeft: "1px solid rgba(255,255,255,0.15)" }}
        className={`${numCell} font-extrabold text-[12px] ${mvClsLight(grandTotal)}`}
      >
        {fmtM(grandTotal)}
      </td>
    </tr>
  );

  renderPivotNodes(tree, 0, months, exp, toggle, rows, "root");

  return (
    <div className="flex flex-col gap-2">
      {/* Hierarchy selector */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-2">
        <span className="mr-0.5 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          Pivot by:
        </span>

        {activeLevels.map((field, idx) => (
          <Fragment key={field}>
            {idx > 0 && <span className="select-none text-xs text-gray-300">→</span>}
            <div className="inline-flex items-center rounded border border-gray-200 bg-white text-[11px] shadow-sm">
              <button
                onClick={() => moveLevel(idx, -1)}
                disabled={idx === 0}
                title="Move left"
                className="px-1.5 py-0.5 text-gray-400 hover:text-gray-600 disabled:cursor-default disabled:opacity-20"
              >↑</button>
              <button
                onClick={() => moveLevel(idx, 1)}
                disabled={idx === activeLevels.length - 1}
                title="Move right"
                className="px-1.5 py-0.5 text-gray-400 hover:text-gray-600 disabled:cursor-default disabled:opacity-20"
              >↓</button>
              <span className="border-x border-gray-100 px-2 py-0.5 font-medium text-gray-700">
                {FIELD_LABELS[field]}
              </span>
              <button
                onClick={() => removeLevel(idx)}
                title="Remove level"
                className="px-1.5 py-0.5 text-gray-300 hover:text-red-400"
              >×</button>
            </div>
          </Fragment>
        ))}

        {/* Add level dropdown */}
        <div className="relative" ref={addRef}>
          <button
            onClick={() => setAddOpen(o => !o)}
            disabled={available.length === 0}
            className="rounded border border-dashed border-gray-300 px-2 py-0.5 text-[11px] text-gray-400 hover:border-blue-400 hover:text-blue-600 disabled:cursor-default disabled:opacity-30"
          >
            + Add level
          </button>
          {addOpen && (
            <div className="absolute left-0 top-full z-50 mt-1 min-w-[190px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
              {available.map(f => (
                <button
                  key={f}
                  onClick={() => addLevel(f)}
                  className="w-full px-3 py-1.5 text-left text-[11px] text-gray-700 hover:bg-gray-50"
                >
                  {FIELD_LABELS[f]}
                </button>
              ))}
            </div>
          )}
        </div>

        {!isDefault && (
          <button
            onClick={resetLevels}
            className="ml-1 text-[11px] text-blue-500 underline hover:text-blue-700"
          >
            Reset
          </button>
        )}
      </div>

      {/* Pivot table */}
      <div
        className="overflow-auto rounded-xl border border-gray-200 bg-white shadow-sm"
        style={{ maxHeight: "calc(100vh - 240px)" }}
      >
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-20 bg-gray-50">
            <tr className="border-b border-gray-200">
              <th className="sticky left-0 z-30 bg-gray-50 px-3 py-1.5 text-left text-[10px] font-semibold text-gray-500 whitespace-nowrap">
                {levelHeader}
              </th>
              {months.map(m => (
                <th key={m} className="bg-gray-50 px-2 py-1.5 text-right text-[10px] font-semibold text-gray-500 whitespace-nowrap">
                  {m.slice(0, 3)}
                </th>
              ))}
              <th className="border-l border-gray-200 bg-gray-50 px-2 py-1.5 text-right text-[10px] font-semibold text-gray-500 whitespace-nowrap">
                Total
              </th>
            </tr>
          </thead>
          <tbody>{rows}</tbody>
        </table>
      </div>
    </div>
  );
}
