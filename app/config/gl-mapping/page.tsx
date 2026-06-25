"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Search, Pencil, Trash2, Save, X, Upload, CheckCircle2 } from "lucide-react";
import { DataTable } from "@/components/data-table";
import type { GLMapping } from "@/types";

// ─── Form data ────────────────────────────────────────────────────────────────

type FormData = {
  gl_code: string; gl_name: string;
  category_1: string; category_2: string; category_3: string;
  category_4: string; category_5: string; category_6: string; category_7: string;
  order_1: string; order_2: string; order_3: string;
};

const emptyForm = (): FormData => ({
  gl_code: "", gl_name: "",
  category_1: "", category_2: "", category_3: "",
  category_4: "", category_5: "", category_6: "", category_7: "",
  order_1: "", order_2: "", order_3: "",
});

function formFromRecord(r: GLMapping): FormData {
  return {
    gl_code: r.gl_code, gl_name: r.gl_name,
    category_1: r.category_1 ?? "", category_2: r.category_2 ?? "",
    category_3: r.category_3 ?? "", category_4: r.category_4 ?? "",
    category_5: r.category_5 ?? "", category_6: r.category_6 ?? "",
    category_7: r.category_7 ?? "",
    order_1: r.order_1 != null ? String(r.order_1) : "",
    order_2: r.order_2 != null ? String(r.order_2) : "",
    order_3: r.order_3 != null ? String(r.order_3) : "",
  };
}

function toPayload(f: FormData) {
  return {
    gl_code: f.gl_code.trim(), gl_name: f.gl_name.trim(),
    category_1: f.category_1.trim() || null,
    category_2: f.category_2.trim() || null,
    category_3: f.category_3.trim() || null,
    category_4: f.category_4.trim() || null,
    category_5: f.category_5.trim() || null,
    category_6: f.category_6.trim() || null,
    category_7: f.category_7.trim() || null,
    order_1: f.order_1 ? parseInt(f.order_1, 10) : null,
    order_2: f.order_2 ? parseInt(f.order_2, 10) : null,
    order_3: f.order_3 ? parseInt(f.order_3, 10) : null,
  };
}

// ─── Form modal ───────────────────────────────────────────────────────────────

