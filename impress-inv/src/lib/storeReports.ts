import {
  STOCK_REGISTER,
  STOCK_POSITION,
  STOCK_SHORTAGE,
  STOCK_ISSUES,
} from "@/utlis/apiRoutes";

// The Store Department reports (Stock Register, Stock Ledger, Shortage and Issue report) are described here once.
// The report page and the print page both read these settings: filters, the columns of the table and the totals.

export type StoreReportRow = Record<string, string | number | null | undefined>;
export type StoreReportTotals = Record<string, number>;

export const ALL = "all"; // "no filter" needs a real option value, an empty string would show the placeholder
export const PRINT_MAX_ROWS = 5000;

export type FilterDef = {
  key: string;
  label: string;
  type: "date" | "select" | "number" | "text";
  /** Select options loaded from the server */
  source?: "categories" | "departments" | "colors" | "items";
  /** Select options that never change */
  options?: { label: string; value: string }[];
  /** Adds a first choice that means "no filter" */
  allLabel?: string;
  required?: boolean;
  min?: number;
  max?: number;
  defaultValue?: string;
  placeholder?: string;
  maxLength?: number;
};

export type ColumnDef = {
  header: string;
  align?: "left" | "center" | "right";
  render: (row: StoreReportRow) => string;
};

export type StoreReportDef = {
  key: string;
  title: string;
  description: string;
  endpoint: string;
  operation: string; // permission: <operation>:view
  filters: FilterDef[];
  columns: ColumnDef[];
  summary: (totals: StoreReportTotals) => [label: string, value: number][];
  emptyText: string;
  /** All rows are loaded and shown in grouped tables (no pages): by department, or by department and category */
  grouped?: "department" | "departmentCategory";
};

// Rows grouped like the printed "Store Stock Position": department, then category, then the items
export type ReportGroup = { department: string; categories: { category: string; rows: StoreReportRow[] }[] };

export const groupRows = (rows: StoreReportRow[], by: "department" | "departmentCategory" = "departmentCategory"): ReportGroup[] => {
  const groups: ReportGroup[] = [];
  for (const row of rows) {
    const department = String(row.departmentName ?? "-");
    // Grouped by department only: all of its items are one table
    const category = by === "department" ? "" : String(row.categoryName ?? "-");
    let group = groups.find((item) => item.department === department);
    if (!group) groups.push((group = { department, categories: [] }));
    let section = group.categories.find((item) => item.category === category);
    if (!section) group.categories.push((section = { category, rows: [] }));
    section.rows.push(row);
  }
  return groups;
};

const num = (value: string | number | null | undefined) => Number(value ?? 0).toLocaleString();
const date = (value: string | number | null | undefined) =>
  value ? new Date(value).toLocaleDateString("en-GB") : "-";
const text = (value: string | number | null | undefined) => (value === null || value === undefined || value === "" ? "-" : String(value));
// A quantity that is zero is left empty, like on the printed stock position
const qty = (value: string | number | null | undefined) => (Number(value) ? Number(value).toLocaleString() : "");

