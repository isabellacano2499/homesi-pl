"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, CheckCircle, ChevronDown, ChevronRight,
  RotateCcw, UserCheck, Layers, ClipboardList, Percent,
} from "lucide-react";
import { ReportFilter } from "@/components/report-filter";
import { SplitEditor } from "@/components/split-editor";
import { buildSplitsMap } from "@/lib/apply-splits";
import { useActiveBranches, mergeWithGlobal } from "@/components/branch-filter-provider";
import { SplitDisplay } from "@/components/split-display";
import type { SplitEntry } from "@/lib/apply-splits";
import type { CostCenter, ConflictGroup, ResolvedConflictGroup, AssignmentGroup, AssignmentTx, ConflictSplitProposal, ConflictTx } from "@/types";

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
function mvCls(n: number | null | undefined) {
  const v = n ?? 0;
  return v > 0 ? "text-green-700" : v < 0 ? "text-red-600" : "text-gray-400";
}

function branchParams(branches: string[]): string {
  if (branches.length === 0) return "";
  return "?" + branches.map((b) => `branch=${encodeURIComponent(b)}`).join("&");
}

function CD2Cell({ v }: { v: string | null | undefined }) {
  return v ? <span className="text-sky-700 truncate">{v}</span> : <span className="text-gray-300">—</span>;
}
function CD3Cell({ v }: { v: string | null | undefined }) {
  return v ? <span className="text-sky-600 truncate">{v}</span> : <span className="text-gray-300">—</span>;
}

// ─── Shared: assign multiple txs to a CC ─────────────────────────────────────

async function apiAssign(transactionIds: string[], costCenterId: string): Promise<string | null> {
  const res = await fetch("/api/cost-center-assignment/assign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transaction_ids: transactionIds, cost_center_id: costCenterId }),
  });
  if (!res.ok) { const j = await res.json(); return j.error ?? "Unknown error"; }
  return null;
}

// ─── Shared AssignTab ─────────────────────────────────────────────────────────

