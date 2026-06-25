"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Plus, Trash2, ChevronUp, ChevronDown, Save, X,
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CostCenterDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [cc, setCC] = useState<CostCenter | null>(null);
  const [rules, setRules] = useState<CostCenterRule[]>([]);
  const [loading, setLoading] = useState(true);

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<RuleForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState("");

  const [glMappings, setGlMappings] = useState<GLMapping[]>([]);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  // Lazy-load GL mappings only when the gl_code field is selected in the form
  useEffect(() => {
    if (adding && form.field === "gl_code" && glMappings.length === 0) {
      fetch("/api/gl-mapping")
        .then((r) => r.json())
        .then(setGlMappings)
        .catch(console.error);
    }
  }, [adding, form.field, glMappings.length]);

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

  async function handleMove(ruleId: string, direction: "up" | "down") {
    setMovingId(ruleId);
    try {
      await fetch(`/api/cost-centers/${id}/rules/${ruleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction }),
      });
      load();
    } finally {
      setMovingId(null);
    }
  }

  async function handleDelete(ruleId: string) {
    if (!confirm("Delete this condition?")) return;
    setDeletingId(ruleId);
    try {
      await fetch(`/api/cost-centers/${id}/rules/${ruleId}`, { method: "DELETE" });
      setRules((prev) => prev.filter((r) => r.id !== ruleId));
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
        <h2 className="text-xl font-bold text-gray-900">{cc.name}</h2>
        {cc.description && <p className="text-sm text-gray-500">{cc.description}</p>}
      </div>

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
                <th className="w-24 px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((rule, i) => (
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
              ))}
            </tbody>
          </table>
        )}

        {/* Inline add-condition form */}
        {adding && (
          <div className="border-t border-blue-100 bg-blue-50/40 px-4 py-4 space-y-3">
            <p className="text-xs font-semibold text-gray-700">New condition</p>
            <div className="flex flex-wrap items-end gap-3">
              {/* Connector — hidden for the very first rule */}
              {!isFirstRule && (
                <div>
                  <label className="mb-1 block text-xs text-gray-500">Connector</label>
                  <select
                    value={form.logic_connector}
                    onChange={(e) =>
                      setFormField("logic_connector", e.target.value as "AND" | "OR")
                    }
                    className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs focus:border-blue-400 focus:outline-none"
                  >
                    <option value="AND">AND</option>
                    <option value="OR">OR</option>
                  </select>
                </div>
              )}

              {/* Field */}
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

              {/* Operator */}
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

              {/* Value */}
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

              {/* Buttons */}
              <div className="flex gap-2 pb-0.5">
                <button
                  onClick={handleAddRule}
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  <Save size={12} /> {saving ? "Saving…" : "Add"}
                </button>
                <button
                  onClick={() => {
                    setAdding(false);
                    setForm(emptyForm());
                    setFormErr("");
                  }}
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

      {/* Evaluation preview — shown once there are 2+ conditions */}
      {sorted.length >= 2 && (
        <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
          <p className="text-xs text-gray-500 leading-relaxed">
            <span className="font-semibold text-gray-700">Evaluation: </span>
            {sorted.map((r, i) => (
              <span key={r.id}>
                {i > 0 && (
                  <span
                    className={`mx-1.5 font-bold ${
                      r.logic_connector === "AND" ? "text-blue-600" : "text-purple-600"
                    }`}
                  >
                    {r.logic_connector}
                  </span>
                )}
                <span className="inline-block rounded bg-white border border-gray-200 px-1.5 py-0.5 font-mono">
                  {fieldLabel(r.field)} {opLabel(r.field, r.operator)} &ldquo;{r.value}&rdquo;
                </span>
              </span>
            ))}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Evaluated strictly left to right — no operator precedence.
          </p>
        </div>
      )}
    </div>
  );
}
