import { NUMERIC_FIELDS, LOAN_OFFICIAL_FIELDS } from "@/lib/cost-center-constants";
import type {
  PLTransaction,
  CostCenterWithRules,
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
  // This covers: no loan_number, loan_number_incomplete=true, or no matching LO row.
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

  // group_number=0 → each condition is its own singleton group (pre-grouping rows)
  // group_number>0 → conditions share a group
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

export function evaluateCostCenterRules(
  tx: PLTransaction,
  costCenters: CostCenterWithRules[],
  splitRules: SplitRuleWithDetails[] = []
): CostCenterEvalResult {
  const simpleMatched = costCenters.filter((cc) =>
    evaluateConditions(tx, cc.rules)
  );
  const splitMatched = splitRules.filter((sr) =>
    evaluateConditions(tx, sr.conditions)
  );

  // Any mix of simple + split → conflict
  if (splitMatched.length > 0 && simpleMatched.length > 0) {
    return {
      cost_center_id: null,
      cost_center_status: "conflict",
      cost_center_conflicts: simpleMatched.map((cc) => cc.id),
    };
  }

  // Multiple split rules → conflict (conservative)
  // Encode split rule IDs with "split:" prefix so the UI can distinguish
  // split+split conflicts from CC+CC conflicts and show enriched proposals.
  if (splitMatched.length > 1) {
    return {
      cost_center_id: null,
      cost_center_status: "conflict",
      cost_center_conflicts: splitMatched.map((sr) => `split:${sr.id}`),
    };
  }

  // Exactly one split rule, no simple matches
  if (splitMatched.length === 1) {
    const sr = splitMatched[0];
    const primary = [...sr.allocations].sort((a, b) => b.percentage - a.percentage)[0];
    return {
      cost_center_id: primary?.cost_center_id ?? null,
      cost_center_status: "assigned",
      cost_center_conflicts: [],
      rule_splits: sr.allocations.map((a) => ({
        cost_center_id: a.cost_center_id,
        percentage: a.percentage,
      })),
    };
  }

  // Pure simple rules (original logic)
  if (simpleMatched.length === 0) {
    return { cost_center_id: null, cost_center_status: "unassigned", cost_center_conflicts: [] };
  }
  if (simpleMatched.length === 1) {
    return { cost_center_id: simpleMatched[0].id, cost_center_status: "assigned", cost_center_conflicts: [] };
  }
  return {
    cost_center_id: null,
    cost_center_status: "conflict",
    cost_center_conflicts: simpleMatched.map((cc) => cc.id),
  };
}
