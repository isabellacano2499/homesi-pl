import { NUMERIC_FIELDS } from "@/lib/cost-center-constants";
import type { PLTransaction, CostCenterWithRules, CostCenterRule, CostCenterEvalResult } from "@/types";

// ─── Single condition match ───────────────────────────────────────────────────

function matchCondition(tx: PLTransaction, rule: CostCenterRule): boolean {
  const raw = (tx as unknown as Record<string, unknown>)[rule.field];
  const fieldVal = raw != null ? String(raw) : "";
  const ruleVal = rule.value;

  if (NUMERIC_FIELDS.has(rule.field)) {
    const n = Number(fieldVal);
    const r = Number(ruleVal);
    switch (rule.operator) {
      case "equals":          return n === r;
      case "not_equals":      return n !== r;
      case "greater_than":    return n > r;
      case "less_than":       return n < r;
      case "greater_or_equal": return n >= r;
      case "less_or_equal":   return n <= r;
      default:                return false;
    }
  }

  const fv = fieldVal.toLowerCase();
  const rv = ruleVal.toLowerCase();
  switch (rule.operator) {
    case "equals":           return fv === rv;
    case "not_equals":       return fv !== rv;
    case "contains":         return fv.includes(rv);
    case "does_not_contain": return !fv.includes(rv);
    case "starts_with":      return fv.startsWith(rv);
    case "ends_with":        return fv.endsWith(rv);
    default:                 return false;
  }
}

// ─── One Cost Center evaluation ───────────────────────────────────────────────

function matchesCostCenter(tx: PLTransaction, cc: CostCenterWithRules): boolean {
  const sorted = [...cc.rules].sort((a, b) => a.sequence - b.sequence);
  if (sorted.length === 0) return false;

  // Strict left-to-right accumulation: no operator precedence.
  // ((cond1 AND cond2) OR cond3) AND cond4 …
  let result = matchCondition(tx, sorted[0]);
  for (let i = 1; i < sorted.length; i++) {
    const rule = sorted[i];
    if (rule.logic_connector === "AND") {
      result = result && matchCondition(tx, rule);
    } else {
      result = result || matchCondition(tx, rule);
    }
  }
  return result;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function evaluateCostCenterRules(
  tx: PLTransaction,
  costCenters: CostCenterWithRules[]
): CostCenterEvalResult {
  const matched = costCenters.filter((cc) => matchesCostCenter(tx, cc));

  if (matched.length === 0) {
    return { cost_center_id: null, cost_center_status: "unassigned", cost_center_conflicts: [] };
  }
  if (matched.length === 1) {
    return { cost_center_id: matched[0].id, cost_center_status: "assigned", cost_center_conflicts: [] };
  }
  return {
    cost_center_id: null,
    cost_center_status: "conflict",
    cost_center_conflicts: matched.map((cc) => cc.id),
  };
}
