"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Plus, Trash2, ChevronUp, ChevronDown, Save, X, Pencil, Unlink,
} from "lucide-react";
import {
  CC_FIELDS, TEXT_OPERATORS, NUMERIC_OPERATORS, BOOLEAN_OPERATORS,
  operatorsForField, defaultOperator, getFieldKind, defaultValue,
} from "@/lib/cost-center-constants";
import type { CostCenter, CostCenterRule, GLMapping } from "@/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

type RuleForm = {
  logic_connector: "AND" | "OR";
  field: string;
  operator: string;
  value: string;
};

const emptyForm = (): RuleForm => ({
  logic_connector: "AND",
  field: "gl_code",
  operator: "equals",
  value: "",
});

function fieldLabel(field: string) {
  return CC_FIELDS.find((f) => f.value === field)?.label ?? field;
}
function opLabel(field: string, op: string) {
  const ops = operatorsForField(field) as readonly { value: string; label: string }[];
  return ops.find((o) => o.value === op)?.label ?? op;
}

function ConnectorBadge({ connector, intra = false }: { connector: string | null; intra?: boolean }) {
  if (!connector) return <span className="text-gray-300 text-xs">—</span>;
  const colors = intra
    ? connector === "AND" ? "bg-indigo-100 text-indigo-700" : "bg-violet-100 text-violet-700"
    : connector === "AND" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700";
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${colors}`}>
      {connector}
    </span>
  );
}

function formatReevalMsg(j: { reevaluated?: number; reassigned?: number; unassigned?: number; conflicts?: number }): string {
  const n = j.reevaluated ?? 0;
  if (n === 0) return "";
  return (
    `${n} rule-assigned transaction${n !== 1 ? "s" : ""} re-evaluated: ` +
    `${j.reassigned ?? 0} reassigned, ${j.unassigned ?? 0} unassigned, ` +
    `${j.conflicts ?? 0} conflict${(j.conflicts ?? 0) !== 1 ? "s" : ""}.`
  );
}

// ─── Inline rule edit form ────────────────────────────────────────────────────

function RuleEditRow({
  rule, isFirst, glMappings, onSave, onCancel,
}: {
  rule: CostCenterRule; isFirst: boolean; glMappings: GLMapping[];
  onSave: (data: RuleForm) => Promise<void>; onCancel: () => void;
}) {
  const [form, setForm] = useState<RuleForm>({
    logic_connector: rule.logic_connector ?? "AND",
    field: rule.field, operator: rule.operator, value: rule.value,
  });
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");

  function setField<K extends keyof RuleForm>(key: K, val: RuleForm[K]) {
    setForm((prev) => {
      const next = { ...prev, [key]: val };
      if (key === "field") { next.operator = defaultOperator(val as string); next.value = defaultValue(val as string); }
      return next;
    });
  }

  async function handleSave() {
    setSaving(true); setSaveErr("");
    try { await onSave(form); }
    catch (e) { setSaveErr(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  }

  const fieldKind = getFieldKind(form.field);
  const isNumeric = fieldKind === "numeric";
  const isGLCode = form.field === "gl_code";
  const isBoolean = fieldKind === "boolean";
  const availableOps = isNumeric ? NUMERIC_OPERATORS : isBoolean ? BOOLEAN_OPERATORS : TEXT_OPERATORS;

  return (
    <tr className="border-b border-blue-100 bg-blue-50/40">
      <td className="pl-4 pr-2 py-2" />
      <td className="w-5 px-0 py-0" />
      <td className="px-4 py-2 text-gray-400 text-xs">{rule.sequence}</td>
      <td className="px-4 py-2">
        {isFirst ? (
          <span className="text-gray-300 text-xs">—</span>
        ) : (
          <select value={form.logic_connector}
            onChange={(e) => setField("logic_connector", e.target.value as "AND" | "OR")}
            className="rounded border border-gray-200 bg-white px-2 py-1 text-xs focus:border-blue-400 focus:outline-none">
            <option value="AND">AND</option>
            <option value="OR">OR</option>
          </select>
        )}
      </td>
      <td className="px-4 py-2">
        <select value={form.field} onChange={(e) => {
          const field = e.target.value;
          setField("field", field);
          setField("operator", defaultOperator(field));
          setField("value", defaultValue(field));
        }}
          className="rounded border border-gray-200 bg-white px-2 py-1 text-xs focus:border-blue-400 focus:outline-none">
          {CC_FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
      </td>
      <td className="px-4 py-2">
        <select value={form.operator} onChange={(e) => setField("operator", e.target.value)}
          className="rounded border border-gray-200 bg-white px-2 py-1 text-xs focus:border-blue-400 focus:outline-none">
          {availableOps.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </td>
      <td className="px-4 py-2">
        {isGLCode ? (
          <select value={form.value} onChange={(e) => setField("value", e.target.value)}
            className="rounded border border-gray-200 bg-white px-2 py-1 text-xs focus:border-blue-400 focus:outline-none min-w-[160px]">
            <option value="">Select GL Code…</option>
            {glMappings.map((m) => <option key={m.id} value={m.gl_code}>{m.gl_code} — {m.gl_name}</option>)}
          </select>
        ) : isBoolean ? (
          <select value={form.value} onChange={(e) => setField("value", e.target.value)}
            className="rounded border border-gray-200 bg-white px-2 py-1 text-xs focus:border-blue-400 focus:outline-none">
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        ) : (
          <input type={isNumeric ? "number" : "text"} value={form.value}
            onChange={(e) => setField("value", e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            className="rounded border border-gray-200 bg-white px-2 py-1 text-xs focus:border-blue-400 focus:outline-none min-w-[140px]" />
        )}
      </td>
      <td className="px-4 py-2">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-1 rounded bg-blue-600 px-2 py-1 text-[10px] text-white hover:bg-blue-700 disabled:opacity-50">
              <Save size={10} /> {saving ? "…" : "Save"}
            </button>
            <button onClick={onCancel}
              className="rounded border border-gray-200 px-2 py-1 text-[10px] text-gray-500 hover:bg-gray-50">
              <X size={10} />
            </button>
          </div>
          {saveErr && <p className="text-[10px] text-red-600">{saveErr}</p>}
        </div>
      </td>
    </tr>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CostCenterDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [cc, setCC] = useState<CostCenter | null>(null);
  const [rules, setRules] = useState<CostCenterRule[]>([]);
  const [loading, setLoading] = useState(true);

  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameErr, setNameErr] = useState("");

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<RuleForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState("");

  const [glMappings, setGlMappings] = useState<GLMapping[]>([]);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [moveErr, setMoveErr] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteRuleErr, setDeleteRuleErr] = useState("");
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [reevalMsg, setReevalMsg] = useState("");

  // Grouping state
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groupBusy, setGroupBusy] = useState(false);
  const [groupMsg, setGroupMsg] = useState("");

  const [unassigning, setUnassigning] = useState(false);
  const [unassignErr, setUnassignErr] = useState("");
  const [unassignOk, setUnassignOk] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/cost-centers/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      setCC(data);
      setRules(data.rules ?? []);
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Lazy-load GL mappings when gl_code field is selected
  useEffect(() => {
    const needGL = (adding && form.field === "gl_code") ||
      (editingRuleId !== null && rules.find((r) => r.id === editingRuleId)?.field === "gl_code");
    if (needGL && glMappings.length === 0) {
      fetch("/api/gl-mapping").then((r) => r.json()).then(setGlMappings).catch(console.error);
    }
  }, [adding, form.field, editingRuleId, rules, glMappings.length]);

  // ── Sorted rules + grouping helpers ─────────────────────────────────────────

  const sorted = useMemo(
    () => [...rules].sort((a, b) => a.sequence - b.sequence),
    [rules]
  );

  // Map: group_number → rules[] sorted by sequence (only for group_number > 0)
  const groupMap = useMemo(() => {
    const m = new Map<number, CostCenterRule[]>();
    for (const r of sorted) {
      if (r.group_number === 0) continue;
      const arr = m.get(r.group_number) ?? [];
      arr.push(r);
      m.set(r.group_number, arr);
    }
    return m;
  }, [sorted]);

  function isMultiGroup(rule: CostCenterRule): boolean {
    if (rule.group_number === 0) return false;
    return (groupMap.get(rule.group_number)?.length ?? 1) > 1;
  }

  type GPos = "only" | "first" | "mid" | "last";
  function groupPos(rule: CostCenterRule): GPos {
    if (!isMultiGroup(rule)) return "only";
    const g = groupMap.get(rule.group_number)!;
    const idx = g.indexOf(rule);
    if (g.length === 1) return "only";
    if (idx === 0) return "first";
    if (idx === g.length - 1) return "last";
    return "mid";
  }

  const selectedArr = useMemo(
    () => sorted.filter((r) => selected.has(r.id)),
    [sorted, selected]
  );
  const canGroup = selected.size >= 2;
  const canUngroup = selectedArr.some(isMultiGroup);

  // Ordered list of groups for the evaluation preview
  const groupsInOrder = useMemo(() => {
    const result: CostCenterRule[][] = [];
    const seen = new Set<number | string>();
    for (const r of sorted) {
      const key = r.group_number === 0 ? `_s${r.sequence}` : r.group_number;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(r.group_number === 0 ? [r] : (groupMap.get(r.group_number) ?? [r]));
      }
    }
    return result;
  }, [sorted, groupMap]);

  // ── Name edit ───────────────────────────────────────────────────────────────

  function startEditName() { setNameVal(cc?.name ?? ""); setNameErr(""); setEditingName(true); }

  async function saveName() {
    if (!nameVal.trim()) { setNameErr("Name is required"); return; }
    setSavingName(true); setNameErr("");
    try {
      const res = await fetch(`/api/cost-centers/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameVal.trim(), description: cc?.description }),
      });
      const json = await res.json();
      if (!res.ok) { setNameErr(json.error ?? "Failed to save"); return; }
      setCC((prev) => prev ? { ...prev, name: json.name } : prev);
      setEditingName(false);
    } finally { setSavingName(false); }
  }

  // ── Add rule ────────────────────────────────────────────────────────────────

  function setFormField<K extends keyof RuleForm>(key: K, val: RuleForm[K]) {
    setForm((prev) => {
      const next = { ...prev, [key]: val };
      if (key === "field") { next.operator = defaultOperator(val as string); next.value = defaultValue(val as string); }
      return next;
    });
  }

  async function handleAddRule() {
    if (!form.value.trim()) { setFormErr("Value is required"); return; }
    setSaving(true); setFormErr("");
    try {
      const res = await fetch(`/api/cost-centers/${id}/rules`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) { setFormErr(json.error ?? "Failed to save"); return; }
      setAdding(false); setForm(emptyForm()); load();
    } finally { setSaving(false); }
  }

  // ── Edit rule ───────────────────────────────────────────────────────────────

  async function handleEditRule(ruleId: string, data: RuleForm) {
    const res = await fetch(`/api/cost-centers/${id}/rules/${ruleId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error ?? "Failed to save rule");
    setEditingRuleId(null); setReevalMsg(formatReevalMsg(j)); load();
  }

  // ── Move rule ───────────────────────────────────────────────────────────────

  async function handleMove(ruleId: string, direction: "up" | "down") {
    setMovingId(ruleId); setMoveErr("");
    try {
      const res = await fetch(`/api/cost-centers/${id}/rules/${ruleId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); setMoveErr(j.error ?? "Failed to move"); return; }
      load();
    } catch (err) {
      setMoveErr(`Network error: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setMovingId(null); }
  }

  // ── Delete rule ─────────────────────────────────────────────────────────────

  async function handleDelete(ruleId: string) {
    if (!confirm("Delete this condition? Rule-assigned transactions for this cost center will be re-evaluated.")) return;
    setDeletingId(ruleId); setDeleteRuleErr(""); setReevalMsg("");
    try {
      const res = await fetch(`/api/cost-centers/${id}/rules/${ruleId}`, { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setDeleteRuleErr(j.error ?? "Failed to delete condition"); return; }
      setSelected((prev) => { const s = new Set(prev); s.delete(ruleId); return s; });
      setReevalMsg(formatReevalMsg(j)); load();
    } catch (err) {
      setDeleteRuleErr(`Network error: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setDeletingId(null); }
  }

  // ── Group / Ungroup ─────────────────────────────────────────────────────────

  async function handleGroupAction(action: "group" | "ungroup") {
    setGroupBusy(true); setGroupMsg(""); setReevalMsg("");
    try {
      const res = await fetch(`/api/cost-centers/${id}/rules`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, rule_ids: [...selected] }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setGroupMsg(j.error ?? `Failed to ${action}`); return; }
      setSelected(new Set());
      setReevalMsg(formatReevalMsg(j));
      load();
    } finally { setGroupBusy(false); }
  }

  // ── Unassign all ────────────────────────────────────────────────────────────

  async function handleUnassignAll() {
    setUnassignErr(""); setUnassignOk("");
    const countRes = await fetch(`/api/cost-centers/${id}/unassign-all`);
    const { count = 0, direct_count = 0, conflict_count = 0 } = await countRes.json().catch(() => ({}));
    if (count === 0) { setUnassignOk("No transactions are currently assigned to or in conflict with this cost center."); return; }
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

  // ── Render helpers ──────────────────────────────────────────────────────────

  const isFirstRule = sorted.length === 0;
  const newFieldKind = getFieldKind(form.field);
  const isNumericField = newFieldKind === "numeric";
  const isGLCode = form.field === "gl_code";
  const isBooleanField = newFieldKind === "boolean";
  const availableOps = isNumericField ? NUMERIC_OPERATORS : isBooleanField ? BOOLEAN_OPERATORS : TEXT_OPERATORS;
  const hasAnyGroup = sorted.some((r) => isMultiGroup(r));

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600" />
    </div>
  );
  if (!cc) return <p className="text-sm text-red-600">Cost center not found.</p>;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <Link href="/cost-centers" className="mb-3 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
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
            <button onClick={startEditName} title="Edit name"
              className="rounded p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50">
              <Pencil size={13} />
            </button>
          </div>
        )}
        {cc.description && <p className="text-sm text-gray-500">{cc.description}</p>}
      </div>

      {reevalMsg && (
        <p className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">{reevalMsg}</p>
      )}
      {groupMsg && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{groupMsg}</p>
      )}
      {(moveErr || deleteRuleErr) && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{moveErr || deleteRuleErr}</p>
      )}

      {/* Rules card */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        {/* Card header */}
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-3 flex-wrap gap-2">
          <span className="text-xs font-semibold text-gray-600">
            Conditions — evaluated in group order, groups left to right
          </span>
          <div className="flex items-center gap-2">
            {/* Selection toolbar */}
            {selected.size > 0 && (
              <div className="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5">
                <span className="text-xs text-indigo-600 font-medium">{selected.size} selected</span>
                {canGroup && (
                  <button
                    onClick={() => handleGroupAction("group")}
                    disabled={groupBusy}
                    title="Group selected conditions — they will be evaluated together before combining with the rest"
                    className="rounded bg-indigo-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
                  >
                    {groupBusy ? "…" : "( ) Group"}
                  </button>
                )}
                {canUngroup && (
                  <button
                    onClick={() => handleGroupAction("ungroup")}
                    disabled={groupBusy}
                    title="Break selected conditions out of their groups"
                    className="rounded border border-indigo-300 bg-white px-2 py-0.5 text-[10px] font-medium text-indigo-600 hover:bg-indigo-50 disabled:opacity-40"
                  >
                    {groupBusy ? "…" : "Ungroup"}
                  </button>
                )}
                <button
                  onClick={() => setSelected(new Set())}
                  className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] text-gray-500 hover:bg-gray-50"
                >
                  Clear
                </button>
              </div>
            )}
            <button
              onClick={() => { setAdding(true); setFormErr(""); }}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              <Plus size={12} /> Add Condition
            </button>
          </div>
        </div>

        {sorted.length === 0 && !adding ? (
          <p className="py-8 text-center text-xs text-gray-400">
            No conditions yet — add one to start matching transactions.
          </p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 text-left text-gray-400">
                <th className="w-8 pl-4 pr-2 py-2 font-medium" />
                <th className="w-5 px-0 py-2" />
                <th className="w-8 px-4 py-2 font-medium">#</th>
                <th className="w-24 px-4 py-2 font-medium">Connector</th>
                <th className="px-4 py-2 font-medium">Field</th>
                <th className="px-4 py-2 font-medium">Operator</th>
                <th className="px-4 py-2 font-medium">Value</th>
                <th className="w-32 px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((rule, i) => {
                if (editingRuleId === rule.id) {
                  return (
                    <RuleEditRow key={rule.id} rule={rule} isFirst={i === 0}
                      glMappings={glMappings}
                      onSave={(data) => handleEditRule(rule.id, data)}
                      onCancel={() => setEditingRuleId(null)} />
                  );
                }

                const multi = isMultiGroup(rule);
                const pos = groupPos(rule);
                const isRowFirst = i === 0;
                const isLastRow = i === sorted.length - 1;

                // Bracket character in the narrow indicator column
                const bracket = !multi ? null
                  : pos === "first" ? "⎡"
                  : pos === "last" ? "⎣"
                  : "⎢";

                // Connector display: first-in-group gets inter-group badge;
                // subsequent group members get intra-group badge (different color)
                const connNode = isRowFirst
                  ? <span className="text-gray-300 text-xs">—</span>
                  : (multi && pos !== "first")
                    ? <ConnectorBadge connector={rule.logic_connector} intra />
                    : <ConnectorBadge connector={rule.logic_connector} />;

                return (
                  <tr key={rule.id} className={[
                    "border-b hover:bg-gray-50/80 transition-colors",
                    multi ? "bg-indigo-50/30 border-gray-100" : "border-gray-50",
                    selected.has(rule.id) ? "!bg-indigo-100/40" : "",
                  ].join(" ")}>
                    {/* Checkbox */}
                    <td className="pl-4 pr-2 py-2.5">
                      <input
                        type="checkbox"
                        checked={selected.has(rule.id)}
                        onChange={(e) => {
                          setSelected((prev) => {
                            const s = new Set(prev);
                            if (e.target.checked) s.add(rule.id);
                            else s.delete(rule.id);
                            return s;
                          });
                        }}
                        className="h-3.5 w-3.5 accent-indigo-600 rounded cursor-pointer"
                      />
                    </td>

                    {/* Group bracket */}
                    <td className={[
                      "w-5 px-0 text-center text-sm select-none",
                      multi ? "text-indigo-400 font-light" : "text-transparent",
                    ].join(" ")}>
                      {bracket ?? "⎢"}
                    </td>

                    {/* Sequence */}
                    <td className="px-4 py-2.5 text-gray-400">{i + 1}</td>

                    {/* Connector + open paren for first-in-group */}
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1">
                        {connNode}
                        {multi && pos === "first" && (
                          <span className="font-mono font-bold text-indigo-400 text-xs">(</span>
                        )}
                      </span>
                    </td>

                    {/* Field */}
                    <td className="px-4 py-2.5 font-medium text-gray-800">{fieldLabel(rule.field)}</td>

                    {/* Operator */}
                    <td className="px-4 py-2.5 text-gray-600">{opLabel(rule.field, rule.operator)}</td>

                    {/* Value + close paren for last-in-group */}
                    <td className="max-w-[200px] px-4 py-2.5">
                      <span className="inline-flex items-center gap-1">
                        <span className="font-mono text-gray-700 truncate">{rule.value}</span>
                        {multi && pos === "last" && (
                          <span className="font-mono font-bold text-indigo-400 text-xs">)</span>
                        )}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setEditingRuleId(rule.id)} title="Edit"
                          className="rounded p-0.5 text-gray-400 hover:text-blue-600">
                          <Pencil size={12} />
                        </button>
                        <button onClick={() => handleMove(rule.id, "up")}
                          disabled={i === 0 || movingId === rule.id} title="Move up"
                          className="rounded p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-20">
                          <ChevronUp size={13} />
                        </button>
                        <button onClick={() => handleMove(rule.id, "down")}
                          disabled={isLastRow || movingId === rule.id} title="Move down"
                          className="rounded p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-20">
                          <ChevronDown size={13} />
                        </button>
                        <button onClick={() => handleDelete(rule.id)}
                          disabled={deletingId === rule.id} title="Delete"
                          className="rounded p-0.5 text-gray-400 hover:text-red-600 disabled:opacity-40">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Group legend */}
        {hasAnyGroup && (
          <p className="border-t border-gray-50 bg-gray-50/50 px-4 py-2 text-[10px] text-gray-400">
            Indigo brackets <span className="font-mono text-indigo-400">⎡ ⎢ ⎣</span> mark conditions in the same group — evaluated together before combining with adjacent groups.
            Select conditions and use <span className="font-semibold">( ) Group</span> / <span className="font-semibold">Ungroup</span> in the toolbar to edit grouping.
          </p>
        )}

        {/* Inline add-condition form */}
        {adding && (
          <div className="border-t border-blue-100 bg-blue-50/40 px-4 py-4 space-y-3">
            <p className="text-xs font-semibold text-gray-700">New condition</p>
            <div className="flex flex-wrap items-end gap-3">
              {!isFirstRule && (
                <div>
                  <label className="mb-1 block text-xs text-gray-500">Connector</label>
                  <select value={form.logic_connector}
                    onChange={(e) => setFormField("logic_connector", e.target.value as "AND" | "OR")}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs focus:border-blue-400 focus:outline-none">
                    <option value="AND">AND</option>
                    <option value="OR">OR</option>
                  </select>
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs text-gray-500">Field</label>
                <select value={form.field} onChange={(e) => setFormField("field", e.target.value)}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs focus:border-blue-400 focus:outline-none">
                  {CC_FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">Operator</label>
                <select value={form.operator} onChange={(e) => setFormField("operator", e.target.value)}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs focus:border-blue-400 focus:outline-none">
                  {availableOps.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="min-w-[180px]">
                <label className="mb-1 block text-xs text-gray-500">Value</label>
                {isGLCode ? (
                  <select value={form.value} onChange={(e) => setFormField("value", e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs focus:border-blue-400 focus:outline-none">
                    <option value="">Select GL Code…</option>
                    {glMappings.map((m) => <option key={m.id} value={m.gl_code}>{m.gl_code} — {m.gl_name}</option>)}
                  </select>
                ) : isBooleanField ? (
                  <select value={form.value} onChange={(e) => setFormField("value", e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs focus:border-blue-400 focus:outline-none">
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                ) : (
                  <input type={isNumericField ? "number" : "text"} value={form.value}
                    onChange={(e) => setFormField("value", e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddRule()}
                    placeholder="Value…" autoFocus
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs focus:border-blue-400 focus:outline-none" />
                )}
              </div>
              <div className="flex gap-2 pb-0.5">
                <button onClick={handleAddRule} disabled={saving}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                  <Save size={12} /> {saving ? "Saving…" : "Add"}
                </button>
                <button onClick={() => { setAdding(false); setForm(emptyForm()); setFormErr(""); }}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600 hover:bg-gray-50">
                  <X size={12} />
                </button>
              </div>
            </div>
            {formErr && <p className="text-xs text-red-600">{formErr}</p>}
          </div>
        )}
      </div>

      {/* Evaluation preview */}
      {sorted.length >= 1 && (
        <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
          <p className="text-xs text-gray-500 leading-relaxed flex flex-wrap items-center gap-x-0.5">
            <span className="font-semibold text-gray-700 mr-1">Evaluation:</span>
            {groupsInOrder.map((grp, gi) => (
              <span key={gi} className="inline-flex items-center gap-x-0.5 flex-wrap">
                {gi > 0 && (
                  <span className={`mx-1.5 font-bold ${
                    grp[0].logic_connector === "AND" ? "text-blue-600" : "text-purple-600"
                  }`}>
                    {grp[0].logic_connector}
                  </span>
                )}
                {grp.length > 1 && (
                  <span className="font-mono font-bold text-indigo-400 text-xs">(</span>
                )}
                {grp.map((r, ri) => (
                  <span key={r.id} className="inline-flex items-center gap-x-0.5">
                    {ri > 0 && (
                      <span className={`mx-1 font-bold text-xs ${
                        r.logic_connector === "AND" ? "text-indigo-600" : "text-violet-600"
                      }`}>
                        {r.logic_connector}
                      </span>
                    )}
                    <span className="inline-block rounded bg-white border border-gray-200 px-1.5 py-0.5 font-mono text-[10px]">
                      {fieldLabel(r.field)} {opLabel(r.field, r.operator)} &ldquo;{r.value}&rdquo;
                    </span>
                  </span>
                ))}
                {grp.length > 1 && (
                  <span className="font-mono font-bold text-indigo-400 text-xs">)</span>
                )}
              </span>
            ))}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            {hasAnyGroup
              ? "Conditions inside parentheses are evaluated as a unit, then combined with adjacent groups."
              : "Evaluated strictly left to right — select 2+ conditions and click \"( ) Group\" to add parentheses."}
          </p>
        </div>
      )}

      {/* Danger zone */}
      <div className="rounded-xl border border-amber-200 bg-amber-50/30 p-4 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-700">Danger Zone</h3>
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
            className="flex-shrink-0 flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50">
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
    </div>
  );
}
