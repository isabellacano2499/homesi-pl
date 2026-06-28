"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, X, Trash2, RefreshCw } from "lucide-react";
import type { UploadPLResponse, AddbacksUploadResponse, OffshoreAllocationsUploadResponse, UploadLoanCountResponse } from "@/types";
import type { DuplicateInfo } from "@/lib/check-duplicate-upload";

type UploadStatus = "idle" | "uploading" | "success" | "error";

// ─── Stat card ────────────────────────────────────────────────────────────────

function Stat({ value, label, warn = false }: { value: number; label: string; warn?: boolean }) {
  return (
    <div className="rounded-lg border border-green-100 bg-white p-3">
      <p className={`text-2xl font-bold ${warn ? "text-amber-600" : "text-gray-900"}`}>
        {value.toLocaleString()}
      </p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

// ─── Duplicate dialog ─────────────────────────────────────────────────────────

function DuplicateDialog({
  info,
  onReplace,
  onForce,
  onCancel,
}: {
  info: DuplicateInfo;
  onReplace: () => void;
  onForce: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle size={18} className="shrink-0 text-amber-500" />
            <h3 className="text-base font-semibold text-gray-900">Possible duplicate upload</h3>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>

        <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm space-y-1.5">
          <p className="font-medium text-amber-800">Existing upload found:</p>
          <p className="text-amber-700">
            <span className="font-medium">{info.file_name}</span>
          </p>
          <p className="text-amber-600 text-xs">
            Uploaded: {new Date(info.uploaded_at).toLocaleString()} ·{" "}
            {info.row_count != null ? `${info.row_count.toLocaleString()} rows` : "unknown rows"}
          </p>
          {info.overlap.length > 0 && (
            <p className="text-amber-600 text-xs">
              Overlapping periods: {info.overlap.join(", ")}
            </p>
          )}
        </div>

        <p className="mt-4 text-sm text-gray-600">
          Choose how to proceed:
        </p>

        <div className="mt-3 space-y-2">
          <button
            onClick={onReplace}
            className="flex w-full items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 hover:bg-red-100 transition-colors"
          >
            <span>Replace existing</span>
            <span className="text-xs font-normal text-red-500">Deletes the old upload first</span>
          </button>
          <button
            onClick={onForce}
            className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <span>Upload anyway</span>
            <span className="text-xs font-normal text-gray-400">Keep both uploads</span>
          </button>
          <button
            onClick={onCancel}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-500 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Upload section ───────────────────────────────────────────────────────────

interface UploadSectionProps {
  endpoint: string;
  title: string;
  description: string;
  infoItems: string[];
  onUploadComplete?: () => void;
}

function UploadSection({ endpoint, title, description, infoItems, onUploadComplete }: UploadSectionProps) {
  const [file, setFile] = useState<File | null>(null);
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [result, setResult] = useState<UploadPLResponse | AddbacksUploadResponse | OffshoreAllocationsUploadResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [dragging, setDragging] = useState(false);
  const [pendingDupe, setPendingDupe] = useState<DuplicateInfo | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(f: File | null) {
    if (!f) return;
    setFile(f);
    setStatus("idle");
    setResult(null);
    setErrorMsg("");
    setPendingDupe(null);
    f.arrayBuffer().then(setFileBuffer).catch(() => setFileBuffer(null));
  }

  async function doUpload(url: string) {
    if (!file) return;
    setStatus("uploading");
    setPendingDupe(null);
    const fd = new FormData();
    if (fileBuffer) {
      fd.append("file", new Blob([fileBuffer], { type: file.type }), file.name);
    } else {
      fd.append("file", file);
    }
    try {
      const res = await fetch(url, { method: "POST", body: fd });
      const json = await res.json();
      if (res.status === 409 && json.duplicate) {
        setStatus("idle");
        setPendingDupe(json.info as DuplicateInfo);
        return;
      }
      if (!res.ok) {
        setStatus("error");
        setErrorMsg(json.error ?? "Unknown error");
        return;
      }
      setResult(json);
      setStatus("success");
      onUploadComplete?.();
    } catch (err) {
      setStatus("error");
      setErrorMsg(String(err));
    }
  }

  function handleUpload() {
    doUpload(endpoint);
  }

  function reset() {
    setFile(null);
    setFileBuffer(null);
    setStatus("idle");
    setResult(null);
    setErrorMsg("");
    setPendingDupe(null);
  }

  return (
    <div className="space-y-4">
      {pendingDupe && (
        <DuplicateDialog
          info={pendingDupe}
          onReplace={() => doUpload(`${endpoint}?replace_id=${pendingDupe.upload_id}`)}
          onForce={() => doUpload(`${endpoint}?force=true`)}
          onCancel={() => { setPendingDupe(null); setStatus("idle"); }}
        />
      )}

      <div>
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        <p className="text-sm text-gray-500">{description}</p>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0] ?? null); }}
        onClick={() => inputRef.current?.click()}
        className={[
          "cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors",
          dragging
            ? "border-blue-400 bg-blue-50"
            : "border-gray-300 bg-white hover:border-blue-300 hover:bg-gray-50",
        ].join(" ")}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />
        <FileSpreadsheet size={36} className="mx-auto text-gray-300" />
        <p className="mt-2 text-sm font-medium text-gray-600">
          {file ? file.name : "Drag here or click to select"}
        </p>
        <p className="mt-1 text-xs text-gray-400">Accepted formats: .xlsx, .xls</p>
      </div>

      {file && status === "idle" && (
        <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm">
          <div className="flex items-center gap-2 text-gray-700">
            <FileSpreadsheet size={16} className="text-green-500" />
            <span className="font-medium">{file.name}</span>
            <span className="text-gray-400">({(file.size / 1024).toFixed(1)} KB)</span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); reset(); }}
            className="text-gray-400 hover:text-red-500"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {file && status !== "success" && (
        <button
          onClick={handleUpload}
          disabled={status === "uploading"}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          {status === "uploading" ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Processing…
            </>
          ) : (
            <>
              <Upload size={16} /> Upload &amp; process
            </>
          )}
        </button>
      )}

      {status === "success" && result && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-5 space-y-3">
          <div className="flex items-center gap-2 font-semibold text-green-700">
            <CheckCircle2 size={18} /> Upload complete
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <Stat value={result.rowCount} label="Rows loaded" />
            <Stat value={result.uncategorizedCount} label="Uncategorized" warn={result.uncategorizedCount > 0} />
            <Stat value={result.unknownBranchCount} label="Unknown branch" warn={result.unknownBranchCount > 0} />
          </div>
          {result.parseWarnings > 0 && (
            <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              {result.parseWarnings} row(s) had parse warnings and were skipped.
            </p>
          )}
          {(result.uncategorizedCount > 0 || result.unknownBranchCount > 0) && (
            <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Some rows are uncategorized. Review GL Mapping and Branches in Settings.
            </p>
          )}
          <button
            onClick={reset}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Upload another file
          </button>
        </div>
      )}

      {status === "error" && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5">
          <div className="flex items-center gap-2 font-semibold text-red-700">
            <AlertCircle size={18} /> Processing error
          </div>
          <p className="mt-2 text-sm text-red-600">{errorMsg}</p>
          <button
            onClick={() => setStatus("idle")}
            className="mt-3 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Retry
          </button>
        </div>
      )}

      <div className="rounded-xl border border-gray-100 bg-white p-4 text-sm text-gray-500 space-y-1.5">
        <p className="font-semibold text-gray-700">What does this upload do?</p>
        <ol className="list-decimal list-inside space-y-1">
          {infoItems.map((item, i) => <li key={i}>{item}</li>)}
        </ol>
      </div>
    </div>
  );
}

