"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2, Plus, RefreshCw } from "lucide-react";
import type {
  SummaryResponse,
  CategorySubSection,
  SplitItemData,
  PatternData,
  GLPatternGroup,
} from "@/app/api/cost-centers/[id]/summary/route";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const FMT_PCT = (n: number) => `${n.toFixed(1)}%`;

// ─── GL code header ───────────────────────────────────────────────────────────
function GLCodeHeader({
  gl_code,
  gl_name,
  total_count,
}: {
  gl_code: string;
  gl_name: string | null;
  total_count?: number;
}) {
  return (
    <div className="flex items-center gap-2 mb-1.5 mt-0.5">
      <span className="font-mono text-xs font-bold bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5 text-gray-700">
        {gl_code}
      </span>
      {gl_name && <span className="text-xs text-gray-600 font-medium">{gl_name}</span>}
      {total_count !== undefined && (
        <span className="ml-auto text-xs text-gray-400">{total_count} tx</span>
      )}
    </div>
  );
}

// ─── Split item row ───────────────────────────────────────────────────────────
function SplitItemRow({ item }: { item: SplitItemData }) {
  return (
    <div className="flex items-start gap-2 py-1 text-sm">
      <span className="w-2 h-2 mt-1.5 shrink-0 rounded-full bg-indigo-400" />
      <div className="min-w-0">
        <span className="font-medium text-gray-800">{item.name}</span>
        {item.item_type === "roster_offshore" && (
          <span className="ml-1.5 text-xs text-gray-400">offshore</span>
        )}
        <span className="ml-2 text-xs text-gray-500">{FMT_PCT(item.pct_this_cc)} here</span>
        {item.other_ccs.length > 0 && (
          <span className="ml-2 text-xs text-gray-400">
            {item.other_ccs.map(o => `${FMT_PCT(o.pct)} → ${o.cc_name}`).join(" · ")}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Pattern row ─────────────────────────────────────────────────────────────
function PatternRow({
  p,
  ccId,
  onDeleted,
}: {
  p: PatternData;
  ccId: string;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!p.pattern_id) return;
    setDeleting(true);
    await fetch(`/api/cost-centers/${ccId}/description-patterns/${p.pattern_id}`, { method: "DELETE" });
    onDeleted();
  };

  return (
    <div className="flex items-center gap-2 py-0.5 text-sm group">
      <span className="w-1.5 h-1.5 shrink-0 rounded-full bg-gray-300 mt-px" />
      <span className="font-mono text-xs text-gray-700 truncate max-w-xs">{p.pattern}</span>
      <span className="text-gray-400 text-xs shrink-0">× {p.count}</span>
      {p.is_manual && (
        <>
          <span className="text-blue-400 text-xs shrink-0">manual</span>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="ml-1 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </>
      )}
    </div>
  );
}

// ─── Add pattern form ─────────────────────────────────────────────────────────
function AddPatternForm({
  ccId,
  onAdded,
  defaultGlCode,
}: {
  ccId: string;
  onAdded: () => void;
  defaultGlCode?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pattern, setPattern] = useState("");
  const [glCode, setGlCode] = useState(defaultGlCode ?? "");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pattern.trim()) return;
    setSaving(true);
    await fetch(`/api/cost-centers/${ccId}/description-patterns`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pattern: pattern.trim(), gl_code: glCode.trim() || null }),
    });
    setSaving(false);
    setPattern("");
    setGlCode(defaultGlCode ?? "");
    setOpen(false);
    onAdded();
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-2 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
      >
        <Plus className="w-3 h-3" /> Add manual pattern
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 flex flex-wrap items-center gap-2">
      <input
        autoFocus
        value={pattern}
        onChange={(e) => setPattern(e.target.value)}
        placeholder="Pattern text (partial match)"
        className="h-7 rounded border border-gray-300 bg-white px-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300 min-w-48"
      />
      <input
        value={glCode}
        onChange={(e) => setGlCode(e.target.value)}
        placeholder="GL code (optional)"
        className="h-7 w-28 rounded border border-gray-300 bg-white px-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300"
      />
      <button
        type="submit"
        disabled={saving || !pattern.trim()}
        className="h-7 px-2.5 rounded bg-blue-600 text-white text-xs disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="h-7 px-2 text-xs text-gray-500 hover:text-gray-700"
      >
        Cancel
      </button>
    </form>
  );
}

