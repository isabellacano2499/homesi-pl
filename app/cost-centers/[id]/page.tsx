"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Pencil, Save, X, Unlink } from "lucide-react";
import { CC_FIELDS, operatorsForField } from "@/lib/cost-center-constants";
import type { CostCenter, SplitRuleWithDetails } from "@/types";
import { CCSummaryTab } from "./cc-summary";

type PageTab = "rules" | "summary";

// ─── Color accents (mirrors cost-centers list page) ──────────────────────────

const ACCENT_COLORS = [
  { dot: "bg-blue-300",    leftBar: "border-l-blue-300",    badge: "bg-blue-50 border-blue-200 text-blue-700"    },
  { dot: "bg-indigo-300",  leftBar: "border-l-indigo-300",  badge: "bg-indigo-50 border-indigo-200 text-indigo-700"  },
  { dot: "bg-violet-300",  leftBar: "border-l-violet-300",  badge: "bg-violet-50 border-violet-200 text-violet-700"  },
  { dot: "bg-teal-300",    leftBar: "border-l-teal-300",    badge: "bg-teal-50 border-teal-200 text-teal-700"    },
  { dot: "bg-amber-300",   leftBar: "border-l-amber-300",   badge: "bg-amber-50 border-amber-200 text-amber-700"   },
  { dot: "bg-emerald-300", leftBar: "border-l-emerald-300", badge: "bg-emerald-50 border-emerald-200 text-emerald-700" },
  { dot: "bg-rose-300",    leftBar: "border-l-rose-300",    badge: "bg-rose-50 border-rose-200 text-rose-700"    },
  { dot: "bg-orange-300",  leftBar: "border-l-orange-300",  badge: "bg-orange-50 border-orange-200 text-orange-700"  },
];

function ccColorIndex(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h) % ACCENT_COLORS.length;
}

function fieldLabel(field: string) {
  return CC_FIELDS.find((f) => f.value === field)?.label ?? field;
}
function opLabel(field: string, op: string) {
  const ops = operatorsForField(field) as readonly { value: string; label: string }[];
  return ops.find((o) => o.value === op)?.label ?? op;
}