export const STORE_REPORTS: Record<string, StoreReportDef> = {
  "stock-register": {
    key: "stock-register",
    title: "Stock Register",
    description: "Opening, received, issued and closing stock of every item. Choose dates to see one period.",
    endpoint: STOCK_REGISTER,
    operation: "stock_register",
    filters: [
      { key: "fromDate", label: "From date", type: "date" },
      { key: "toDate", label: "To date", type: "date" },
      { key: "categoryId", label: "Category", type: "select", source: "categories", allLabel: "All categories" },
      { key: "departmentId", label: "Department", type: "select", source: "departments", allLabel: "All departments" },
      { key: "itemName", label: "Item name", type: "text", placeholder: "Part of the item name", maxLength: 100 },
      {
        key: "status",
        label: "Stock",
        type: "select",
        defaultValue: ALL,
        options: [
          { label: "All items", value: ALL },
          { label: "Only items in stock", value: "inStock" },
          { label: "Only items with no stock", value: "zero" },
        ],
      },
    ],
    columns: [
      { header: "Code", align: "center", render: (r) => text(r.inventoryId) },
      { header: "Item Name", render: (r) => text(r.itemName) },
      { header: "Category", render: (r) => text(r.categoryName) },
      { header: "Department", render: (r) => text(r.departmentName) },
      { header: "Opening", align: "right", render: (r) => num(r.opening) },
      { header: "In", align: "right", render: (r) => num(r.qtyIn) },
      { header: "Out", align: "right", render: (r) => num(r.qtyOut) },
      { header: "Closing", align: "right", render: (r) => num(r.closing) },
    ],
    summary: (t) => [
      ["Opening", t.opening ?? 0],
      ["Total In", t.qtyIn ?? 0],
      ["Total Out", t.qtyOut ?? 0],
      ["Closing", t.closing ?? 0],
    ],
    emptyText: "No items found for these filters.",
  },

  "stock-ledger": {
    key: "stock-ledger",
    title: "Store Stock Position",
    description:
      "Opening, inward, issue, aftersale and stock in hand of every item, by department and category. Issue is net of the items returned. Use Item Ledger for the lines of one item.",
    endpoint: STOCK_POSITION,
    operation: "stock_ledger",
    grouped: "departmentCategory",
    filters: [
      { key: "fromDate", label: "From date", type: "date" },
      { key: "toDate", label: "To date", type: "date" },
      { key: "departmentId", label: "Department", type: "select", source: "departments", allLabel: "All departments" },
      { key: "categoryId", label: "Category", type: "select", source: "categories", allLabel: "All categories" },
    ],
    columns: [
      { header: "Itcode", align: "center", render: (r) => text(r.inventoryId) },
      { header: "Item Name", render: (r) => text(r.itemName) },
      { header: "UPM", align: "center", render: (r) => text(r.unitPerBike) },
      { header: "Opening Qty", align: "right", render: (r) => qty(r.opening) },
      { header: "Inward Qty", align: "right", render: (r) => qty(r.inward) },
      { header: "Issue Qty", align: "right", render: (r) => qty(r.issue) },
      { header: "Aftersale Qty", align: "right", render: (r) => qty(r.aftersale) },
      { header: "Vendor Reject", align: "right", render: (r) => qty(r.vendorReject) },
      { header: "Stock In Hand", align: "right", render: (r) => num(r.stock) },
    ],
    summary: (t) => [
      ["Opening", t.opening ?? 0],
      ["Inward", t.inward ?? 0],
      ["Issue", t.issue ?? 0],
      ["Aftersale", t.aftersale ?? 0],
      ["Vendor Reject", t.vendorReject ?? 0],
      ["Stock In Hand", t.stock ?? 0],
    ],
    emptyText: "No items found for these filters.",
  },

  shortage: {
    key: "shortage",
    title: "Shortage Report",
    description:
      "What is short to build a number of bikes, by department. Require = bikes x Upm, After Bal = In Hand - Require. A negative After Bal is a shortage.",
    endpoint: STOCK_SHORTAGE,
    operation: "shortage_report",
    grouped: "department",
    filters: [
      { key: "bikes", label: "Bikes to build", type: "number", required: true, min: 1, max: 100000, defaultValue: "1", placeholder: "e.g. 100" },
      { key: "departmentId", label: "Department", type: "select", source: "departments", allLabel: "All departments" },
      { key: "categoryId", label: "Category", type: "select", source: "categories", allLabel: "All categories" },
      {
        key: "show",
        label: "Show",
        type: "select",
        defaultValue: "shortage",
        options: [
          { label: "Only short items", value: "shortage" },
          { label: "All items", value: "all" },
        ],
      },
    ],
    columns: [
      { header: "Code", align: "center", render: (r) => text(r.inventoryId) },
      { header: "Item Name", render: (r) => text(r.itemName) },
      { header: "UPM", align: "center", render: (r) => (Number(r.unitPerBike) ? num(r.unitPerBike) : "") },
      { header: "Require", align: "right", render: (r) => num(r.required) },
      { header: "In Hand", align: "right", render: (r) => num(r.inHand) },
      { header: "After Bal", align: "right", render: (r) => num(r.afterBal) },
    ],
    summary: (t) => [
      ["Items checked", t.items ?? 0],
      ["Items short", t.shortItems ?? 0],
      ["Total shortage", t.shortQty ?? 0],
    ],
    emptyText: "No item is short for this number of bikes.",
  },

  issue: {
    key: "issue",
    title: "Issue Report",
    description: "The items issued from the store to the departments (Store Issuance slips), by department and dates.",
    endpoint: STOCK_ISSUES,
    operation: "issue_report",
    filters: [
      { key: "fromDate", label: "From date", type: "date" },
      { key: "toDate", label: "To date", type: "date" },
      { key: "departmentId", label: "Department", type: "select", source: "departments", allLabel: "All departments" },
    ],
    columns: [
      { header: "Slip No", align: "center", render: (r) => text(r.slipNo) },
      { header: "Date", align: "center", render: (r) => date(r.date) },
      { header: "Department", render: (r) => text(r.departmentName) },
      { header: "Color", render: (r) => text(r.colorName) },
      { header: "Bikes", align: "center", render: (r) => num(r.bikeQty) },
      { header: "Item Name", render: (r) => text(r.itemName) },
      { header: "Upm", align: "center", render: (r) => num(r.upm) },
      { header: "Issue Qty", align: "right", render: (r) => num(r.issueQty) },
      { header: "Purpose", render: (r) => text(r.purpose) },
    ],
    summary: (t) => [["Total issued", t.issueQty ?? 0]],
    emptyText: "No issue found for these filters.",
  },
};

export const findStoreReport = (key: string | null | undefined) => (key ? STORE_REPORTS[key] : undefined);

// The filters as a query string. A filter that is empty or "all" is not sent.
export const buildFilterParams = (def: StoreReportDef, values: Record<string, string>) => {
  const params = new URLSearchParams();
  for (const filter of def.filters) {
    const value = (values[filter.key] ?? "").trim();
    if (value && value !== ALL) params.set(filter.key, value);
  }
  return params;
};

export const initialFilterValues = (def: StoreReportDef) =>
  Object.fromEntries(def.filters.map((filter) => [filter.key, filter.defaultValue ?? (filter.type === "select" ? ALL : "")]));

// Returns the first problem of each filter (an empty object means the filters are fine)
export const validateFilters = (def: StoreReportDef, values: Record<string, string>) => {
  const errors: Record<string, string> = {};
  for (const filter of def.filters) {
    const value = (values[filter.key] ?? "").trim();
    if (filter.required && !value) {
      errors[filter.key] = `${filter.label} is required`;
    } else if (filter.type === "number" && value) {
      const n = Number(value);
      if (!Number.isInteger(n)) errors[filter.key] = `${filter.label} must be a whole number`;
      else if (filter.min !== undefined && n < filter.min) errors[filter.key] = `${filter.label} must be at least ${filter.min.toLocaleString()}`;
      else if (filter.max !== undefined && n > filter.max) errors[filter.key] = `${filter.label} cannot be more than ${filter.max.toLocaleString()}`;
    }
  }
  if (values.fromDate && values.toDate && values.fromDate > values.toDate) {
    errors.toDate = "To date cannot be before From date";
  }
  return errors;
};
