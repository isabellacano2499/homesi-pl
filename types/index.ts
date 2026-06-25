// ─── Supabase table shapes ────────────────────────────────────────────────────

export interface GLMapping {
  id: string;
  gl_code: string;
  gl_name: string;
  category_1: string | null;
  category_2: string | null;
  category_3: string | null;
  category_4: string | null;
  category_5: string | null;
  category_6: string | null;
  category_7: string | null;
  order_1: number | null;
  order_2: number | null;
  order_3: number | null;
  created_at: string;
  updated_at: string;
}

export interface Branch {
  id: string;
  branch: string;
  region: string | null;
  branch_manager: string | null;
  created_at: string;
  updated_at: string;
}

export interface PLUpload {
  id: string;
  file_name: string;
  uploaded_at: string;
  row_count: number | null;
  status: "processing" | "completed" | "error";
  error_message: string | null;
}

export interface PLTransaction {
  id: string;
  upload_id: string;
  gl_number_raw: string | null;
  gl_code: string | null;
  branch: string | null;
  gl_name: string | null;
  check_description: string | null;
  loan_number: string | null;
  borrower_name: string | null;
  journal_post_date: string | null;
  year: number | null;
  month: string | null;
  vendor: string | null;
  invoice_numb: string | null;
  ref_numb: string | null;
  doc_type: string | null;
  debit: number;
  credit: number;
  movement: number | null;
  category_1: string | null;
  category_2: string | null;
  category_3: string | null;
  category_4: string | null;
  category_5: string | null;
  category_6: string | null;
  category_7: string | null;
  order_1: number | null;
  order_2: number | null;
  order_3: number | null;
  region: string | null;
  branch_manager: string | null;
  manual_override: boolean;
  manual_category_7: string | null;
  cost_center_id: string | null;
  cost_center_status: "unassigned" | "assigned" | "conflict" | null;
  cost_center_conflicts: string[] | null;
  cost_centers?: { name: string } | null;
  source: "original" | "addback" | null;
  created_at: string;
}

// ─── Cost Centers ──────────────────────────────────────────────────────────────

export interface CostCenter {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface CostCenterRule {
  id: string;
  cost_center_id: string;
  sequence: number;
  logic_connector: "AND" | "OR" | null;
  field: string;
  operator: string;
  value: string;
  created_at: string;
}

export interface CostCenterWithRules extends CostCenter {
  rules: CostCenterRule[];
}

export interface CostCenterEvalResult {
  cost_center_id: string | null;
  cost_center_status: "assigned" | "unassigned" | "conflict";
  cost_center_conflicts: string[];
}

// ─── Normalization pipeline ───────────────────────────────────────────────────

/** One row after full normalization, before database enrichment. */
export interface NormalizedRow {
  gl_number_raw: string;
  gl_code: string;
  branch: string;
  gl_name: string;
  check_description: string;
  loan_number: string | null;
  borrower_name: string | null;
  journal_post_date: string | null;
  year: number | null;
  month: string | null;
  vendor: string;
  invoice_numb: string;
  ref_numb: string;
  doc_type: string;
  debit: number;
  credit: number;
  movement: number;
}

/** A row that failed to parse cleanly; logged in the upload summary. */
export interface NormalizeWarning {
  rowIndex: number;
  rawGLNumber: string;
  message: string;
}

export interface NormalizePLResult {
  rows: NormalizedRow[];
  warnings: NormalizeWarning[];
}

// ─── Enrichment pipeline ──────────────────────────────────────────────────────

/** NormalizedRow after joining against gl_mapping and branches. */
export interface EnrichedTransaction extends NormalizedRow {
  upload_id: string;
  category_1: string | null;
  category_2: string | null;
  category_3: string | null;
  category_4: string | null;
  category_5: string | null;
  category_6: string | null;
  category_7: string | null;
  order_1: number | null;
  order_2: number | null;
  order_3: number | null;
  region: string | null;
  branch_manager: string | null;
  manual_override: false;
  source: "original" | "addback";
}

export interface EnrichResult {
  transactions: EnrichedTransaction[];
  uncategorizedCount: number;
  unknownBranchCount: number;
}

// ─── API response shapes ──────────────────────────────────────────────────────

/** Standard error envelope for all API routes. */
export interface ApiError {
  error: string;
  details?: unknown;
}

export interface UploadPLResponse {
  uploadId: string;
  rowCount: number;
  uncategorizedCount: number;
  unknownBranchCount: number;
  parseWarnings: number;
}

export interface AddbacksUploadResponse {
  uploadId: string;
  rowCount: number;
  uncategorizedCount: number;
  unknownBranchCount: number;
  parseWarnings: number;
}

export interface TransactionFilters {
  uploadId: string;
  // Multi-select categorical columns
  months: string[];
  years: string[];
  glCodes: string[];
  glNames: string[];
  branches: string[];
  vendors: string[];
  category5s: string[];
  category6s: string[];
  refNums: string[];
  // Cost center filter
  costCenterIds: string[];
  costCenterStatuses: string[];
  // Source filter ('original' | 'addback')
  sources: string[];
  // Text search
  description: string;
  // Numeric ranges
  debitMin: string;
  debitMax: string;
  creditMin: string;
  creditMax: string;
  movementMin: string;
  movementMax: string;
}

/** Distinct values per categorical column, used to populate column filter dropdowns. */
export interface TransactionColumnValues {
  month: string[];
  year: string[];
  gl_code: string[];
  gl_name: string[];
  branch: string[];
  vendor: string[];
  category_5: string[];
  category_6: string[];
  ref_numb: string[];
}

/** Full filter options including cost centers (replaces /api/transactions/values). */
export interface FilterOptionsResponse extends TransactionColumnValues {
  costCenters: Array<{ id: string; name: string }>;
}

/** Shared transaction shape used by P&L All and Cost Center Report pivot tables. */
export interface PLReportTx {
  id: string;
  month: string | null;
  branch: string | null;
  check_description: string | null;
  vendor: string | null;
  ref_numb: string | null;
  debit: number;
  credit: number;
  movement: number | null;
  gl_code: string | null;
  gl_name: string | null;
  category_2: string | null;
  category_7: string | null;
  order_1: number | null;
  order_2: number | null;
}

/** @deprecated use PLReportTx */
export type CCReportTx = PLReportTx & { category_6: string | null; year: number | null };

export interface CCReportResponse {
  cost_center: CostCenter;
  transactions: PLReportTx[];
}

export interface TransactionTotals {
  debit: number;
  credit: number;
  movement: number;
}

export interface TransactionsResponse {
  data: PLTransaction[];
  count: number;
  totals: TransactionTotals;
}
