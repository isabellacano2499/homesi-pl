// ─── GL Detail Report sheet ───────────────────────────────────────────────────
export const GL_SHEET_IDENTIFIER = "gl detail"; // matched with .toLowerCase().includes()

export const GL_COL = {
  GL_NUMBER: "GLNumber",
  GL_NAME: "GLName",
  CHECK_DESCRIPTION: "CheckDescription",
  JOURNAL_POST_DATE: "JournalPostDate",
  VENDOR: "Vendor",
  INVOICE_NUMB: "InvoiceNumb",
  REF_NUMB: "RefNumb",
  DOC_TYPE: "DocType",
  DEBIT: "Debit",
  CREDIT: "Credit",
} as const;

// Rows whose CheckDescription contains this keyword are subtotal/summary rows
export const TOTAL_FILTER_KEYWORD = "total";

// GLNumber is formatted as "<gl_code>-<branch>"
export const GL_NUMBER_SEPARATOR = "-";

// ─── Mapping sheet ────────────────────────────────────────────────────────────
export const MAPPING_SHEET_NAME = "mapping"; // matched with .toLowerCase()

export const MAP_COL = {
  GL_CODE: "gl code",
  GL_NAME: "glname",
  GL_NAME_ALT: "gl name",
  REGION: "region",
  BRANCH: "branch",
  BRANCH_MANAGER: "branch manager",
  BRANCH_MANAGER_ALT: "branchmanager",
} as const;

// Category and Order field prefixes (lowercased for matching)
export const CATEGORY_PREFIX = "category ";
export const ORDER_PREFIX = "order ";

// ─── Upload / processing ──────────────────────────────────────────────────────
export const INSERT_CHUNK_SIZE = 500;

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;