// ─── Loan Count upload section ───────────────────────────────────────────────

function LoanCountUploadSection() {
  const [file, setFile] = useState<File | null>(null);
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [result, setResult] = useState<UploadLoanCountResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(f: File | null) {
    if (!f) return;
    setFile(f); setStatus("idle"); setResult(null); setErrorMsg("");
    f.arrayBuffer().then(setFileBuffer).catch(() => setFileBuffer(null));
  }

  async function handleUpload() {
    if (!file) return;
    setStatus("uploading");
    const fd = new FormData();
    if (fileBuffer) fd.append("file", new Blob([fileBuffer], { type: file.type }), file.name);
    else fd.append("file", file);
    try {
      const res = await fetch("/api/upload-loan-count", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) { setStatus("error"); setErrorMsg(json.error ?? "Unknown error"); return; }
      setResult(json as UploadLoanCountResponse);
      setStatus("success");
    } catch (err) {
      setStatus("error"); setErrorMsg(String(err));
    }
  }

  function reset() {
    setFile(null); setFileBuffer(null); setStatus("idle"); setResult(null); setErrorMsg("");
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-gray-900">Loan Count</h3>
        <p className="text-sm text-gray-500">
          Monthly loan master list (18 columns). Triggers loan number completion on all P&L transactions.
        </p>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0] ?? null); }}
        onClick={() => inputRef.current?.click()}
        className={[
          "cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors",
          dragging ? "border-blue-400 bg-blue-50" : "border-gray-300 bg-white hover:border-blue-300 hover:bg-gray-50",
        ].join(" ")}
      >
        <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
        <FileSpreadsheet size={36} className="mx-auto text-gray-300" />
        <p className="mt-2 text-sm font-medium text-gray-600">{file ? file.name : "Drag here or click to select"}</p>
        <p className="mt-1 text-xs text-gray-400">Accepted formats: .xlsx, .xls</p>
      </div>

      {file && status === "idle" && (
        <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm">
          <div className="flex items-center gap-2 text-gray-700">
            <FileSpreadsheet size={16} className="text-green-500" />
            <span className="font-medium">{file.name}</span>
            <span className="text-gray-400">({(file.size / 1024).toFixed(1)} KB)</span>
          </div>
          <button onClick={(e) => { e.stopPropagation(); reset(); }} className="text-gray-400 hover:text-red-500">
            <X size={16} />
          </button>
        </div>
      )}

      {file && status !== "success" && (
        <button onClick={handleUpload} disabled={status === "uploading"}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
          {status === "uploading"
            ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> Processing…</>
            : <><Upload size={16} /> Upload &amp; process</>}
        </button>
      )}

      {status === "success" && result && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-5 space-y-3">
          <div className="flex items-center gap-2 font-semibold text-green-700">
            <CheckCircle2 size={18} /> Upload complete
          </div>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="rounded-lg border border-green-100 bg-white p-3">
              <p className="text-2xl font-bold text-gray-900">{result.rowCount}</p>
              <p className="text-xs text-gray-500">Loans loaded</p>
            </div>
            <div className="rounded-lg border border-green-100 bg-white p-3">
              <p className="text-2xl font-bold text-gray-900">{result.month ?? "—"} {result.year ?? ""}</p>
              <p className="text-xs text-gray-500">Period</p>
            </div>
          </div>
          {result.warnings > 0 && (
            <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              {result.warnings} row(s) skipped (invalid loan number format).
            </p>
          )}
          {result.completion.processed > 0 && (
            <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-800 space-y-1">
              <p className="font-semibold">Loan number completion — {result.completion.processed} P&L transactions processed:</p>
              <ul className="space-y-0.5 pl-2">
                <li>✓ {result.completion.completed_direct} had 12-digit loan numbers (copied directly)</li>
                <li>✓ {result.completion.completed_from_10} 10-digit numbers completed to 12 digits</li>
                {result.completion.incomplete_no_match > 0 && (
                  <li className="text-amber-700">⚠ {result.completion.incomplete_no_match} 10-digit numbers with no match (loan_number_incomplete)</li>
                )}
                {result.completion.incomplete_ambiguous > 0 && (
                  <li className="text-amber-700">⚠ {result.completion.incomplete_ambiguous} ambiguous (2+ possible matches, loan_number_incomplete)</li>
                )}
              </ul>
            </div>
          )}
          <button onClick={reset}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Upload another file
          </button>
        </div>
      )}

      {status === "error" && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5">
          <div className="flex items-center gap-2 font-semibold text-red-700">
            <AlertCircle size={18} /> Processing error
          </div>
          <p className="mt-2 text-sm text-red-600">{errorMsg}</p>
          <button onClick={() => setStatus("idle")}
            className="mt-3 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Retry
          </button>
        </div>
      )}

      <div className="rounded-xl border border-gray-100 bg-white p-4 text-sm text-gray-500 space-y-1.5">
        <p className="font-semibold text-gray-700">What does this upload do?</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Replaces existing loan data for the same month/year (safe to re-upload).</li>
          <li>Stores branch, borrower, loan officer, loan program, loan type, and five Yes/No flags.</li>
          <li>Runs loan number completion: 12-digit raw → copied directly; 10-digit raw → matched to unique 12-digit entry.</li>
          <li>Marks unresolved or ambiguous loan numbers as loan_number_incomplete for audit.</li>
        </ol>
      </div>
    </div>
  );
}