// ─── Sub-section renderer ─────────────────────────────────────────────────────
function SubSection({
  section,
  ccId,
  onRefresh,
}: {
  section: CategorySubSection;
  ccId: string;
  onRefresh: () => void;
}) {
  if (section.mode === "split_items") {
    return (
      <div className="space-y-2">
        {section.category_3_groups.map((g, gi) => (
          <div key={gi}>
            {g.category_3 && (
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                {g.category_3}
              </p>
            )}
            <div className="space-y-0.5">
              {g.items.map((item, ii) => (
                <SplitItemRow key={ii} item={item} />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (section.mode === "dm_margin") {
    return (
      <div>
        <GLCodeHeader gl_code={section.gl_code} gl_name={section.gl_name} />
        <div className="text-sm text-gray-700 ml-1">
          División margin —{" "}
          <span className="font-semibold text-gray-900">{section.loan_count}</span>{" "}
          {section.loan_count === 1 ? "loan" : "loans"}
        </div>
      </div>
    );
  }

  // mode === "patterns"
  return (
    <div className="space-y-4">
      {section.gl_groups.map((g: GLPatternGroup, gi: number) => (
        <div key={gi}>
          <GLCodeHeader gl_code={g.gl_code} gl_name={g.gl_name} total_count={g.total_count} />
          <div className="space-y-0.5 ml-1">
            {g.patterns.map((p, pi) => (
              <PatternRow key={pi} p={p} ccId={ccId} onDeleted={onRefresh} />
            ))}
          </div>
          <div className="ml-1">
            <AddPatternForm ccId={ccId} onAdded={onRefresh} defaultGlCode={g.gl_code} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Category group card ───────────────────────────────────────────────────────
function CategoryGroupBlock({
  category_2,
  sub_sections,
  ccId,
  onRefresh,
}: {
  category_2: string | null;
  sub_sections: CategorySubSection[];
  ccId: string;
  onRefresh: () => void;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3 shadow-sm">
      <h4 className="text-sm font-semibold text-gray-800">
        {category_2 ?? <span className="italic text-gray-400">Uncategorized</span>}
      </h4>
      {sub_sections.map((s, si) => (
        <SubSection key={si} section={s} ccId={ccId} onRefresh={onRefresh} />
      ))}
    </div>
  );
}

// ─── Year / Month filter bar ───────────────────────────────────────────────────
const ALL_MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [CURRENT_YEAR - 1, CURRENT_YEAR];

// ─── Main component ───────────────────────────────────────────────────────────
export function CCSummaryTab({ ccId }: { ccId: string }) {
  const [selYears, setSelYears] = useState<number[]>([CURRENT_YEAR]);
  const [selMonths, setSelMonths] = useState<string[]>([]);
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      selYears.forEach(y => params.append("year", String(y)));
      selMonths.forEach(m => params.append("month", m));
      const res = await fetch(`/api/cost-centers/${ccId}/summary?${params}`);
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [ccId, selYears, selMonths]);

  useEffect(() => { load(); }, [load]);

  const toggleYear = (y: number) =>
    setSelYears(prev => prev.includes(y) ? prev.filter(v => v !== y) : [...prev, y]);
  const toggleMonth = (m: string) =>
    setSelMonths(prev => prev.includes(m) ? prev.filter(v => v !== m) : [...prev, m]);

  const hasFilters = selYears.length > 0 || selMonths.length > 0;

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {YEAR_OPTIONS.map(y => (
            <button
              key={y}
              onClick={() => toggleYear(y)}
              className={`h-7 px-2.5 rounded-full text-xs font-medium transition-colors ${
                selYears.includes(y)
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {y}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {ALL_MONTHS.map(m => (
            <button
              key={m}
              onClick={() => toggleMonth(m)}
              className={`h-6 px-2 rounded-full text-xs font-medium transition-colors ${
                selMonths.includes(m)
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {m.slice(0, 3)}
            </button>
          ))}
        </div>
        {hasFilters && (
          <button
            onClick={() => { setSelYears([]); setSelMonths([]); }}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Clear
          </button>
        )}
        <button
          onClick={load}
          disabled={loading}
          className="ml-auto flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 disabled:opacity-40"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Content */}
      {loading && <p className="text-sm text-gray-400 py-8 text-center">Loading…</p>}
      {error && <p className="text-sm text-red-500 py-4">{error}</p>}

      {!loading && !error && data && (
        data.sections.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">No data for the selected period.</p>
        ) : (
          <div className="space-y-6">
            {data.sections.map((sec, si) => (
              <div key={si}>
                <div className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold mb-3 ${
                  sec.is_operational
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-orange-100 text-orange-700"
                }`}>
                  {sec.is_operational ? "Operational" : "Non-Operational"}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {sec.groups.map((g, gi) => (
                    <CategoryGroupBlock
                      key={gi}
                      category_2={g.category_2}
                      sub_sections={g.sub_sections}
                      ccId={ccId}
                      onRefresh={load}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
