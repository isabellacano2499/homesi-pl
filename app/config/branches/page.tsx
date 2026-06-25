"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Search, Pencil, Trash2, Save, X } from "lucide-react";
import { DataTable } from "@/components/data-table";
import type { Branch } from "@/types";

type FormData = { branch: string; region: string; branch_manager: string };
const emptyForm = (): FormData => ({ branch: "", region: "", branch_manager: "" });

function formFromRecord(r: Branch): FormData {
  return { branch: r.branch, region: r.region ?? "", branch_manager: r.branch_manager ?? "" };
}

// ─── Form modal ───────────────────────────────────────────────────────────────

function BranchForm({
  initial,
  onSave,
  onClose,
}: {
  initial?: Branch;
  onSave: (record: Branch) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<FormData>(initial ? formFromRecord(initial) : emptyForm());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  function set(key: keyof FormData, val: string) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function handleSave() {
    if (!form.branch.trim()) { setErr("Branch is required"); return; }
    setSaving(true);
    setErr("");
    try {
      const url = initial ? `/api/branches/${initial.id}` : "/api/branches";
      const res = await fetch(url, {
        method: initial ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch: form.branch.trim(),
          region: form.region.trim() || null,
          branch_manager: form.branch_manager.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setErr(json.error ?? "Failed to save"); return; }
      onSave(json);
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  }

  const FIELDS: [keyof FormData, string, string][] = [
    ["branch", "Branch *", "e.g. 021"],
    ["region", "Region", "e.g. Southwest"],
    ["branch_manager", "Branch Manager", "e.g. John Smith"],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h3 className="font-semibold text-gray-900">
            {initial ? "Edit Branch" : "Add Branch"}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-3 px-6 py-4">
          {FIELDS.map(([key, label, placeholder]) => (
            <div key={key}>
              <label className="block text-xs text-gray-500 mb-1">{label}</label>
              <input
                type="text"
                value={form[key]}
                onChange={(e) => set(key, e.target.value)}
                placeholder={placeholder}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
          ))}
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-4">
          <button onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving
              ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              : <Save size={14} />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const TABLE_COLS = [
  { label: "Branch" },
  { label: "Region" },
  { label: "Branch Manager" },
  { label: "" },
];

export default function BranchesPage() {
  const [records, setRecords] = useState<Branch[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/branches${query ? `?q=${encodeURIComponent(query)}` : ""}`);
      setRecords(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  function handleSaved(record: Branch) {
    setRecords((prev) => {
      const idx = prev.findIndex((r) => r.id === record.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = record; return next; }
      return [record, ...prev];
    });
    setEditing(null);
    setAdding(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this Branch?")) return;
    setDeletingId(id);
    try {
      await fetch(`/api/branches/${id}`, { method: "DELETE" });
      setRecords((prev) => prev.filter((r) => r.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Branches</h2>
          <p className="text-sm text-gray-500">{records.length} records</p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus size={14} /> Add new
        </button>
      </div>

      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search by branch, region, manager…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-4 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      </div>

      <DataTable columns={TABLE_COLS} loading={loading} emptyMessage="No results">
        {records.length > 0 &&
          records.map((r) => (
            <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50 text-sm">
              <td className="px-4 py-3 font-mono font-medium text-gray-900">{r.branch}</td>
              <td className="px-4 py-3 text-gray-700">{r.region ?? "—"}</td>
              <td className="px-4 py-3 text-gray-700">{r.branch_manager ?? "—"}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <button onClick={() => setEditing(r)} className="text-gray-400 hover:text-blue-600">
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(r.id)}
                    disabled={deletingId === r.id}
                    className="text-gray-400 hover:text-red-600 disabled:opacity-40"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
      </DataTable>

      {(editing || adding) && (
        <BranchForm
          initial={editing ?? undefined}
          onSave={handleSaved}
          onClose={() => { setEditing(null); setAdding(false); }}
        />
      )}
    </div>
  );
}