// ─── Upload history ───────────────────────────────────────────────────────────

type UploadRecord = {
  id: string;
  file_name: string;
  source_type: "original" | "addback" | "offshore_allocations" | null;
  uploaded_at: string;
  row_count: number | null;
  status: string;
  error_message?: string | null;
};

const SOURCE_LABEL: Record<string, string> = {
  original: "GL Detail",
  addback: "Addback",
  offshore_allocations: "Offshore",
};

const SOURCE_COLOR: Record<string, string> = {
  original: "bg-gray-100 text-gray-700",
  addback: "bg-purple-100 text-purple-700",
  offshore_allocations: "bg-blue-100 text-blue-700",
};

function UploadHistory({ refreshKey }: { refreshKey: number }) {
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/uploads");
      if (res.ok) setUploads(await res.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  async function handleDelete(id: string) {
    setDeletingId(id); setErrorMsg("");
    try {
      const res = await fetch(`/api/uploads/${id}`, { method: "DELETE" });
      if (!res.ok) { const j = await res.json(); setErrorMsg(j.error ?? "Delete failed"); return; }
      setUploads((prev) => prev.filter((u) => u.id !== id));
    } finally { setDeletingId(null); setConfirmId(null); }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900">Upload History</h3>
        <button
          onClick={load}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {errorMsg && (
        <p className="rounded-lg border border-red-100 bg-red-50 px-4 py-2 text-xs text-red-600">{errorMsg}</p>
      )}

      {loading ? (
        <div className="py-8 text-center text-gray-400">
          <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600" />
        </div>
      ) : uploads.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">No uploads yet.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-3 font-medium">File name</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Uploaded at</th>
                <th className="px-4 py-3 font-medium text-right">Rows</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {uploads.map((u) => (
                <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                  <td className="max-w-[220px] truncate px-4 py-2.5 font-medium text-gray-800" title={u.file_name}>
                    {u.file_name}
                  </td>
                  <td className="px-4 py-2.5">
                    {u.source_type ? (
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${SOURCE_COLOR[u.source_type] ?? "bg-gray-100 text-gray-600"}`}>
                        {SOURCE_LABEL[u.source_type] ?? u.source_type}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">
                    {new Date(u.uploaded_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-gray-700">
                    {u.row_count != null ? u.row_count.toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    {u.status === "completed" ? (
                      <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">Completed</span>
                    ) : u.status === "error" ? (
                      <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700" title={u.error_message ?? ""}>Error</span>
                    ) : (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">{u.status}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {confirmId === u.id ? (
                      <div className="flex items-center justify-end gap-1.5">
                        <span className="text-gray-500">Delete?</span>
                        <button
                          onClick={() => handleDelete(u.id)}
                          disabled={deletingId === u.id}
                          className="rounded bg-red-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-red-700 disabled:opacity-40"
                        >
                          {deletingId === u.id ? "…" : "Yes"}
                        </button>
                        <button
                          onClick={() => setConfirmId(null)}
                          className="rounded border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-medium text-gray-500 hover:bg-gray-50"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmId(u.id)}
                        className="flex items-center gap-1 rounded px-2 py-0.5 text-gray-400 hover:text-red-600 hover:bg-red-50"
                        title="Delete this upload and all its transactions"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function UploadPage() {
  const [historyKey, setHistoryKey] = useState(0);

  function refreshHistory() { setHistoryKey((k) => k + 1); }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Upload P&amp;L</h2>
        <p className="text-sm text-gray-500">
          Upload GL Detail Reports, Addback, or Offshore Allocation files to load transactions into the system.
        </p>
      </div>

      {/* ── GL Detail Report ── */}
      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6">
        <UploadSection
          endpoint="/api/upload-pl"
          title="GL Detail Report"
          description="Export from the accounting system (.xlsx). Requires normalization before import."
          infoItems={[
            "Normalizes the report: filters subtotal rows, fill-down, splits GL Code / Branch.",
            "Joins each row against GL Mapping and Branches to assign categories and region.",
            "Applies Cost Center rules to classify each transaction.",
            "Saves all transactions tagged as source = Original.",
          ]}
          onUploadComplete={refreshHistory}
        />
      </div>

      {/* ── Addbacks ── */}
      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6">
        <UploadSection
          endpoint="/api/upload-addbacks"
          title="Addbacks"
          description="Pre-formatted addback file. Required columns: GL Code, Branch, GL Name, Check Description, Debit, Credit, Month, Year."
          infoItems={[
            "Reads rows directly — no normalization needed (file is already clean).",
            "Joins each row against GL Mapping and Branches to assign categories and region.",
            "Applies Cost Center rules to classify each transaction.",
            "Saves all transactions tagged as source = Addback.",
          ]}
          onUploadComplete={refreshHistory}
        />
      </div>

      {/* ── Offshore Allocations ── */}
      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6">
        <UploadSection
          endpoint="/api/upload-offshore-allocations"
          title="Offshore Allocations"
          description="Pre-formatted offshore allocation file. Required columns: GL Code, Branch, Movement, Month, Year."
          infoItems={[
            "Reads rows directly — no normalization needed (file is already clean).",
            "Applies sign transformation: debit = Movement value, credit = 0, movement = −Movement.",
            "Joins each row against GL Mapping and Branches to assign categories and region.",
            "Applies Cost Center rules to classify each transaction.",
            "Saves all transactions tagged as source = Offshore Allocations.",
          ]}
          onUploadComplete={refreshHistory}
        />
      </div>

      {/* ── Loan Count ── */}
      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6">
        <LoanCountUploadSection />
      </div>

      {/* ── Upload History ── */}
      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6">
        <UploadHistory refreshKey={historyKey} />
      </div>
    </div>
  );
}