export default function CostCenterDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [cc, setCC] = useState<CostCenter | null>(null);
  const [rules, setRules] = useState<SplitRuleWithDetails[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<PageTab>("rules");

  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameErr, setNameErr] = useState("");

  const [unassigning, setUnassigning] = useState(false);
  const [unassignErr, setUnassignErr] = useState("");
  const [unassignOk, setUnassignOk] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ccRes, rulesRes] = await Promise.all([
        fetch(`/api/cost-centers/${id}`),
        fetch(`/api/cost-centers/${id}/rules`),
      ]);
      if (ccRes.ok) setCC(await ccRes.json());
      if (rulesRes.ok) setRules(await rulesRes.json());
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function saveName() {
    if (!nameVal.trim()) { setNameErr("Name is required"); return; }
    setSavingName(true); setNameErr("");
    try {
      const res = await fetch(`/api/cost-centers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameVal.trim(), description: cc?.description }),
      });
      const json = await res.json();
      if (!res.ok) { setNameErr(json.error ?? "Failed to save"); return; }
      setCC((prev) => prev ? { ...prev, name: json.name } : prev);
      setEditingName(false);
    } finally { setSavingName(false); }
  }

  async function handleUnassignAll() {
    setUnassignErr(""); setUnassignOk("");
    const countRes = await fetch(`/api/cost-centers/${id}/unassign-all`);
    const { count = 0, direct_count = 0, conflict_count = 0 } = await countRes.json().catch(() => ({}));
    if (count === 0) {
      setUnassignOk("No transactions are currently assigned to or in conflict with this cost center.");
      return;
    }
    const parts: string[] = [];
    if (direct_count > 0) parts.push(`${direct_count} directly assigned transaction${direct_count !== 1 ? "s" : ""} will be fully reset`);
    if (conflict_count > 0) parts.push(`${conflict_count} unresolved conflict${conflict_count !== 1 ? "s" : ""} involving this cost center will be re-evaluated without it`);
    if (!confirm(`This will affect ${count} transaction${count !== 1 ? "s" : ""} total:\n${parts.map((p) => `• ${p}`).join("\n")}\n\nThis cannot be undone. Continue?`)) return;
    setUnassigning(true);
    try {
      const res = await fetch(`/api/cost-centers/${id}/unassign-all`, { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setUnassignErr(j.error ?? "Failed to unassign transactions"); return; }
      const lines: string[] = [];
      if ((j.unassigned ?? 0) > 0) lines.push(`${j.unassigned} directly assigned transaction${j.unassigned !== 1 ? "s" : ""} reset to unassigned.`);
      if ((j.conflict_reevaluated ?? 0) > 0) lines.push(`${j.conflict_reevaluated} conflict transaction${j.conflict_reevaluated !== 1 ? "s" : ""} re-evaluated: ${j.conflict_reassigned ?? 0} resolved, ${j.conflict_unassigned ?? 0} unassigned, ${j.conflict_still_conflicting ?? 0} still conflicting.`);
      if (lines.length === 0) lines.push("No transactions were affected.");
      setUnassignOk(lines.join(" ") + " This cost center can now be deleted.");
    } catch (err) {
      setUnassignErr(`Network error: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setUnassigning(false); }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600" />
    </div>
  );
  if (!cc) return <p className="text-sm text-red-600">Cost center not found.</p>;

  const color = ACCENT_COLORS[ccColorIndex(id)];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className={`border-l-4 pl-4 ${color.leftBar}`}>
        <Link href="/cost-centers" className="mb-2 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
          <ArrowLeft size={13} /> Back to Cost Centers
        </Link>

        {editingName ? (
          <div className="flex items-center gap-2">
            <input autoFocus type="text" value={nameVal}
              onChange={(e) => setNameVal(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveName()}
              className="rounded-lg border border-blue-400 px-3 py-1.5 text-xl font-bold text-gray-900 focus:outline-none" />
            <button onClick={saveName} disabled={savingName}
              className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
              <Save size={13} /> {savingName ? "…" : "Save"}
            </button>
            <button onClick={() => setEditingName(false)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50">
              <X size={13} />
            </button>
            {nameErr && <span className="text-xs text-red-600">{nameErr}</span>}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-gray-900">{cc.name}</h2>
            <button onClick={() => { setNameVal(cc.name); setNameErr(""); setEditingName(true); }} title="Edit name"
              className="rounded p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50">
              <Pencil size={13} />
            </button>
          </div>
        )}
        {cc.description && <p className="mt-0.5 text-sm text-gray-500">{cc.description}</p>}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-200">
        {(["rules", "summary"] as PageTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab === "rules" ? "Rules" : "Summary"}
          </button>
        ))}
      </div>

      {activeTab === "summary" && <CCSummaryTab ccId={id} />}

      {activeTab === "rules" && <>
      {/* Rules card */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-3">
          <span className="text-xs font-semibold text-gray-600">
            Rules that assign to this Cost Center
          </span>
          <Link href="/split-rules"
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800">
            <ExternalLink size={12} /> Open Rule Builder
          </Link>
        </div>

        {rules.length === 0 ? (
          <p className="py-10 text-center text-xs text-gray-400">
            No rules currently point to this cost center.{" "}
            <Link href="/split-rules" className="text-blue-500 hover:underline">Create one in Rules.</Link>
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {rules.map((rule) => {
              const myAlloc = rule.allocations.find((a) => a.cost_center_id === id);
              const pct = myAlloc?.percentage ?? 0;

              return (
                <div key={rule.id} className="px-4 py-4 space-y-2">
                  {/* Rule name + allocation badge */}
                  <div className="flex items-center gap-2">
                    <span className={`inline-block h-2 w-2 rounded-full ${color.dot} shrink-0`} />
                    <span className="text-sm font-semibold text-gray-800">{rule.name}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${color.badge}`}>
                      {pct}% to this CC
                    </span>
                    {rule.allocations.length > 1 && (
                      <span className="text-[10px] text-gray-400">
                        split: {rule.allocations.map((a) => `${a.percentage}%`).join(" + ")}
                      </span>
                    )}
                  </div>

                  {/* Conditions */}
                  {rule.conditions.length === 0 ? (
                    <p className="text-xs text-gray-500">No conditions — this rule matches nothing.</p>
                  ) : (
                    <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs text-gray-600">
                      {[...rule.conditions]
                        .sort((a, b) => a.sequence - b.sequence)
                        .map((c, i) => (
                          <span key={c.id} className="inline-flex items-center gap-1">
                            {i > 0 && c.logic_connector && (
                              <span className={`font-bold ${
                                c.logic_connector === "AND" ? "text-blue-600" : "text-gray-500"
                              }`}>
                                {c.logic_connector}
                              </span>
                            )}
                            <span className="inline-block rounded bg-gray-100 border border-gray-200 px-1.5 py-0.5 font-mono text-[10px]">
                              {fieldLabel(c.field)} {opLabel(c.field, c.operator)} &ldquo;{c.value}&rdquo;
                            </span>
                          </span>
                        ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Danger zone */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Danger Zone</h3>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-800">Unassign all transactions</p>
            <p className="mt-0.5 text-xs text-gray-500">
              Reset every transaction assigned to this cost center back to its original never-evaluated
              state — clears cost_center_id, assignment_origin, cost_center_status, and related conflict
              snapshots. Use this before deleting a cost center that still has assigned transactions.
            </p>
          </div>
          <button onClick={handleUnassignAll} disabled={unassigning}
            className="flex-shrink-0 flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            <Unlink size={12} />
            {unassigning ? "Unassigning…" : "Unassign all"}
          </button>
        </div>
        {unassignOk && (
          <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">{unassignOk}</p>
        )}
        {unassignErr && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{unassignErr}</p>
        )}
      </div>
      </>}
    </div>
  );
}
