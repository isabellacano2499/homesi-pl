/** Fields available in Cost Center / Split Rule conditions, mapped to their data type. */
export const CC_FIELDS = [
  // ── Transaction fields ──────────────────────────────────────────────────────
  { value: "gl_code",             label: "GL Code",           kind: "glcode"  },
  { value: "gl_name",             label: "GL Name",           kind: "text"    },
  { value: "branch",              label: "Branch",            kind: "text"    },
  { value: "vendor",              label: "Vendor",            kind: "text"    },
  { value: "check_description",   label: "Description",       kind: "text"    },
  { value: "check_description_2", label: "Check Desc 2",      kind: "text"    },
  { value: "check_description_3", label: "Check Desc 3",      kind: "text"    },
  { value: "ref_numb",            label: "Ref Numb",          kind: "text"    },
  { value: "category_5",          label: "Category 5",        kind: "text"    },
  { value: "category_6",          label: "Category 6",        kind: "text"    },
  { value: "doc_type",            label: "Doc Type",          kind: "text"    },
  { value: "month",               label: "Month",             kind: "text"    },
  { value: "year",                label: "Year",              kind: "numeric" },
  { value: "debit",               label: "Debit",             kind: "numeric" },
  { value: "credit",              label: "Credit",            kind: "numeric" },
  { value: "movement",            label: "Movement",          kind: "numeric" },
  // ── Loan Officials fields (joined via loan_number at evaluation time) ───────
  { value: "b2b",                 label: "B2B",               kind: "boolean" },
  { value: "processing",          label: "Processing",        kind: "boolean" },
  { value: "support_on_demand",   label: "Support on Demand", kind: "boolean" },
  { value: "affinity",            label: "Affinity",          kind: "boolean" },
  { value: "recruitment",         label: "Recruitment",       kind: "boolean" },
  { value: "lead_source_lo",      label: "Lead Source LO",    kind: "text"    },
  { value: "bd_owner",            label: "BD Owner",          kind: "text"    },
] as const;

export type CCFieldKind = "text" | "numeric" | "glcode" | "boolean";

export const TEXT_OPERATORS = [
  { value: "equals",           label: "equals" },
  { value: "not_equals",       label: "does not equal" },
  { value: "contains",         label: "contains" },
  { value: "does_not_contain", label: "does not contain" },
  { value: "starts_with",      label: "starts with" },
  { value: "ends_with",        label: "ends with" },
] as const;

export const NUMERIC_OPERATORS = [
  { value: "equals",           label: "=" },
  { value: "not_equals",       label: "≠" },
  { value: "greater_than",     label: ">" },
  { value: "less_than",        label: "<" },
  { value: "greater_or_equal", label: "≥" },
  { value: "less_or_equal",    label: "≤" },
] as const;

export const BOOLEAN_OPERATORS = [
  { value: "equals",     label: "is" },
  { value: "not_equals", label: "is not" },
] as const;

export const NUMERIC_FIELDS = new Set(["year", "debit", "credit", "movement"]);

/** Fields that come from loan_officials (joined via loan_number). */
export const LOAN_OFFICIAL_FIELDS = new Set([
  "b2b", "processing", "support_on_demand", "affinity", "recruitment",
  "lead_source_lo", "bd_owner",
]);

export function getFieldKind(field: string): CCFieldKind {
  const found = CC_FIELDS.find((f) => f.value === field);
  return (found?.kind ?? "text") as CCFieldKind;
}

export function operatorsForField(field: string) {
  const kind = getFieldKind(field);
  if (kind === "numeric") return NUMERIC_OPERATORS;
  if (kind === "boolean") return BOOLEAN_OPERATORS;
  return TEXT_OPERATORS;
}

export function defaultOperator(field: string): string {
  const kind = getFieldKind(field);
  if (kind === "numeric" || kind === "boolean") return "equals";
  return "contains";
}

export function defaultValue(field: string): string {
  if (getFieldKind(field) === "boolean") return "yes";
  return "";
}
