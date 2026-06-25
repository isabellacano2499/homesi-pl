"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Plus, Trash2, ChevronUp, ChevronDown, Save, X, Pencil,
} from "lucide-react";
import {
  CC_FIELDS, TEXT_OPERATORS, NUMERIC_OPERATORS,
  operatorsForField, defaultOperator, getFieldKind,
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

function ConnectorBadge({ connector }: { connector: string | null }) {
  if (!connector) return <span className="text-gray-300 text-xs">—</span>;
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
        connector === "AND"
          ? "bg-blue-100 text-blue-700"
          : "bg-purple-100 text-purple-700"
      }`}
    >
      {connector}
    </span>
  );
}

function fieldLabel(field: string) {
  return CC_FIELDS.find((f) => f.value === field)?.label ?? field;
}

function opLabel(field: string, op: string) {
  const ops = operatorsForField(field) as readonly { value: string; label: string }[];
  return ops.find((o) => o.value === op)?.label ?? op;
}

// ─── Inline rule edit form ────────────────────────────────────────────────────

function RuleEditRow({
  rule,
  isFirst,
  glMappings,
  onSave,
  onCancel,
}: {
  rule: CostCenterRule;
  isFirst: boolean;
  glMappings: GLMapping[];
  onSave: (data: RuleForm) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<RuleForm>({
    logic_connector: rule.logic_connector ?? "AND",
    field: rule.field,
    operator: rule.operator,
    value: rule.value,
  });
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");

  function setField<K extends keyof RuleForm>(key: K, val: RuleForm[K]) {
    setForm((prev) => {
      const next = { ...prev, [key]: val };
      if (key === "field") {
        next.operator = defaultOperator(val as string);
        next.value = "";
      }
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setSaveErr("");
    try {
      await onSave(form);
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const isNumeric = getFieldKind(form.field) === "numeric";
  const isGLCode = form.field === "gl_code";
  const availableOps = isNumeric ? NUMERIC_OPERATORS : TEXT_OPERATORS;

  return (
    <tr className="border-b border-blue-100 bg-blue-50/40">
      <td className="px-4 py-2 text-gray-400 text-xs">{rule.sequence}</td>
      <td className="px-4 py-2">
        {isFirst ? (
          <span className="text-gray-300 text-xs">—</span>
        ) : (
          <select
            value={form.logic_connector}
            onChange={(e) => setField("logic_connector", e.target.value as "AND" | "OR")}
            className="rounded border border-gray-200 bg-white px-2 py-1 text-xs focus:border-blue-400 focus:outline-none"
          >
            <option value="AND">AND</option>
            <option value="OR">OR</option>
          </select>
        )}
      </td>
      <td className="px-4 py-2">
        <select
          value={form.field}
          onChange={(e) => setField("field", e.target.value)}
          className="rounded border border-gray-200 bg-white px-2 py-1 text-xs focus:border-blue-400 focus:outline-none"
        >
          {CC_FIELDS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </td>
      <td className="px-4 py-2">
        <select
          value={form.operator}
          onChange={(e) => setField("operator", e.target.value)}
          className="rounded border border-gray-200 bg-white px-2 py-1 text-xs focus:border-blue-400 focus:outline-none"
        >
          {availableOps.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </td>
      <td className="px-4 py-2">
        {isGLCode ? (
          <select
            value={form.value}
            onChange={(e) => setField("value", e.target.value)}
            className="rounded border border-gray-200 bg-white px-2 py-1 text-xs focus:border-blue-400 focus:outline-none min-w-[160px]"
          >
            <option value="">Select GL Code…</option>
            {glMappings.map((m) => (
              <option key={m.id} value={m.gl_code}>{m.gl_code} — {m.gl_name}</option>
            ))}
          </select>
        ) : (
          <input
            type={isNumeric ? "number" : "text"}
            value={form.value}
            onChange={(e) => setField("value", e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            className="rounded border border-gray-200 bg-white px-2 py-1 text-xs focus:border-blue-400 focus:outline-none min-w-[140px]"
          />
        )}
      </td>
      <td className="px-4 py-2">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1 rounded bg-blue-600 px-2 py-1 text-[10px] text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Save size={10} /> {saving ? "…" : "Save"}
            </button>
            <button
              onClick={onCancel}
              className="rounded border border-gray-200 px-2 py-1 text-[10px] text-gray-500 hover:bg-gray-50"
            >
              <X size={10} />
            </button>
          </div>
          {saveErr && <p className="text-[10px] text-red-600">{saveErr}</p>}
        </div>
      </td>
    </tr>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatReevalMsg(j: { reevaluated?: number; reassigned?: number; unassigned?: number; conflicts?: number }): string {
  const n = j.reevaluated ?? 0;
  if (n === 0) return "";
  return (
    `${n} rule-assigned transaction${n !== 1 ? "s" : ""} re-evaluated: ` +
    `${j.reassigned ?? 0} reassigned, ${j.unassigned ?? 0} unassigned, ` +
    `${j.conflicts ?? 0} conflict${(j.conflicts ?? 0) !== 1 ? "s" : ""}.`
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CostCenterDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [cc, setCC] = useState<CostCenter | null>(null);
  const [rules, setRules] = useState<CostCenterRule[]>([]);
  const [loading, setLoading] = useState(true);

  // Name editing
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameErr, setNameErr] = useState("");

  // Add rule
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/cost-centers/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      setCC(data);
      setRules(data.rules ?? []);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Lazy-load GL mappings when gl_code field is selected
  useEffect(() => {
    const needGL = (adding && form.field === "gl_code") ||
      (editingRuleId !== null && rules.find((r) => r.id === editingRuleId)?.field === "gl_code");
    if (needGL && glMappings.length === 0) {
      fetch("/api/gl-mapping")
        .then((r) => r.json())
        .then(setGlMappings)
        .catch(console.error);
    }
  }, [adding, form.field, editingRuleId, rules, glMappings.length]);

  function setFormField<K extends keyof RuleForm>(key: K, val: RuleForm[K]) {
    setForm((prev) => {
      const next = { ...prev, [key]: val };
      if (key === "field") {
        next.operator = defaultOperator(val as string);
        next.value = "";
      }
      return next;
    });
  }

  // ── Name edit ───────────────────────────────────────────────────────────────

  function startEditName() {
    setNameVal(cc?.name ?? "");
    setNameErr("");
    setEditingName(true);
  }

  async function saveName() {
    if (!nameVal.trim()) { setNameErr("Name is required"); return; }
    setSavingName(true);
    setNameErr("");
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
    } finally {
      setSavingName(false);
    }
  }

  // ── Add rule ────────────────────────────────────────────────────────────────

  async function handleAddRule() {
    if (!form.value.trim()) { setFormErr("Value is required"); return; }
    setSaving(true);
    setFormErr("");
    try {
      const res = await fetch(`/api/cost-centers/${id}/rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) { setFormErr(json.error ?? "Failed to save"); return; }
      setAdding(false);
      setForm(emptyForm());
      load();
    } finally {
      setSaving(false);
    }
  }

  // ── Edit rule ───────────────────────────────────────────────────────────────

  // Throws on failure so RuleEditRow can display the error inline
  async function handleEditRule(ruleId: string, data: RuleForm) {
    const res = await fetch(`/api/cost-centers/${id}/rules/${ruleId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error ?? "Failed to save rule");
    setEditingRuleId(null);
    setReevalMsg(formatReevalMsg(j));
    load();
  }

  // ── Move rule ───────────────────────────────────────────────────────────────

  async function handleMove(ruleId: string, direction: "up" | "down") {
    setMovingId(ruleId);
    setMoveErr("");
    try {
      const res = await fetch(`/api/cost-centers/${id}/rules/${ruleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setMoveErr(j.error ?? "Failed to move rule");
        return;
      }
      load();
    } catch (err) {
      setMoveErr(`Network error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setMovingId(null);
    }
  }

  // ── Delete rule ─────────────────────────────────────────────────────────────

  async function handleDelete(ruleId: string) {
    if (!confirm("Delete this condition? Rule-assigned transactions for this cost center will be re-evaluated.")) return;
    setDeletingId(ruleId);
    setDeleteRuleErr("");
    setReevalMsg("");
    try {
      const res = await fetch(`/api/cost-centers/${id}/rules/${ruleId}`, { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDeleteRuleErr(j.error ?? "Failed to delete condition");
        return;
      }
      setReevalMsg(formatReevalMsg(j));
      load(); // reload rules from server (sequence renumbering etc.)
    } catch (err) {
      setDeleteRuleErr(`Network error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDeletingId(null);
    }
  }

  const sorted = [...rules].sort((a, b) => a.sequence - b.sequence);
  const isFirstRule = sorted.length === 0;
  const isNumericField = getFieldKind(form.field) === "numeric";
  const isGLCode = form.field === "gl_code";
  const availableOps = isNumericField ? NUMERIC_OPERATORS : TEXT_OPERATORS;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600" />
      </div>
    );
  }
  if (!cc) return <p className="text-sm text-red-600">Cost center not found.</p>;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <Link
          href="/cost-centers"
          className="mb-3 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft size={13} /> Back to Cost Centers
        </Link>

        {/* Editable name */}
        {editingName ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              type="text"
              value={nameVal}
              onChange={(e) => setNameVal(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveName()}
              className="rounded-lg border border-blue-400 px-3 py-1.5 text-xl font-bold text-gray-900 focus:outline-none"
            />
            <button
              onClick={saveName}
              disabled={savingName}
              className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Save size={13} /> {savingName ? "…" : "Save"}
            </button>
            <button
              onClick={() => setEditingName(false)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50"
            >
              <X size={13} />
            </button>
            {nameErr && <span className="text-xs text-red-600">{nameErr}</span>}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-gray-900">{cc.name}</h2>
            <button
              onClick={startEditName}
              title="Edit name"
              className="rounded p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
            >
              <Pencil size={13} />
            </button>
          </div>
        )}

        {cc.description && <p className="text-sm text-gray-500">{cc.description}</p>}
      </div>

      {reevalMsg && (
        <p className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          {reevalMsg}
        </p>
      )}

      {(moveErr || deleteRuleErr) && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {moveErr || deleteRuleErr}
        </p>
      )}

      {/* Rules card */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-3">
          <span className="text-xs font-semibold text-gray-600">
            Conditions — evaluated left to right, in sequence order
          </span>
          <button
            onClick={() => { setAdding(true); setFormErr(""); }}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            <Plus size={12} /> Add Condition
          </button>
        </div>

        {sorted.length === 0 && !adding ? (
          <p className="py-8 text-center text-xs text-gray-400">
            No conditions yet — add one to start matching transactions.
          </p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 text-left text-gray-400">
                <th className="w-8 px-4 py-2 font-medium">#</th>
                <th className="w-20 px-4 py-2 font-medium">Connector</th>
                <th className="px-4 py-2 font-medium">Field</th>
                <th className="px-4 py-2 font-medium">Operator</th>
                <th className="px-4 py-2 font-medium">Value</th>
                <th className="w-32 px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((rule, i) =>
                editingRuleId === rule.id ? (
                  <RuleEditRow
                    key={rule.id}
                    rule={rule}
                    isFirst={i === 0}
                    glMappings={glMappings}
                    onSave={(data) => handleEditRule(rule.id, data)}
                    onCancel={() => setEditingRuleId(null)}
                  />
                ) : (
                  <tr key={rule.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-400">{i + 1}</td>
                    <td className="px-4 py-2.5">
                      <ConnectorBadge connector={rule.logic_connector} />
                    </td>
                    <td className="px-4 py-2.5 font-medium text-gray-800">
                      {fieldLabel(rule.field)}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">
                      {opLabel(rule.field, rule.operator)}
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-2.5 font-mono text-gray-700">
                      {rule.value}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setEditingRuleId(rule.id)}
                          title="Edit"
                          className="rounded p-0.5 text-gray-400 hover:text-blue-600"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          onClick={() => handleMove(rule.id, "up")}
                          disabled={i === 0 || movingId === rule.id}
                          title="Move up"
                          className="rounded p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-20"
                        >
                          <ChevronUp size={13} />
                        </button>
                        <button
                          onClick={() => handleMove(rule.id, "down")}
                          disabled={i === sorted.length - 1 || movingId === rule.id}
                          title="Move down"
                          className="rounded p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-20"
                        >
                          <ChevronDown size={13} />
                        </button>
                        <button
                          onClick={() => handleDelete(rule.id)}
                          disabled={deletingId === rule.id}
                          title="Delete"
                          className="rounded p-0.5 text-gray-400 hover:text-red-600 disabled:opacity-40"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        )}

        {/* Inline add-condition form */}
        {adding && (
          <div className="border-t border-blue-100 bg-blue-50/40 px-4 py-4 space-y-3">
            <p className="text-xs font-semibold text-gray-700">New condition</p>
            <div className="flex flex-wrap items-end gap-3">
              {/* Connector — hidden for first rule */}
              {!isFirstRule && (
                <div>
                  <label className="mb-1 block text-xs text-gray-500">Connector</label>
                  <select
                    value={form.logic_connector}
                    onChange={(e) => setFormField("logic_connector", e.target.value as "AND" | "OR")}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs focus:border-blue-400 focus:outline-none"
                  >
                    <option value="AND">AND</option>
                    <option value="OR">OR</option>
                  </select>
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs text-gray-500">Field</label>
                <select
                  value={form.field}
                  onChange={(e) => setFormField("field", e.target.value)}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs focus:border-blue-400 focus:outline-none"
                >
                  {CC_FIELDS.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs text-gray-500">Operator</label>
                <select
                  value={form.operator}
                  onChange={(e) => setFormField("operator", e.target.value)}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs focus:border-blue-400 focus:outline-none"
                >
                  {availableOps.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div className="min-w-[180px]">
                <label className="mb-1 block text-xs text-gray-500">Value</label>
                {isGLCode ? (
                  <select
                    value={form.value}
                    onChange={(e) => setFormField("value", e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs focus:border-blue-400 focus:outline-none"
                  >
                    <option value="">Select GL Code…</option>
                    {glMappings.map((m) => (
                      <option key={m.id} value={m.gl_code}>
                        {m.gl_code} — {m.gl_name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={isNumericField ? "number" : "text"}
                    value={form.value}
                    onChange={(e) => setFormField("value", e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddRule()}
                    placeholder="Value…"
                    autoFocus
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs focus:border-blue-400 focus:outline-none"
                  />
                )}
              </div>

              <div className="flex gap-2 pb-0.5">
                <button
                  onClick={handleAddRule}
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  <Save size={12} /> {saving ? "Saving…" : "Add"}
                </button>
                <button
                  onClick={() => { setAdding(false); setForm(emptyForm()); setFormErr(""); }}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600 hover:bg-gray-50"
                >
                  <X size={12} />
                </button>
              </div>
            </div>
            {formErr && <p className="text-xs text-red-600">{formErr}</p>}
          </div>
        )}
      </div>

      {/* Evaluation preview */}
      {sorted.length >= 2 && (
        <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
          <p className="text-xs text-gray-500 leading-relaxed">
            <span className="font-semibold text-gray-700">Evaluation: </span>
            {sorted.map((r, i) => (
              <span key={r.id}>
                {i > 0 && (
                  <span className={`mx-1.5 font-bold ${r.logic_connector === "AND" ? "text-blue-600" : "text-purple-600"}`}>
                    {r.logic_connector}
                  </span>
                )}
                <span className="inline-block rounded bg-white border border-gray-200 px-1.5 py-0.5 font-mono">
                  {fieldLabel(r.field)} {opLabel(r.field, r.operator)} &ldquo;{r.value}&rdquo;
                </span>
              </span>
            ))}
          </p>
          <p className="mt-1 text-xs text-gray-400">Evaluated strictly left to right — no operator precedence.</p>
        </div>
      )}
    </div>
  );
}