function GLForm({
  initial,
  onSave,
  onClose,
}: {
  initial?: GLMapping;
  onSave: (record: GLMapping) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<FormData>(
    initial ? formFromRecord(initial) : emptyForm()
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  function set(key: keyof FormData, val: string) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function handleSave() {
    if (!form.gl_code.trim() || !form.gl_name.trim()) {
      setErr("GL Code and GL Name are required");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      const url = initial ? `/api/gl-mapping/${initial.id}` : "/api/gl-mapping";
      const res = await fetch(url, {
        method: initial ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPayload(form)),
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

  const textInput = (key: keyof FormData, label: string, placeholder = "") => (
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
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h3 className="font-semibold text-gray-900">
            {initial ? "Edit GL Mapping" : "Add GL Mapping"}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-6 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {textInput("gl_code", "GL Code *", "e.g. 60100")}
            {textInput("gl_name", "GL Name *", "e.g. Salaries")}
          </div>
          <div className="grid grid-cols-3 gap-3 pt-1">
            {(["category_1","category_2","category_3","category_4","category_5","category_6","category_7"] as const)
              .map((f, i) => textInput(f, `Category ${i + 1}`))}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {(["order_1","order_2","order_3"] as const)
              .map((f, i) => textInput(f, `Order ${i + 1}`))}
          </div>
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
  { label: "GL Code" },
  { label: "GL Name" },
  { label: "Cat. 1" },
  { label: "Cat. 2" },
  { label: "Cat. 3" },
  { label: "Cat. 4" },
  { label: "Cat. 5" },
  { label: "Cat. 6" },
  { label: "Cat. 7" },
  { label: "Ord. 1" },
  { label: "Ord. 2" },
  { label: "Ord. 3" },
  { label: "" },
];

export default function GLMappingPage() {
  const [records, setRecords] = useState<GLMapping[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<GLMapping | null>(null);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [importDebug, setImportDebug] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/gl-mapping${query ? `?q=${encodeURIComponent(query)}` : ""}`);
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

  function handleSaved(record: GLMapping) {
    setRecords((prev) => {
      const idx = prev.findIndex((r) => r.id === record.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = record; return next; }
      return [record, ...prev];
    });
    setEditing(null);
    setAdding(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this GL Mapping?")) return;
    setDeletingId(id);
    try {
      await fetch(`/api/gl-mapping/${id}`, { method: "DELETE" });
      setRecords((prev) => prev.filter((r) => r.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  async function handleImport() {
    if (!importFile) return;
    setImporting(true);
    setImportMsg("");
    setImportDebug(null);
    const fd = new FormData();
    fd.append("file", importFile);
    try {
      const res = await fetch("/api/upload-mapping", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setImportMsg(`Error: ${json.error}`);
      } else {
        setImportMsg(`Imported: ${json.glMappingsImported} GL Codes, ${json.branchesImported} Branches`);
        if (json.debug) setImportDebug(json.debug as Record<string, unknown>);
        setImportFile(null);
        load();
      }
    } catch (e) {
      setImportMsg(String(e));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">GL Mapping</h2>
          <p className="text-sm text-gray-500">{records.length} records</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
            <Upload size={14} /> Import Excel
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {importFile && (
            <button
              onClick={handleImport}
              disabled={importing}
              className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700 hover:bg-blue-100 disabled:opacity-50"
            >
              {importing
                ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-blue-400 border-t-blue-700" />
                : <CheckCircle2 size={14} />}
              {importing ? "Importing…" : importFile.name}
            </button>
          )}
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus size={14} /> Add new
          </button>
        </div>
      </div>

      {importMsg && (
        <p className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-2 text-sm text-blue-700">
          {importMsg}
        </p>
      )}

      {importDebug && (() => {
        const catIdx = importDebug.categoryIndices as Record<string, number> | undefined;
        const ordIdx = importDebug.orderIndices as Record<string, number> | undefined;
        const colLetter = (n: number) => String.fromCharCode(65 + n); // 0→A, 1→B …
        return (
          <details className="rounded-lg border border-gray-200 bg-white text-xs">
            <summary className="cursor-pointer px-4 py-2 font-medium text-gray-700 select-none">
              Column detection snapshot (click to expand)
            </summary>
            <div className="border-t border-gray-100 px-4 py-3 space-y-3">
              <div>
                <p className="mb-1 font-semibold text-gray-600">Categories detected</p>
                <div className="flex flex-wrap gap-2">
                  {[1,2,3,4,5,6,7].map((n) => {
                    const idx = catIdx?.[n] ?? catIdx?.[String(n)];
                    const found = idx !== undefined && (idx as number) >= 0;
                    return (
                      <span
                        key={n}
                        className={`rounded px-2 py-0.5 font-mono ${found ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700"}`}
                      >
                        Cat {n}: {found ? `col ${idx} (${colLetter(idx as number)})` : "NOT FOUND"}
                      </span>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="mb-1 font-semibold text-gray-600">Orders detected</p>
                <div className="flex flex-wrap gap-2">
                  {[1,2,3].map((n) => {
                    const idx = ordIdx?.[n] ?? ordIdx?.[String(n)];
                    const found = idx !== undefined && (idx as number) >= 0;
                    return (
                      <span
                        key={n}
                        className={`rounded px-2 py-0.5 font-mono ${found ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700"}`}
                      >
                        Order {n}: {found ? `col ${idx} (${colLetter(idx as number)})` : "NOT FOUND"}
                      </span>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="mb-1 font-semibold text-gray-600">
                  GL header row: {String(importDebug.glHeaderRow)} &nbsp;|&nbsp;
                  Branch header row: {String(importDebug.branchHeaderRow)}
                </p>
              </div>
            </div>
          </details>
        );
      })()}

      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search by GL Code, GL Name, category…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-4 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      </div>

      <DataTable columns={TABLE_COLS} loading={loading} emptyMessage="No results">
        {records.length > 0 &&
          records.map((r) => (
            <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="px-4 py-2.5 font-mono font-medium text-gray-900">{r.gl_code}</td>
              <td className="max-w-[200px] truncate px-4 py-2.5 text-gray-700">{r.gl_name}</td>
              <td className="max-w-[120px] truncate px-4 py-2.5 text-gray-600">{r.category_1 ?? "—"}</td>
              <td className="max-w-[120px] truncate px-4 py-2.5 text-gray-600">{r.category_2 ?? "—"}</td>
              <td className="max-w-[120px] truncate px-4 py-2.5 text-gray-600">{r.category_3 ?? "—"}</td>
              <td className="max-w-[120px] truncate px-4 py-2.5 text-gray-600">{r.category_4 ?? "—"}</td>
              <td className="max-w-[120px] truncate px-4 py-2.5 text-gray-600">{r.category_5 ?? "—"}</td>
              <td className="max-w-[120px] truncate px-4 py-2.5 text-gray-600">{r.category_6 ?? "—"}</td>
              <td className="max-w-[120px] truncate px-4 py-2.5 text-gray-600">{r.category_7 ?? "—"}</td>
              <td className="px-4 py-2.5 text-center text-gray-500 tabular-nums">{r.order_1 ?? "—"}</td>
              <td className="px-4 py-2.5 text-center text-gray-500 tabular-nums">{r.order_2 ?? "—"}</td>
              <td className="px-4 py-2.5 text-center text-gray-500 tabular-nums">{r.order_3 ?? "—"}</td>
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <button onClick={() => setEditing(r)} className="text-gray-400 hover:text-blue-600">
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => handleDelete(r.id)}
                    disabled={deletingId === r.id}
                    className="text-gray-400 hover:text-red-600 disabled:opacity-40"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
      </DataTable>

      {(editing || adding) && (
        <GLForm
          initial={editing ?? undefined}
          onSave={handleSaved}
          onClose={() => { setEditing(null); setAdding(false); }}
        />
      )}
    </div>
  );
}
