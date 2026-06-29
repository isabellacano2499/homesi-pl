import { NUMERIC_FIELDS, LOAN_OFFICIAL_FIELDS } from "@/lib/cost-center-constants";
import type {
  PLTransaction,
  CostCenterEvalResult,
  SplitRuleWithDetails,
} from "@/types";

type ConditionLike = {
  sequence: number;
  logic_connector: "AND" | "OR" | null;
  field: string;
  operator: string;
  value: string;
  group_number: number;
};

function matchCondition(tx: PLTransaction, cond: ConditionLike): boolean {
  const raw = (tx as unknown as Record<string, unknown>)[cond.field];
  const ruleVal = cond.value;

  // Loan Official fields: if the data wasn't joined in (raw == null), never match.
  if (LOAN_OFFICIAL_FIELDS.has(cond.field) && raw == null) return false;

  // Boolean fields (b2b, processing, support_on_demand, affinity, recruitment)
  if (typeof raw === "boolean") {
    const expectTrue = ruleVal.toLowerCase() === "yes" || ruleVal.toLowerCase() === "true";
    switch (cond.operator) {
      case "equals":     return raw === expectTrue;
      case "not_equals": return raw !== expectTrue;
      default:           return false;
    }
  }

  const fieldVal = raw != null ? String(raw) : "";

  if (NUMERIC_FIELDS.has(cond.field)) {
    const n = Number(fieldVal);
    const r = Number(ruleVal);
    switch (cond.operator) {
      case "equals":           return n === r;
      case "not_equals":       return n !== r;
      case "greater_than":     return n > r;
      case "less_than":        return n < r;
      case "greater_or_equal": return n >= r;
      case "less_or_equal":    return n <= r;
      default:                 return false;
    }
  }

  const fv = fieldVal.toLowerCase();
  const rv = ruleVal.toLowerCase();
  switch (cond.operator) {
    case "equals":           return fv === rv;
    case "not_equals":       return fv !== rv;
    case "contains":         return fv.includes(rv);
    case "does_not_contain": return !fv.includes(rv);
    case "starts_with":      return fv.startsWith(rv);
    case "ends_with":        return fv.endsWith(rv);
    default:                 return false;
  }
}

export function evaluateConditions(tx: PLTransaction, conditions: ConditionLike[]): boolean {
  const sorted = [...conditions].sort((a, b) => a.sequence - b.sequence);
  if (sorted.length === 0) return false;

  const groupMap = new Map<number | string, ConditionLike[]>();
  const groupOrder: (number | string)[] = [];

  for (const cond of sorted) {
    const key: number | string =
      cond.group_number === 0 ? `_s${cond.sequence}` : cond.group_number;
    if (!groupMap.has(key)) {
      groupMap.set(key, []);
      groupOrder.push(key);
    }
    groupMap.get(key)!.push(cond);
  }

  let result: boolean | null = null;

  for (const key of groupOrder) {
    const group = groupMap.get(key)!;
    const interConnector = group[0].logic_connector;

    let groupResult = matchCondition(tx, group[0]);
    for (let i = 1; i < group.length; i++) {
      const c = group[i];
      if (c.logic_connector === "AND") groupResult = groupResult && matchCondition(tx, c);
      else groupResult = groupResult || matchCondition(tx, c);
    }

    if (result === null) {
      result = groupResult;
    } else if (interConnector === "AND") {
      result = result && groupResult;
    } else {
      result = result || groupResult;
    }
  }

  return result ?? false;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Unified evaluation: matches tx against ALL rules, sums their allocations.
 * - sum = 0%  (no rules matched)  → unassigned
 * - sum ≈ 100%                    → assigned (split if multiple CCs)
 * - sum < 100%                    → conflict / underassigned
 * - sum > 100%                    → conflict / overassigned
 */
export function evaluateCostCenterRules(
  tx: PLTransaction,
  unifiedRules: SplitRuleWithDetails[]
): CostCenterEvalResult {
  const matched = unifiedRules.filter(
    (r) => r.conditions.length > 0 && evaluateConditions(tx, r.conditions)
  );

  if (matched.length === 0) {
    return { cost_center_id: null, cost_center_status: "unassigned", cost_center_conflicts: [] };
  }

  // Aggregate allocations across all matched rules, merging same-CC entries
  const ccTotals = new Map<string, number>();
  let grandTotal = 0;
  for (const rule of matched) {
    for (const alloc of rule.allocations) {
      ccTotals.set(alloc.cost_center_id, (ccTotals.get(alloc.cost_center_id) ?? 0) + alloc.percentage);
      grandTotal += alloc.percentage;
    }
  }

  if (Math.abs(grandTotal - 100) <= 0.01) {
    // Primary CC = highest accumulated percentage
    let primaryCcId: string | null = null;
    let maxPct = -1;
    for (const [ccId, pct] of ccTotals) {
      if (pct > maxPct) { maxPct = pct; primaryCcId = ccId; }
    }
    return {
      cost_center_id: primaryCcId,
      cost_center_status: "assigned",
      cost_center_conflicts: [],
      rule_splits: ccTotals.size > 1
        ? [...ccTotals.entries()].map(([cost_center_id, percentage]) => ({ cost_center_id, percentage }))
        : undefined,
    };
  }

  return {
    cost_center_id: null,
    cost_center_status: "conflict",
    cost_center_conflicts: matched.map((r) => r.id),
    conflict_type: grandTotal < 100 ? "underassigned" : "overassigned",
  };
}
