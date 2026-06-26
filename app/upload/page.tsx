"use client";

import { useState, useRef } from "react";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, X } from "lucide-react";
import type { UploadPLResponse, AddbacksUploadResponse, OffshoreAllocationsUploadResponse } from "@/types";

type UploadStatus = "idle" | "uploading" | "success" | "error";

// ─── Shared sub-components ────────────────────────────────────────────────────

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

// ─── Generic upload zone + state block ───────────────────────────────────────

interface UploadSectionProps {
  endpoint: string;
  title: string;
  description: string;
  infoItems: string[];
}

function UploadSection({ endpoint, title, description, infoItems }: UploadSectionProps) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [result, setResult] = useState<UploadPLResponse | AddbacksUploadResponse | OffshoreAllocationsUploadResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(f: File | null) {
    if (!f) return;
    setFile(f);
    setStatus("idle");
    setResult(null);
    setErrorMsg("");
  }

  async function handleUpload() {
    if (!file) return;
    setStatus("uploading");
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(endpoint, { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setStatus("error");
        setErrorMsg(json.error ?? "Unknown error");
        return;
      }
      setResult(json);
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setErrorMsg(String(err));
    }
  }

  function reset() {
    setFile(null);
    setStatus("idle");
    setResult(null);
    setErrorMsg("");
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        <p className="text-sm text-gray-500">{description}</p>
      </div>

      {/* Drop zone */}
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

      {/* Selected file info */}
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

      {/* Upload button */}
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

      {/* Success */}
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

      {/* Error */}
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

      {/* Info box */}
      <div className="rounded-xl border border-gray-100 bg-white p-4 text-sm text-gray-500 space-y-1.5">
        <p className="font-semibold text-gray-700">What does this upload do?</p>
        <ol className="list-decimal list-inside space-y-1">
          {infoItems.map((item, i) => <li key={i}>{item}</li>)}
        </ol>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function UploadPage() {
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
        />
      </div>
    </div>
  );
}
