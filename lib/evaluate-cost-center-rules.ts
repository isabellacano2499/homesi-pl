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

  // Build an ordered list of groups.
  // group_number = 0 means pre-migration (no grouping): each condition is its own
  // singleton group identified by its sequence, preserving the existing behavior.
  // group_number > 0: conditions with the same group_number form a group.
  const groupMap = new Map<number | string, CostCenterRule[]>();
  const groupOrder: (number | string)[] = [];

  for (const rule of sorted) {
    const key: number | string =
      rule.group_number === 0 ? `_s${rule.sequence}` : rule.group_number;
    if (!groupMap.has(key)) {
      groupMap.set(key, []);
      groupOrder.push(key);
    }
    groupMap.get(key)!.push(rule);
  }

  // Evaluate each group internally, then combine group results left-to-right.
  // Within a group: first condition starts the group result; subsequent conditions
  // use their logic_connector as the intra-group connector.
  // Between groups: the first condition of each group carries the inter-group
  // connector (how this group connects to the previous group result).
  let result: boolean | null = null;

  for (const key of groupOrder) {
    const group = groupMap.get(key)!;
    const interConnector = group[0].logic_connector;

    let groupResult = matchCondition(tx, group[0]);
    for (let i = 1; i < group.length; i++) {
      const r = group[i];
      if (r.logic_connector === "AND") groupResult = groupResult && matchCondition(tx, r);
      else groupResult = groupResult || matchCondition(tx, r);
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
