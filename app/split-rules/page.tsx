"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, ChevronDown, ChevronRight, RefreshCw, X } from "lucide-react";
import { CC_FIELDS, operatorsForField, defaultOperator } from "@/lib/cost-center-constants";
import type { SplitRuleWithDetails, SplitRuleCondition, SplitRuleAllocation } from "@/types";

// ─── Local draft types ─────────────────────────────────────────────────────────

type DraftCondition = {
  key: string; // client-only stable id
  sequence: number;
  logic_connector: "AND" | "OR" | null;
  field: string;
  operator: string;
  value: string;
  group_number: number;
};

type DraftAllocation = {
  key: string;
  cost_center_id: string;
  percentage: string; // kept as string for input
};

type CCOption = { id: string; name: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2);
}

function blankCondition(seq: number): DraftCondition {
  return {
    key: uid(),
    sequence: seq,
    logic_connector: seq === 1 ? null : "AND",
    field: CC_FIELDS[0].value,
    operator: defaultOperator(CC_FIELDS[0].value),
    value: "",
    group_number: 0,
  };
}

function blankAllocation(): DraftAllocation {
  return { key: uid(), cost_center_id: "", percentage: "" };
}

function sumPct(allocations: DraftAllocation[]): number {
  return allocations.reduce((s, a) => s + (Number(a.percentage) || 0), 0);
}

function conditionSummary(conditions: SplitRuleCondition[]): string {
  if (conditions.length === 0) return "No conditions";
  const sorted = [...conditions].sort((a, b) => a.sequence - b.sequence);
  return sorted
    .map((c, i) => {
      const connector = i === 0 ? "" : ` ${c.logic_connector ?? "AND"} `;
      return `${connector}${c.field} ${c.operator} "${c.value}"`;
    })
    .join("");
}

function allocationSummary(allocations: SplitRuleAllocation[], ccNames: Map<string, string>): string {
  if (allocations.length === 0) return "No allocations";
  return allocations
    .slice()
    .sort((a, b) => a.display_order - b.display_order)
    .map((a) => `${ccNames.get(a.cost_center_id) ?? a.cost_center_id} ${a.percentage}%`)
    .join(" · ");
}

// ─── Conditions editor ────────────────────────────────────────────────────────