function AssignTab({
  costCenters, endpoint, mode, branches, showAllocationButtons = false,
}: {
  costCenters: CostCenter[];
  endpoint: string;
  mode: "assign" | "override";
  branches: string[];
  showAllocationButtons?: boolean;
}) {
  const [groups, setGroups] = useState<AssignmentGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [rowCc, setRowCc] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCcId, setBulkCcId] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  // Allocation buttons state (only active when showAllocationButtons)
  const [allSplits, setAllSplits] = useState<SplitEntry[]>([]);
  const [editingTx, setEditingTx] = useState<AssignmentTx | null>(null);
  const [txUnassigning, setTxUnassigning] = useState<string | null>(null);
  const [txUnassignBusy, setTxUnassignBusy] = useState(false);
  const splitsMap = useMemo(() => buildSplitsMap(allSplits), [allSplits]);

  const load = useCallback(async () => {
    setLoading(true); setMsg("");
    try {
      const fetches: Promise<void>[] = [
        fetch(`${endpoint}${branchParams(branches)}`)
          .then((r) => r.ok ? r.json() : null)
          .then((d) => { if (d) setGroups(d); }),
      ];
      if (showAllocationButtons) {
        fetches.push(
          fetch("/api/cc-allocation-splits")
            .then((r) => r.ok ? r.json() : [])
            .then(setAllSplits)
        );
      }
      await Promise.all(fetches);
    } finally { setLoading(false); }
  }, [endpoint, branches, showAllocationButtons]);

  useEffect(() => { load(); }, [load]);

  const totalCount = groups.reduce((s, g) => s + g.transactions.length, 0);

  function toggleGroup(key: string) {
    setCollapsed((prev) => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s; });
  }
  function toggleRow(id: string) {
    setSelected((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }
  function toggleGroupRows(group: AssignmentGroup) {
    const ids = group.transactions.map((t) => t.id);
    const allSel = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const s = new Set(prev);
      if (allSel) ids.forEach((id) => s.delete(id));
      else ids.forEach((id) => s.add(id));
      return s;
    });
  }

  async function assign(txIds: string[], ccId: string) {
    if (!ccId || !txIds.length) return;
    setSaving(true); setMsg("");
    try {
      const err = await apiAssign(txIds, ccId);
      if (err) { setMsg(`Error: ${err}`); return; }
      setSelected(new Set()); setBulkCcId(""); setRowCc({});
      load();
    } finally { setSaving(false); }
  }

  const editNormVendor = editingTx?.vendor?.trim().replace(/\s+/g, " ") || null;
  const editAssignType: "vendor" | "description3" = editNormVendor ? "vendor" : "description3";
  const editAssignValue = editNormVendor ?? (editingTx?.check_description_3 ?? "");

  async function handleTxUnassign(txId: string) {
    setTxUnassignBusy(true);
    try {
      await fetch("/api/cost-center-assignment/unassign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transaction_ids: [txId] }),
      });
      setTxUnassigning(null);
      load();
    } finally { setTxUnassignBusy(false); }
  }

  if (loading) return (
    <div className="py-10 text-center text-gray-400">
      <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600" />
    </div>
  );

  if (totalCount === 0) return (
    <div className="rounded-xl border border-green-100 bg-green-50 px-6 py-8 text-center">
      <CheckCircle size={20} className="mx-auto mb-2 text-green-500" />
      <p className="text-sm font-medium text-green-700">
        {mode === "assign" ? "No unassigned transactions." : "No rule-assigned transactions."}
        {branches.length > 0 && " (within selected branches)"}
      </p>
    </div>
  );

  const actionLabel = mode === "assign" ? "Assign" : "Override";
  const bgBanner = mode === "assign" ? "border-gray-200 bg-gray-50" : "border-blue-100 bg-blue-50";
  const textBanner = mode === "assign" ? "text-gray-600" : "text-blue-700";

  return (
    <div className="space-y-4">
      <div className={`flex flex-wrap items-center gap-3 rounded-xl border ${bgBanner} px-4 py-3`}>
        <span className={`text-xs font-medium ${textBanner}`}>
          {totalCount} transaction{totalCount !== 1 ? "s" : ""}
          {selected.size > 0 && ` · ${selected.size} selected`}
        </span>
        {selected.size > 0 && (
          <>
            <select
              value={bulkCcId}
              onChange={(e) => setBulkCcId(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 focus:border-blue-400 focus:outline-none"
            >
              <option value="">{actionLabel} to…</option>
              {costCenters.map((cc) => <option key={cc.id} value={cc.id}>{cc.name}</option>)}
            </select>
            <button
              onClick={() => assign([...selected], bulkCcId)}
              disabled={!bulkCcId || saving}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40"
            >
              {saving ? "Saving…" : `${actionLabel} ${selected.size}`}
            </button>
          </>
        )}
      </div>

      {msg && <p className="rounded-lg border border-red-100 bg-red-50 px-4 py-2 text-xs text-red-600">{msg}</p>}

      {groups.map((group) => {
        const key = group.gl_code;
        const isCollapsed = collapsed.has(key);
        const groupIds = group.transactions.map((t) => t.id);
        const groupAllSel = groupIds.every((id) => selected.has(id));

        return (
          <div key={key} className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div
              className="flex cursor-pointer items-center gap-3 border-b border-gray-100 bg-gray-50 px-4 py-2.5 hover:bg-gray-100"
              onClick={() => toggleGroup(key)}
            >
              <input
                type="checkbox" checked={groupAllSel}
                onChange={() => toggleGroupRows(group)}
                onClick={(e) => e.stopPropagation()}
                className="h-3.5 w-3.5 accent-blue-600 rounded"
              />
              {isCollapsed ? <ChevronRight size={13} className="text-gray-400" /> : <ChevronDown size={13} className="text-gray-400" />}
              <span className="text-xs font-semibold font-mono text-gray-800">{group.gl_code}</span>
              <span className="text-xs text-gray-500">{group.gl_name}</span>
              <span className="ml-auto text-xs text-gray-400">{group.transactions.length} tx</span>
            </div>

            {!isCollapsed && (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50 text-left text-gray-400">
                    <th className="w-8 px-4 py-2" />
                    <th className="px-3 py-2 font-medium">Month</th>
                    <th className="px-3 py-2 font-medium">Branch</th>
                    <th className="px-3 py-2 font-medium">Description</th>
                    <th className="px-3 py-2 font-medium">Check Desc 2</th>
                    <th className="px-3 py-2 font-medium">Check Desc 3</th>
                    <th className="px-3 py-2 font-medium">Vendor</th>
                    <th className="px-3 py-2 text-right font-medium">Movement</th>
                    {mode === "override" && <th className="px-3 py-2 font-medium">Current CC</th>}
                    <th className="px-3 py-2 font-medium">{actionLabel} to</th>
                    <th className="w-20 px-3 py-2" />
                    {showAllocationButtons && <th className="px-3 py-2 font-medium">Allocation</th>}
                  </tr>
                </thead>
                <tbody>
                  {group.transactions.map((tx: AssignmentTx) => {
                  const allocNorm = showAllocationButtons ? (tx.vendor?.trim().replace(/\s+/g, " ") || null) : null;
                  const allocValue = allocNorm ?? (showAllocationButtons ? (tx.check_description_3 ?? "") : "");
                  return (
                    <tr key={tx.id} className={`border-b border-gray-50 hover:bg-blue-50/20 ${selected.has(tx.id) ? "bg-blue-50/40" : ""}`}>
                      <td className="px-4 py-2">
                        <input
                          type="checkbox" checked={selected.has(tx.id)}
                          onChange={() => toggleRow(tx.id)}
                          className="h-3.5 w-3.5 accent-blue-600 rounded"
                        />
                      </td>
                      <td className="px-3 py-2 text-gray-700">{tx.month ?? "—"}</td>
                      <td className="px-3 py-2 text-gray-700">{tx.branch ?? "—"}</td>
                      <td className="max-w-[140px] truncate px-3 py-2 text-gray-600">{tx.check_description ?? "—"}</td>
                      <td className="max-w-[90px] truncate px-3 py-2"><CD2Cell v={tx.check_description_2} /></td>
                      <td className="max-w-[90px] truncate px-3 py-2"><CD3Cell v={tx.check_description_3} /></td>
                      <td className="max-w-[100px] truncate px-3 py-2 text-gray-600">{tx.vendor ?? "—"}</td>
                      <td className={`px-3 py-2 text-right font-mono ${mvCls(tx.movement)}`}>{fmt(tx.movement)}</td>
                      {mode === "override" && (
                        <td className="px-3 py-2">
                          {tx.cost_center_name
                            ? <span className="rounded bg-blue-100 px-1.5 py-0.5 text-blue-800 text-[10px] font-medium">{tx.cost_center_name}</span>
                            : <span className="text-gray-400">—</span>}
                        </td>
                      )}
                      <td className="px-3 py-2">
                        <select
                          value={rowCc[tx.id] ?? ""}
                          onChange={(e) => setRowCc((prev) => ({ ...prev, [tx.id]: e.target.value }))}
                          className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:border-blue-400 focus:outline-none"
                        >
                          <option value="">Choose…</option>
                          {costCenters.map((cc) => <option key={cc.id} value={cc.id}>{cc.name}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => assign([tx.id], rowCc[tx.id] ?? "")}
                          disabled={!rowCc[tx.id] || saving}
                          className="rounded-lg bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-30"
                        >
                          {actionLabel}
                        </button>
                      </td>
                      {showAllocationButtons && (
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {allocValue && (
                              <button
                                onClick={() => setEditingTx(tx)}
                                className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-600 hover:border-blue-300 hover:text-blue-700 whitespace-nowrap"
                              >
                                <Percent size={10} /> Edit allocation
                              </button>
                            )}
                            {txUnassigning === tx.id ? (
                              <span className="flex items-center gap-1 text-[11px]">
                                <span className="text-red-600 font-medium">Remove?</span>
                                <button
                                  onClick={() => handleTxUnassign(tx.id)}
                                  disabled={txUnassignBusy}
                                  className="rounded px-1.5 py-0.5 bg-red-600 text-white text-[10px] hover:bg-red-700 disabled:opacity-40"
                                >Yes</button>
                                <button
                                  onClick={() => setTxUnassigning(null)}
                                  className="rounded px-1.5 py-0.5 border border-gray-200 text-gray-500 text-[10px] hover:bg-gray-50"
                                >No</button>
                              </span>
                            ) : (
                              <button
                                onClick={() => setTxUnassigning(tx.id)}
                                className="rounded-lg border border-gray-100 px-2 py-1 text-[11px] text-red-400 hover:border-red-200 hover:text-red-600 whitespace-nowrap"
                              >Unassign</button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
                </tbody>
              </table>
            )}
          </div>
        );
      })}

      {showAllocationButtons && editingTx && (
        <SplitEditor
          assignType={editAssignType}
          assignValue={editAssignValue}
          displayName={editAssignValue}
          txCount={1}
          costCenters={costCenters}
          onClose={() => setEditingTx(null)}
          onSaved={() => { setEditingTx(null); load(); }}
        />
      )}
    </div>
  );
}

// ─── Unassigned / Assigned by Rule (wrappers) ─────────────────────────────────

function UnassignedTab({ costCenters, branches }: { costCenters: CostCenter[]; branches: string[] }) {
  return <AssignTab costCenters={costCenters} endpoint="/api/cost-center-assignment/unassigned" mode="assign" branches={branches} />;
}

function AssignedByRuleTab({ costCenters, branches }: { costCenters: CostCenter[]; branches: string[] }) {
  return <AssignTab costCenters={costCenters} endpoint="/api/cost-center-assignment/assigned-by-rule" mode="override" branches={branches} showAllocationButtons />;
}

// ─── Manual Assigned Tab ──────────────────────────────────────────────────────

function ManualTab({ branches, costCenters }: { branches: string[]; costCenters: CostCenter[] }) {
  const [groups, setGroups] = useState<AssignmentGroup[]>([]);
  const [allSplits, setAllSplits] = useState<SplitEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editingTx, setEditingTx] = useState<AssignmentTx | null>(null);
  const [unassigning, setUnassigning] = useState<string | null>(null);
  const [unassignBusy, setUnassignBusy] = useState(false);

  const splitsMap = useMemo(() => buildSplitsMap(allSplits), [allSplits]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [groupsRes, splitsRes] = await Promise.all([
        fetch(`/api/cost-center-assignment/manual${branchParams(branches)}`),
        fetch("/api/cc-allocation-splits"),
      ]);
      if (groupsRes.ok) setGroups(await groupsRes.json());
      if (splitsRes.ok) setAllSplits(await splitsRes.json());
    } finally { setLoading(false); }
  }, [branches]);

  useEffect(() => { load(); }, [load]);

  const totalCount = groups.reduce((s, g) => s + g.transactions.length, 0);

  function toggleGroup(key: string) {
    setCollapsed((prev) => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s; });
  }

  if (loading) return (
    <div className="py-10 text-center text-gray-400">
      <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600" />
    </div>
  );

  if (totalCount === 0) return (
    <p className="py-10 text-center text-sm text-gray-400">
      No manually assigned transactions{branches.length > 0 ? " in selected branches" : ""}.
    </p>
  );

  const editNormVendor = editingTx?.vendor?.trim().replace(/\s+/g, " ") || null;
  const editAssignType: "vendor" | "description3" = editNormVendor ? "vendor" : "description3";
  const editAssignValue = editNormVendor ?? (editingTx?.check_description_3 ?? "");

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400">{totalCount} manually assigned transaction{totalCount !== 1 ? "s" : ""} — permanent, never re-evaluated by reapply.</p>

      {groups.map((group) => {
        const key = group.gl_code;
        const isCollapsed = collapsed.has(key);
        return (
          <div key={key} className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div
              className="flex cursor-pointer items-center gap-3 border-b border-gray-100 bg-gray-50 px-4 py-2.5 hover:bg-gray-100"
              onClick={() => toggleGroup(key)}
            >
              {isCollapsed ? <ChevronRight size={13} className="text-gray-400" /> : <ChevronDown size={13} className="text-gray-400" />}
              <span className="text-xs font-semibold font-mono text-gray-800">{group.gl_code}</span>
              <span className="text-xs text-gray-500">{group.gl_name}</span>
              <span className="ml-auto text-xs text-gray-400">{group.transactions.length} tx</span>
            </div>

            {!isCollapsed && (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50 text-left text-gray-400">
                    <th className="px-4 py-2 font-medium">Month</th>
                    <th className="px-4 py-2 font-medium">Branch</th>
                    <th className="px-4 py-2 font-medium">Description</th>
                    <th className="px-4 py-2 font-medium">Check Desc 2</th>
                    <th className="px-4 py-2 font-medium">Check Desc 3</th>
                    <th className="px-4 py-2 font-medium">Vendor</th>
                    <th className="px-4 py-2 text-right font-medium">Movement</th>
                    <th className="px-4 py-2 font-medium">Assigned to</th>
                    <th className="px-4 py-2 font-medium">Allocation</th>
                  </tr>
                </thead>
                <tbody>
                  {group.transactions.map((tx: AssignmentTx) => {
                    const normVendor = tx.vendor?.trim().replace(/\s+/g, " ") || null;
                    const assignType: "vendor" | "description3" = normVendor ? "vendor" : "description3";
                    const assignValue = normVendor ?? (tx.check_description_3 ?? "");
                    const splitKey = assignValue ? `${assignType}:${assignValue}` : null;
                    const hasSplit = splitKey ? !!splitsMap.get(splitKey) : false;

                    return (
                      <tr key={tx.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-2 text-gray-700">{tx.month ?? "—"}</td>
                        <td className="px-4 py-2 text-gray-700">{tx.branch ?? "—"}</td>
                        <td className="max-w-[160px] truncate px-4 py-2 text-gray-600">{tx.check_description ?? "—"}</td>
                        <td className="max-w-[90px] truncate px-4 py-2"><CD2Cell v={tx.check_description_2} /></td>
                        <td className="max-w-[90px] truncate px-4 py-2"><CD3Cell v={tx.check_description_3} /></td>
                        <td className="max-w-[120px] truncate px-4 py-2 text-gray-600">{tx.vendor ?? "—"}</td>
                        <td className={`px-4 py-2 text-right font-mono ${mvCls(tx.movement)}`}>{fmt(tx.movement)}</td>
                        <td className="px-4 py-2">
                          {(() => {
                            const splits =
                              (normVendor ? splitsMap.get(`vendor:${normVendor}`) : undefined) ??
                              (tx.check_description_3 ? splitsMap.get(`description3:${tx.check_description_3}`) : undefined);
                            if (splits && splits.length > 0) {
                              return <SplitDisplay splits={splits} />;
                            }
                            return tx.cost_center_name
                              ? <span className="rounded bg-green-100 px-1.5 py-0.5 text-green-800 text-[10px] font-medium">{tx.cost_center_name}</span>
                              : <span className="text-gray-400">—</span>;
                          })()}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {assignValue && (
                              <button
                                onClick={() => setEditingTx(tx)}
                                className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-blue-300 hover:text-blue-700 whitespace-nowrap"
                              >
                                <Percent size={11} />
                                Edit allocation
                              </button>
                            )}
                            {unassigning === tx.id ? (
                              <span className="flex items-center gap-1 text-[11px]">
                                <span className="text-red-600 font-medium">Remove?</span>
                                <button
                                  onClick={async () => {
                                    setUnassignBusy(true);
                                    await fetch("/api/cost-center-assignment/unassign", {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ transaction_ids: [tx.id] }),
                                    });
                                    setUnassignBusy(false);
                                    setUnassigning(null);
                                    load();
                                  }}
                                  disabled={unassignBusy}
                                  className="rounded px-1.5 py-0.5 bg-red-600 text-white text-[10px] hover:bg-red-700 disabled:opacity-40"
                                >
                                  Yes
                                </button>
                                <button
                                  onClick={() => setUnassigning(null)}
                                  className="rounded px-1.5 py-0.5 border border-gray-200 text-gray-500 text-[10px] hover:bg-gray-50"
                                >
                                  No
                                </button>
                              </span>
                            ) : (
                              <button
                                onClick={() => setUnassigning(tx.id)}
                                title="Unassign this transaction"
                                className="rounded-lg border border-gray-100 px-2 py-1.5 text-[11px] text-red-400 hover:border-red-200 hover:text-red-600 whitespace-nowrap"
                              >
                                Unassign
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        );
      })}

      {editingTx && (
        <SplitEditor
          assignType={editAssignType}
          assignValue={editAssignValue}
          displayName={editAssignValue}
          txCount={1}
          costCenters={costCenters}
          onClose={() => setEditingTx(null)}
          onSaved={() => { setEditingTx(null); load(); }}
        />
      )}
    </div>
  );
}

// ─── Conflict detail cell ─────────────────────────────────────────────────────

function ConflictDetailCell({ tx }: { tx: ConflictTx }) {
  if (tx.conflicting_split_rules && tx.conflicting_split_rules.length > 0) {
    return (
      <div className="space-y-1.5 min-w-[200px]">
        {tx.conflicting_split_rules.map((sr: ConflictSplitProposal) => (
          <div key={sr.split_rule_id} className="rounded border border-purple-200 bg-purple-50 px-2 py-1.5">
            <div className="flex items-center gap-1 mb-1">
              <Percent size={9} className="text-purple-500 shrink-0" />
              <span className="text-[10px] font-semibold text-purple-700 truncate">{sr.split_rule_name}</span>
            </div>
            <div className="flex flex-wrap gap-x-2 gap-y-0.5">
              {sr.allocations.map((a) => (
                <span key={a.cost_center_id} className="text-[10px] text-purple-600 whitespace-nowrap">
                  <span className="font-medium">{a.percentage}%</span> {a.cc_name}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <span className="inline-flex flex-wrap gap-1">
      {tx.conflicting_ccs.map((cc) => (
        <span key={cc.id} className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800 font-medium">
          {cc.name}
        </span>
      ))}
    </span>
  );
}

// ─── Conflict (Pending) Tab ───────────────────────────────────────────────────

function ConflictTab({ costCenters, branches }: { costCenters: CostCenter[]; branches: string[] }) {
  const [groups, setGroups] = useState<ConflictGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [rowAssign, setRowAssign] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCcId, setBulkCcId] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setMsg("");
    try {
      const res = await fetch(`/api/conflicts${branchParams(branches)}`);
      if (res.ok) setGroups(await res.json());
    } finally { setLoading(false); }
  }, [branches]);

  useEffect(() => { load(); }, [load]);

  const totalCount = groups.reduce((s, g) => s + g.transactions.length, 0);

  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s; });
  }
  function toggleRow(id: string) {
    setSelected((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }
  function toggleGroupRows(group: ConflictGroup) {
    const ids = group.transactions.map((t) => t.id);
    const allSel = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const s = new Set(prev);
      if (allSel) ids.forEach((id) => s.delete(id));
      else ids.forEach((id) => s.add(id));
      return s;
    });
  }

  async function resolveRows(txIds: string[], ccId: string) {
    if (!ccId) return;
    setSaving(true); setMsg("");
    try {
      const res = await fetch("/api/conflicts/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transaction_ids: txIds, cost_center_id: ccId }),
      });
      if (!res.ok) { const j = await res.json(); setMsg(`Error: ${j.error}`); return; }
      setSelected(new Set()); setBulkCcId(""); setRowAssign({}); load();
    } finally { setSaving(false); }
  }

  if (loading) return (
    <div className="py-10 text-center text-gray-400">
      <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600" />
    </div>
  );
  if (totalCount === 0) return (
    <div className="rounded-xl border border-green-100 bg-green-50 px-6 py-8 text-center">
      <CheckCircle size={20} className="mx-auto mb-2 text-green-500" />
      <p className="text-sm font-medium text-green-700">
        No pending conflicts{branches.length > 0 ? " in selected branches" : ""}.
      </p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
        <AlertTriangle size={14} className="shrink-0 text-amber-500" />
        <span className="text-xs text-amber-700 font-medium">
          {totalCount} conflict{totalCount !== 1 ? "s" : ""}{selected.size > 0 && ` · ${selected.size} selected`}
        </span>
        {selected.size > 0 && (
          <>
            <select value={bulkCcId} onChange={(e) => setBulkCcId(e.target.value)}
              className="rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs text-gray-700 focus:border-blue-400 focus:outline-none">
              <option value="">Assign to…</option>
              {costCenters.map((cc) => <option key={cc.id} value={cc.id}>{cc.name}</option>)}
            </select>
            <button onClick={() => resolveRows([...selected], bulkCcId)} disabled={!bulkCcId || saving}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40">
              {saving ? "Saving…" : `Assign ${selected.size}`}
            </button>
          </>
        )}
      </div>

      {msg && <p className="rounded-lg border border-red-100 bg-red-50 px-4 py-2 text-xs text-red-600">{msg}</p>}

      {groups.map((group) => {
        const key = group.gl_code;
        const isCollapsed = collapsedGroups.has(key);
        const groupIds = group.transactions.map((t) => t.id);
        const groupAllSel = groupIds.every((id) => selected.has(id));
        return (
          <div key={key} className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="flex cursor-pointer items-center gap-3 border-b border-gray-100 bg-gray-50 px-4 py-2.5 hover:bg-gray-100"
              onClick={() => toggleGroup(key)}>
              <input type="checkbox" checked={groupAllSel} onChange={() => toggleGroupRows(group)}
                onClick={(e) => e.stopPropagation()} className="h-3.5 w-3.5 accent-blue-600 rounded" />
              {isCollapsed ? <ChevronRight size={13} className="text-gray-400" /> : <ChevronDown size={13} className="text-gray-400" />}
              <span className="text-xs font-semibold font-mono text-gray-800">{group.gl_code}</span>
              <span className="text-xs text-gray-500">{group.gl_name}</span>
              <span className="ml-auto text-xs text-amber-600 font-medium">{group.transactions.length} conflict{group.transactions.length !== 1 ? "s" : ""}</span>
            </div>
            {!isCollapsed && (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50 text-left text-gray-400">
                    <th className="w-8 px-4 py-2" />
                    <th className="px-3 py-2 font-medium">Month</th>
                    <th className="px-3 py-2 font-medium">Branch</th>
                    <th className="px-3 py-2 font-medium">Description</th>
                    <th className="px-3 py-2 font-medium">Check Desc 2</th>
                    <th className="px-3 py-2 font-medium">Check Desc 3</th>
                    <th className="px-3 py-2 font-medium">Vendor</th>
                    <th className="px-3 py-2 text-right font-medium">Movement</th>
                    <th className="px-3 py-2 font-medium">Conflict Details</th>
                    <th className="px-3 py-2 font-medium">Assign to</th>
                    <th className="w-20 px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {group.transactions.map((tx) => (
                    <tr key={tx.id} className={`border-b border-gray-50 hover:bg-amber-50/30 ${selected.has(tx.id) ? "bg-blue-50/40" : ""}`}>
                      <td className="px-4 py-2">
                        <input type="checkbox" checked={selected.has(tx.id)} onChange={() => toggleRow(tx.id)}
                          className="h-3.5 w-3.5 accent-blue-600 rounded" />
                      </td>
                      <td className="px-3 py-2 text-gray-700">{tx.month ?? "—"}</td>
                      <td className="px-3 py-2 text-gray-700">{tx.branch ?? "—"}</td>
                      <td className="max-w-[130px] truncate px-3 py-2 text-gray-600">{tx.check_description ?? "—"}</td>
                      <td className="max-w-[90px] truncate px-3 py-2"><CD2Cell v={tx.check_description_2} /></td>
                      <td className="max-w-[90px] truncate px-3 py-2"><CD3Cell v={tx.check_description_3} /></td>
                      <td className="max-w-[100px] truncate px-3 py-2 text-gray-600">{tx.vendor ?? "—"}</td>
                      <td className={`px-3 py-2 text-right font-mono ${mvCls(tx.movement)}`}>{fmt(tx.movement)}</td>
                      <td className="px-3 py-2">
                        <ConflictDetailCell tx={tx} />
                      </td>
                      <td className="px-3 py-2">
                        <select value={rowAssign[tx.id] ?? ""} onChange={(e) => setRowAssign((prev) => ({ ...prev, [tx.id]: e.target.value }))}
                          className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:border-blue-400 focus:outline-none">
                          <option value="">Choose…</option>
                          {costCenters.map((cc) => <option key={cc.id} value={cc.id}>{cc.name}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <button onClick={() => resolveRows([tx.id], rowAssign[tx.id] ?? "")}
                          disabled={!rowAssign[tx.id] || saving}
                          className="rounded-lg bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-30">
                          Assign
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Conflict Resolved Tab ────────────────────────────────────────────────────

function ConflictResolvedTab({
  costCenters, branches,
}: {
  costCenters: CostCenter[];
  branches: string[];
}) {
  const [groups, setGroups] = useState<ResolvedConflictGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [reopening, setReopening] = useState<string | null>(null);
  const [rowCcId, setRowCcId] = useState<Record<string, string>>({});
  const [reassigning, setReassigning] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setMsg("");
    try {
      const res = await fetch(`/api/conflicts/resolved${branchParams(branches)}`);
      if (res.ok) {
        const data = await res.json() as ResolvedConflictGroup[];
        setGroups(data);
        const initial: Record<string, string> = {};
        for (const g of data) for (const tx of g.transactions) {
          if ((tx as ResolvedConflictGroup["transactions"][number] & { cost_center_id?: string }).cost_center_id) {
            initial[tx.id] = (tx as ResolvedConflictGroup["transactions"][number] & { cost_center_id?: string }).cost_center_id!;
          }
        }
        setRowCcId(initial);
      }
    } finally { setLoading(false); }
  }, [branches]);

  useEffect(() => { load(); }, [load]);

  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s; });
  }

  async function handleReopen(txId: string) {
    setReopening(txId); setMsg("");
    try {
      const res = await fetch("/api/conflicts/reopen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transaction_id: txId }),
      });
      if (!res.ok) { const j = await res.json(); setMsg(`Error: ${j.error}`); return; }
      load();
    } finally { setReopening(null); }
  }

  async function handleReassign(txId: string, ccId: string) {
    if (!ccId) return;
    setReassigning(txId); setMsg("");
    try {
      const res = await fetch("/api/conflicts/reassign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transaction_id: txId, cost_center_id: ccId }),
      });
      if (!res.ok) { const j = await res.json(); setMsg(`Error: ${j.error}`); return; }
      load();
    } finally { setReassigning(null); }
  }

  const totalCount = groups.reduce((s, g) => s + g.transactions.length, 0);

  if (loading) return (
    <div className="py-10 text-center text-gray-400">
      <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600" />
    </div>
  );
  if (totalCount === 0) return (
    <p className="py-10 text-center text-sm text-gray-400">
      No resolved conflicts{branches.length > 0 ? " in selected branches" : ""}.
    </p>
  );

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400">{totalCount} resolved conflict{totalCount !== 1 ? "s" : ""}</p>
      {msg && <p className="rounded-lg border border-red-100 bg-red-50 px-4 py-2 text-xs text-red-600">{msg}</p>}

      {groups.map((group) => {
        const key = group.gl_code;
        const isCollapsed = collapsedGroups.has(key);
        return (
          <div key={key} className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="flex cursor-pointer items-center gap-3 border-b border-gray-100 bg-gray-50 px-4 py-2.5 hover:bg-gray-100"
              onClick={() => toggleGroup(key)}>
              {isCollapsed ? <ChevronRight size={13} className="text-gray-400" /> : <ChevronDown size={13} className="text-gray-400" />}
              <span className="text-xs font-semibold font-mono text-gray-800">{group.gl_code}</span>
              <span className="text-xs text-gray-500">{group.gl_name}</span>
              <span className="ml-auto text-xs text-gray-400">{group.transactions.length} resolved</span>
            </div>

            {!isCollapsed && (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50 text-left text-gray-400">
                    <th className="px-4 py-2 font-medium">Month</th>
                    <th className="px-4 py-2 font-medium">Branch</th>
                    <th className="px-4 py-2 font-medium">Description</th>
                    <th className="px-4 py-2 font-medium">Check Desc 2</th>
                    <th className="px-4 py-2 font-medium">Check Desc 3</th>
                    <th className="px-4 py-2 font-medium">Vendor</th>
                    <th className="px-4 py-2 text-right font-medium">Movement</th>
                    <th className="px-4 py-2 font-medium">Was conflicting</th>
                    <th className="px-4 py-2 font-medium">Assigned CC</th>
                    <th className="px-4 py-2 font-medium">Resolved at</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {group.transactions.map((tx) => {
                    const txWithCcId = tx as typeof tx & { cost_center_id?: string | null };
                    const currentCcId = rowCcId[tx.id] ?? txWithCcId.cost_center_id ?? "";
                    const resolvedCcId = txWithCcId.cost_center_id ?? "";
                    const isDirty = currentCcId !== resolvedCcId && currentCcId !== "";

                    return (
                      <tr key={tx.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-2 text-gray-700">{tx.month ?? "—"}</td>
                        <td className="px-4 py-2 text-gray-700">{tx.branch ?? "—"}</td>
                        <td className="max-w-[120px] truncate px-4 py-2 text-gray-600">{tx.check_description ?? "—"}</td>
                        <td className="max-w-[80px] truncate px-4 py-2"><CD2Cell v={tx.check_description_2} /></td>
                        <td className="max-w-[80px] truncate px-4 py-2"><CD3Cell v={tx.check_description_3} /></td>
                        <td className="max-w-[90px] truncate px-4 py-2 text-gray-600">{tx.vendor ?? "—"}</td>
                        <td className={`px-4 py-2 text-right font-mono ${mvCls(tx.movement)}`}>{fmt(tx.movement)}</td>
                        <td className="px-4 py-2">
                          <span className="inline-flex flex-wrap gap-1">
                            {tx.conflicting_ccs.map((cc) => (
                              <span key={cc.id} className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700 text-[10px]">{cc.name}</span>
                            ))}
                          </span>
                        </td>

                        <td className="px-4 py-2">
                          <div className="flex items-center gap-1.5">
                            <select
                              value={currentCcId}
                              onChange={(e) => setRowCcId((prev) => ({ ...prev, [tx.id]: e.target.value }))}
                              className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:border-blue-400 focus:outline-none max-w-[130px]"
                              disabled={reassigning === tx.id}
                            >
                              <option value="">Choose…</option>
                              {costCenters.map((cc) => (
                                <option key={cc.id} value={cc.id}>{cc.name}</option>
                              ))}
                            </select>
                            {isDirty && (
                              <button
                                onClick={() => handleReassign(tx.id, currentCcId)}
                                disabled={reassigning === tx.id}
                                className="rounded-lg bg-blue-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-blue-700 disabled:opacity-40 whitespace-nowrap"
                              >
                                {reassigning === tx.id ? "…" : "Save"}
                              </button>
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-2 text-gray-400">
                          {tx.resolved_at ? new Date(tx.resolved_at).toLocaleDateString() : "—"}
                        </td>
                        <td className="px-4 py-2">
                          <button
                            onClick={() => handleReopen(tx.id)}
                            disabled={reopening === tx.id}
                            title="Reopen conflict"
                            className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-gray-500 hover:text-amber-700 hover:bg-amber-50 disabled:opacity-40"
                          >
                            <RotateCcw size={11} /> Reopen
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = "unassigned" | "assigned-by-rule" | "manual" | "conflict" | "conflict-resolved";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "unassigned",        label: "Unassigned",        icon: AlertTriangle },
  { id: "assigned-by-rule",  label: "Assigned by Rule",  icon: Layers },
  { id: "manual",            label: "Manual Assigned",   icon: UserCheck },
  { id: "conflict",          label: "Conflict",          icon: AlertTriangle },
  { id: "conflict-resolved", label: "Conflict Resolved", icon: ClipboardList },
];

export default function CCAssignmentPage() {
  const { activeBranches } = useActiveBranches();
  const [tab, setTab] = useState<Tab>("unassigned");
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [allBranches, setAllBranches] = useState<string[]>([]);
  // Effective branches = intersection of global filter and local selection
  const effectiveBranches = mergeWithGlobal(activeBranches, branches);

  useEffect(() => {
    fetch("/api/cost-centers")
      .then((r) => r.json())
      .then((data: CostCenter[]) => setCostCenters(data))
      .catch(console.error);

    fetch("/api/transactions/filter-options")
      .then((r) => r.json())
      .then((d: { branch: string[] }) => setAllBranches(d.branch ?? []))
      .catch(console.error);
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Cost Center Assignment</h2>
        <p className="text-sm text-gray-500">Assign, override, and resolve cost center conflicts.</p>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 font-medium">Filter by branch:</span>
        <ReportFilter label="Branch" options={allBranches} selected={branches} onChange={setBranches} />
      </div>

      <div className="flex gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1 w-fit flex-wrap">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={[
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                tab === t.id
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700",
              ].join(" ")}
            >
              <Icon size={13} />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "unassigned"        && <UnassignedTab costCenters={costCenters} branches={effectiveBranches} />}
      {tab === "assigned-by-rule"  && <AssignedByRuleTab costCenters={costCenters} branches={effectiveBranches} />}
      {tab === "manual"            && <ManualTab branches={effectiveBranches} costCenters={costCenters} />}
      {tab === "conflict"          && <ConflictTab costCenters={costCenters} branches={effectiveBranches} />}
      {tab === "conflict-resolved" && <ConflictResolvedTab costCenters={costCenters} branches={effectiveBranches} />}
    </div>
  );
}
