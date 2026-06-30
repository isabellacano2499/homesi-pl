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
  opens_group?: boolean;
  closes_group?: boolean;
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

  // Stack-based evaluation: each frame holds the outer accumulated result and the
  // connector that will join it with the group result when the group closes.
  const stack: { accumulated: boolean | null; connector: "AND" | "OR" | null }[] = [];
  let result: boolean | null = null;

  for (const cond of sorted) {
    const val = matchCondition(tx, cond);

    if (cond.opens_group) {
      // Push outer context; start a fresh inner accumulator with this condition as first item
      stack.push({ accumulated: result, connector: cond.logic_connector ?? "AND" });
      result = val;
    } else {
      // Normal accumulation (or very first condition)
      if (result === null) {
        result = val;
      } else if (cond.logic_connector === "OR") {
        result = result || val;
      } else {
        result = result && val;
      }
    }

    // closes_group: merge the group result back into the outer context
    if (cond.closes_group && stack.length > 0) {
      const frame = stack.pop()!;
      if (frame.accumulated === null) {
        // Group started the expression — group result IS the accumulated result
      } else if (frame.connector === "OR") {
        result = frame.accumulated || (result ?? false);
      } else {
        result = frame.accumulated && (result ?? false);
      }
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
    return { cost_center_id: null, cost_center_status: "unassigned", cost_center_conflicts: [], operational_pct: 100 };
  }

  // Aggregate allocations across all matched rules, merging same-CC entries
  const ccTotals = new Map<string, number>();
  const ccIsOp = new Map<string, boolean>();
  let grandTotal = 0;
  for (const rule of matched) {
    for (const alloc of rule.allocations) {
      ccTotals.set(alloc.cost_center_id, (ccTotals.get(alloc.cost_center_id) ?? 0) + alloc.percentage);
      ccIsOp.set(alloc.cost_center_id, (ccIsOp.get(alloc.cost_center_id) ?? false) || rule.is_operational);
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
    // Operational % = sum of allocation percentages from Operational rules
    // Since grandTotal ≈ 100, this directly gives the Operational fraction (0–100)
    let operationalPct = 0;
    for (const rule of matched) {
      if (rule.is_operational) {
        operationalPct += rule.allocations.reduce((s, a) => s + a.percentage, 0);
      }
    }
    return {
      cost_center_id: primaryCcId,
      cost_center_status: "assigned",
      cost_center_conflicts: [],
      operational_pct: operationalPct,
      rule_splits: ccTotals.size > 1
        ? [...ccTotals.entries()].map(([cost_center_id, percentage]) => ({
            cost_center_id,
            percentage,
            is_operational: ccIsOp.get(cost_center_id) ?? true,
          }))
        : undefined,
    };
  }

  return {
    cost_center_id: null,
    cost_center_status: "conflict",
    cost_center_conflicts: matched.map((r) => r.id),
    conflict_type: grandTotal < 100 ? "underassigned" : "overassigned",
    operational_pct: 100,
  };
}