function ConditionsEditor({
  conditions,
  onChange,
}: {
  conditions: DraftCondition[];
  onChange: (next: DraftCondition[]) => void;
}) {
  function addCondition() {
    onChange([...conditions, blankCondition(conditions.length + 1)]);
  }

  function updateCondition(key: string, patch: Partial<DraftCondition>) {
    onChange(conditions.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  }

  function removeCondition(key: string) {
    const filtered = conditions.filter((c) => c.key !== key);
    onChange(filtered.map((c, i) => ({ ...c, sequence: i + 1 })));
  }

  return (
    <div className="space-y-2">
      {conditions.map((cond, idx) => {
        const ops = operatorsForField(cond.field);
        return (
          <div key={cond.key} className="flex items-center gap-2 flex-wrap">
            {idx === 0 ? (
              <span className="text-xs text-gray-400 w-10 shrink-0">WHERE</span>
            ) : (
              <select
                value={cond.logic_connector ?? "AND"}
                onChange={(e) =>
                  updateCondition(cond.key, {
                    logic_connector: e.target.value as "AND" | "OR",
                  })
                }
                className="text-xs border border-gray-600 bg-gray-700 text-white rounded px-1 py-0.5 w-14 shrink-0"
              >
                <option value="AND">AND</option>
                <option value="OR">OR</option>
              </select>
            )}
            <select
              value={cond.field}
              onChange={(e) => {
                const field = e.target.value;
                updateCondition(cond.key, {
                  field,
                  operator: defaultOperator(field),
                  value: "",
                });
              }}
              className="text-xs border border-gray-600 bg-gray-700 text-white rounded px-1 py-0.5 min-w-[110px]"
            >
              {CC_FIELDS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            <select
              value={cond.operator}
              onChange={(e) => updateCondition(cond.key, { operator: e.target.value })}
              className="text-xs border border-gray-600 bg-gray-700 text-white rounded px-1 py-0.5 min-w-[120px]"
            >
              {ops.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={cond.value}
              onChange={(e) => updateCondition(cond.key, { value: e.target.value })}
              placeholder="value"
              className="text-xs border border-gray-600 bg-gray-700 text-white rounded px-2 py-0.5 min-w-[100px] flex-1"
            />
            <button
              onClick={() => removeCondition(cond.key)}
              className="text-gray-400 hover:text-red-400 shrink-0"
              title="Remove condition"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
      <button
        onClick={addCondition}
        className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 mt-1"
      >
        <Plus size={12} /> Add condition
      </button>
    </div>
  );
}

// ─── Allocations editor ───────────────────────────────────────────────────────

function AllocationsEditor({
  allocations,
  costCenters,
  onChange,
}: {
  allocations: DraftAllocation[];
  costCenters: CCOption[];
  onChange: (next: DraftAllocation[]) => void;
}) {
  const total = sumPct(allocations);
  const remaining = +(100 - total).toFixed(2);

  function addRow() {
    onChange([...allocations, blankAllocation()]);
  }

  function updateRow(key: string, patch: Partial<DraftAllocation>) {
    onChange(allocations.map((a) => (a.key === key ? { ...a, ...patch } : a)));
  }

  function removeRow(key: string) {
    onChange(allocations.filter((a) => a.key !== key));
  }

  return (
    <div className="space-y-2">
      {allocations.map((alloc) => (
        <div key={alloc.key} className="flex items-center gap-2">
          <select
            value={alloc.cost_center_id}
            onChange={(e) => updateRow(alloc.key, { cost_center_id: e.target.value })}
            className="text-xs border border-gray-600 bg-gray-700 text-white rounded px-1 py-0.5 flex-1"
          >
            <option value="">— select cost center —</option>
            {costCenters.map((cc) => (
              <option key={cc.id} value={cc.id}>
                {cc.name}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1 shrink-0">
            <input
              type="number"
              min="0.01"
              max="100"
              step="0.01"
              value={alloc.percentage}
              onChange={(e) => updateRow(alloc.key, { percentage: e.target.value })}
              placeholder="0"
              className="text-xs border border-gray-600 bg-gray-700 text-white rounded px-2 py-0.5 w-20 text-right"
            />
            <span className="text-xs text-gray-400">%</span>
          </div>
          <button
            onClick={() => removeRow(alloc.key)}
            className="text-gray-400 hover:text-red-400 shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      ))}
      <div className="flex items-center justify-between">
        <button
          onClick={addRow}
          className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
        >
          <Plus size={12} /> Add allocation
        </button>
        <span
          className={`text-xs ${
            Math.abs(total - 100) < 0.01
              ? "text-green-400"
              : total > 100
              ? "text-red-400"
              : "text-yellow-400"
          }`}
        >
          {total.toFixed(2)}% / 100%
          {Math.abs(total - 100) > 0.01 && remaining > 0 && ` (${remaining}% remaining)`}
        </span>
      </div>
    </div>
  );
}

// ─── Rule form (create or edit) ───────────────────────────────────────────────

function RuleForm({
  initial,
  costCenters,
  onSave,
  onCancel,
}: {
  initial?: SplitRuleWithDetails;
  costCenters: CCOption[];
  onSave: (rule: SplitRuleWithDetails) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [conditions, setConditions] = useState<DraftCondition[]>(() => {
    if (!initial || initial.conditions.length === 0) return [blankCondition(1)];
    return initial.conditions
      .slice()
      .sort((a, b) => a.sequence - b.sequence)
      .map((c) => ({ ...c, key: uid() }));
  });
  const [allocations, setAllocations] = useState<DraftAllocation[]>(() => {
    if (!initial || initial.allocations.length === 0)
      return [blankAllocation(), blankAllocation()];
    return initial.allocations
      .slice()
      .sort((a, b) => a.display_order - b.display_order)
      .map((a) => ({ key: uid(), cost_center_id: a.cost_center_id, percentage: String(a.percentage) }));
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function handleSave() {
    setErr("");
    if (!name.trim()) { setErr("Name is required"); return; }
    if (allocations.length < 2) { setErr("At least 2 allocations required"); return; }
    if (allocations.some((a) => !a.cost_center_id)) { setErr("All allocations need a cost center"); return; }
    const total = sumPct(allocations);
    if (Math.abs(total - 100) > 0.01) { setErr(`Allocations must sum to 100% (currently ${total.toFixed(2)}%)`); return; }
    if (conditions.some((c) => !c.value.trim())) { setErr("All conditions need a value"); return; }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        conditions: conditions.map((c, i) => ({
          sequence: i + 1,
          logic_connector: i === 0 ? null : c.logic_connector,
          field: c.field,
          operator: c.operator,
          value: c.value,
          group_number: 0,
        })),
        allocations: allocations.map((a, i) => ({
          cost_center_id: a.cost_center_id,
          percentage: Number(a.percentage),
          display_order: i,
        })),
      };

      if (initial) {
        // Edit: PATCH name/description + PUT conditions + PUT allocations in parallel
        const [patchRes, condRes, allocRes] = await Promise.all([
          fetch(`/api/split-rules/${initial.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: payload.name, description: payload.description }),
          }),
          fetch(`/api/split-rules/${initial.id}/conditions`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload.conditions),
          }),
          fetch(`/api/split-rules/${initial.id}/allocations`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload.allocations),
          }),
        ]);
        if (!patchRes.ok || !condRes.ok || !allocRes.ok) {
          const j = await (!patchRes.ok ? patchRes : !condRes.ok ? condRes : allocRes)
            .json()
            .catch(() => ({}));
          setErr(j.error ?? "Save failed");
          return;
        }
        const getRes = await fetch(`/api/split-rules/${initial.id}`);
        const updated = await getRes.json();
        onSave(updated);
      } else {
        const res = await fetch("/api/split-rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok) { setErr(json.error ?? "Save failed"); return; }
        onSave(json as SplitRuleWithDetails);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Margin Ops Split"
            className="w-full text-sm border border-gray-600 bg-gray-700 text-white rounded px-2 py-1"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional"
            className="w-full text-sm border border-gray-600 bg-gray-700 text-white rounded px-2 py-1"
          />
        </div>
      </div>

      <div>
        <div className="text-xs font-medium text-gray-300 mb-2">Conditions</div>
        <ConditionsEditor conditions={conditions} onChange={setConditions} />
      </div>

      <div>
        <div className="text-xs font-medium text-gray-300 mb-2">
          CC Allocations <span className="text-gray-500 font-normal">(must sum to 100%)</span>
        </div>
        <AllocationsEditor
          allocations={allocations}
          costCenters={costCenters}
          onChange={setAllocations}
        />
      </div>

      {err && <p className="text-xs text-red-400">{err}</p>}

      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-1.5 rounded"
        >
          {saving ? "Saving…" : initial ? "Save changes" : "Create rule"}
        </button>
        <button
          onClick={onCancel}
          className="text-xs text-gray-400 hover:text-white px-3 py-1.5"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Rule row (collapsed view) ────────────────────────────────────────────────

function RuleRow({
  rule,
  ccNames,
  costCenters,
  onUpdate,
  onDelete,
}: {
  rule: SplitRuleWithDetails;
  ccNames: Map<string, string>;
  costCenters: CCOption[];
  onUpdate: (updated: SplitRuleWithDetails) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm(`Delete split rule "${rule.name}"? Transactions matched by this rule will be re-evaluated.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/split-rules/${rule.id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? "Delete failed");
        return;
      }
      onDelete(rule.id);
    } finally {
      setDeleting(false);
    }
  }

  if (editing) {
    return (
      <RuleForm
        initial={rule}
        costCenters={costCenters}
        onSave={(updated) => {
          onUpdate(updated);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-750 group"
        onClick={() => setExpanded((e) => !e)}
      >
        <span className="text-gray-400 shrink-0">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white">{rule.name}</span>
            <span className="text-xs text-gray-500">
              {rule.conditions.length} condition{rule.conditions.length !== 1 ? "s" : ""}
            </span>
          </div>
          {rule.description && (
            <p className="text-xs text-gray-400 truncate">{rule.description}</p>
          )}
          <p className="text-xs text-blue-300 truncate mt-0.5">
            {allocationSummary(rule.allocations, ccNames)}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); setEditing(true); }}
            className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-gray-700"
          >
            Edit
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleDelete(); }}
            disabled={deleting}
            className="text-gray-400 hover:text-red-400 disabled:opacity-40 p-1 rounded hover:bg-gray-700"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-700 px-4 py-3 space-y-3">
          <div>
            <div className="text-xs text-gray-400 mb-1.5">Conditions</div>
            {rule.conditions.length === 0 ? (
              <p className="text-xs text-gray-500 italic">No conditions — will match all transactions</p>
            ) : (
              <div className="space-y-1">
                {rule.conditions
                  .slice()
                  .sort((a, b) => a.sequence - b.sequence)
                  .map((c, i) => (
                    <div key={c.id} className="text-xs text-gray-300 flex items-center gap-1.5">
                      {i === 0 ? (
                        <span className="text-gray-500 w-8">IF</span>
                      ) : (
                        <span className="text-yellow-400 w-8">{c.logic_connector}</span>
                      )}
                      <span className="text-blue-300">{c.field}</span>
                      <span className="text-gray-400">{c.operator}</span>
                      <span className="text-white">"{c.value}"</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
          <div>
            <div className="text-xs text-gray-400 mb-1.5">Allocations</div>
            <div className="space-y-1">
              {rule.allocations
                .slice()
                .sort((a, b) => a.display_order - b.display_order)
                .map((a) => (
                  <div key={a.id} className="text-xs text-gray-300 flex items-center gap-2">
                    <span className="text-white font-medium w-12 text-right shrink-0">
                      {a.percentage}%
                    </span>
                    <span className="text-blue-300">{ccNames.get(a.cost_center_id) ?? a.cost_center_id}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SplitRulesPage() {
  const [rules, setRules] = useState<SplitRuleWithDetails[]>([]);
  const [costCenters, setCostCenters] = useState<CCOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [reapplying, setReapplying] = useState(false);
  const [reapplyMsg, setReapplyMsg] = useState("");

  const ccNames = new Map(costCenters.map((cc) => [cc.id, cc.name]));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rulesRes, ccsRes] = await Promise.all([
        fetch("/api/split-rules"),
        fetch("/api/cost-centers"),
      ]);
      const [rulesData, ccsData] = await Promise.all([rulesRes.json(), ccsRes.json()]);
      setRules(Array.isArray(rulesData) ? rulesData : []);
      setCostCenters(Array.isArray(ccsData) ? ccsData : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleReapply() {
    if (!confirm("Re-apply all cost center + split rules to all non-manual transactions? This may take a few seconds.")) return;
    setReapplying(true);
    setReapplyMsg("");
    try {
      const res = await fetch("/api/cost-centers/reapply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branches: [] }),
      });
      const json = await res.json();
      if (!res.ok) {
        setReapplyMsg(`Error: ${json.error ?? "Unknown error"}`);
      } else {
        const p = Number(json.processed ?? 0).toLocaleString();
        const a = Number(json.assigned ?? 0).toLocaleString();
        const u = Number(json.unassigned ?? 0).toLocaleString();
        const c = Number(json.conflicts ?? 0).toLocaleString();
        setReapplyMsg(`Done — ${p} processed: ${a} assigned, ${u} unassigned, ${c} conflicts.`);
      }
    } catch (err) {
      setReapplyMsg(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setReapplying(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Split Rules</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Rules that split transaction cost across multiple cost centers by percentage.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReapply}
            disabled={reapplying}
            className="flex items-center gap-1.5 text-sm bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white px-3 py-1.5 rounded border border-gray-600"
          >
            <RefreshCw size={14} className={reapplying ? "animate-spin" : ""} />
            {reapplying ? "Applying…" : "Re-apply All Rules"}
          </button>
          {!creating && (
            <button
              onClick={() => setCreating(true)}
              className="flex items-center gap-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded"
            >
              <Plus size={14} /> Add Split Rule
            </button>
          )}
        </div>
      </div>

      {reapplyMsg && (
        <div
          className={`text-sm px-3 py-2 rounded ${
            reapplyMsg.startsWith("Error")
              ? "bg-red-900/40 text-red-300 border border-red-800"
              : "bg-green-900/40 text-green-300 border border-green-800"
          }`}
        >
          {reapplyMsg}
        </div>
      )}

      {creating && (
        <RuleForm
          costCenters={costCenters}
          onSave={(newRule) => {
            setRules((prev) => [newRule, ...prev]);
            setCreating(false);
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      {loading ? (
        <div className="text-sm text-gray-400">Loading…</div>
      ) : rules.length === 0 && !creating ? (
        <div className="bg-gray-800 border border-gray-700 rounded-lg px-6 py-10 text-center">
          <p className="text-gray-400 text-sm">No split rules yet.</p>
          <p className="text-gray-500 text-xs mt-1">
            Create a rule to automatically split a transaction across multiple cost centers.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              ccNames={ccNames}
              costCenters={costCenters}
              onUpdate={(updated) =>
                setRules((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
              }
              onDelete={(id) => setRules((prev) => prev.filter((r) => r.id !== id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
