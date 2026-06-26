"use client";

import type { SplitEntry } from "@/lib/apply-splits";

interface SplitDisplayProps {
  splits: SplitEntry[] | null | undefined;
  /** Rendered when splits is empty or null */
  fallback?: React.ReactNode;
  /** compact=true → truncated text line (for tight columns like Transaction Review) */
  compact?: boolean;
}

/**
 * Renders a cost-center split allocation.
 * - 0 splits → renders fallback
 * - 1 split at 100% → shows CC name only (no % — avoids visual noise for the simple case)
 * - 2+ splits → shows each CC with its percentage
 */
export function SplitDisplay({ splits, fallback = null, compact = false }: SplitDisplayProps) {
  if (!splits || splits.length === 0) return <>{fallback}</>;

  const firstName = splits[0].cost_centers?.name;

  if (splits.length === 1) {
    if (!firstName) return <>{fallback}</>;
    if (compact) return <span className="text-gray-700 truncate">{firstName}</span>;
    return (
      <span className="rounded bg-green-50 px-1.5 py-0.5 font-medium text-green-700">
        {firstName}
      </span>
    );
  }

  // Multi-split — build full label for title attribute
  const fullLabel = splits.map(s => `${s.cost_centers?.name ?? "?"} (${s.percentage}%)`).join(", ");

  if (compact) {
    return (
      <span className="truncate text-gray-700" title={fullLabel}>
        {fullLabel}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap gap-1" title={fullLabel}>
      {splits.map((s, i) => (
        <span
          key={i}
          className="rounded bg-green-50 px-1.5 py-0.5 font-medium text-green-700 whitespace-nowrap"
        >
          {s.cost_centers?.name ?? "?"}
          {" "}<span className="font-normal text-green-400">{s.percentage}%</span>
        </span>
      ))}
    </span>
  );
}
