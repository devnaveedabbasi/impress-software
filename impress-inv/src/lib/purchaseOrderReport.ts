import { PURCHASE_ORDERS } from "@/utlis/apiRoutes";
import {
  ALL,
  PAGE_SIZES,
  DEFAULT_PAGE_SIZE,
  PO_COLUMNS,
  formatDate,
  formatNumber,
  type Column,
  type Option,
} from "@/lib/inwardReport";

// Settings shared by the Purchase Order report filter page, result page and print page

export { ALL, PAGE_SIZES, DEFAULT_PAGE_SIZE, formatDate, formatNumber };
export type { Column, Option };

export const PO_REPORT_PATH = "/purchase/purchase-order-report";
export const PO_REPORT_RESULT_PATH = `${PO_REPORT_PATH}/result`;
export const PO_REPORT_PRINT_PATH = "/print/purchase-order-report";
export const PO_REPORT_PRINT_MAX = 2000;

export type PoTabKey = "date" | "vendor" | "item" | "balance";
export type PoFieldKey = "fromDate" | "toDate" | "vendorId" | "itemName";
export type PoFilters = Record<PoFieldKey, string>;

export type PoTabConfig = {
  key: PoTabKey;
  label: string;
  description: string;
  dataPath: string; // API that returns the rows page by page
  printPath: string;
  fields: PoFieldKey[]; // the fields this report uses, in order
  required: PoFieldKey[];
};

export const PO_TABS: PoTabConfig[] = [
  {
    key: "date",
    label: "Date-wise",
    description: "All purchase orders between two dates.",
    dataPath: `${PURCHASE_ORDERS}/report`,
    printPath: PO_REPORT_PRINT_PATH,
    fields: ["fromDate", "toDate", "vendorId"],
    required: ["fromDate", "toDate"],
  },
  {
    key: "vendor",
    label: "Vendor-wise",
    description: "Purchase orders of one vendor.",
    dataPath: `${PURCHASE_ORDERS}/report`,
    printPath: PO_REPORT_PRINT_PATH,
    fields: ["vendorId", "fromDate", "toDate"],
    required: ["vendorId"],
  },
  {
    key: "item",
    label: "Item-wise",
    description: "Every purchase order line of one item, with qty, rate and amount.",
    dataPath: `${PURCHASE_ORDERS}/report`,
    printPath: PO_REPORT_PRINT_PATH,
    fields: ["itemName", "vendorId", "fromDate", "toDate"],
    required: ["itemName"],
  },
  {
    key: "balance",
    label: "PO Balance",
    description: "Ordered, received and balance quantity of purchase orders.",
    dataPath: `${PURCHASE_ORDERS}/balance-report`,
    printPath: "/print/purchase-order-balance",
    fields: ["vendorId", "itemName", "fromDate", "toDate"],
    required: [],
  },
];

export const findPoTab = (key: string | null | undefined) => PO_TABS.find((tab) => tab.key === key);

export const PO_FIELD_LABELS: Record<PoFieldKey, string> = {
  fromDate: "From Date",
  toDate: "To Date",
  vendorId: "Vendor",
  itemName: "Item",
};

const today = () => new Date().toISOString().split("T")[0];
const monthStart = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString().split("T")[0];
};

// Vendor / item are required in some tabs (no "All" choice there) and optional in others
export const emptyPoFilters = (tab: PoTabKey): PoFilters => ({
  fromDate: tab === "date" ? monthStart() : "",
  toDate: tab === "date" ? today() : "",
  vendorId: tab === "vendor" ? "" : ALL,
  itemName: tab === "item" ? "" : ALL,
});

// One row per purchase order (date-wise and vendor-wise)
export const PO_LIST_COLUMNS: Column[] = [
  { header: "PO No", align: "center", render: (r) => String(r.poId ?? "-") },
  { header: "Date", align: "center", render: (r) => formatDate(r.date) },
  { header: "Vendor", render: (r) => String(r.vendorName ?? "-") },
  { header: "Validity", render: (r) => String(r.validity ?? "-") },
  { header: "Items", align: "center", render: (r) => formatNumber(r.itemsCount) },
  { header: "Total", align: "center", render: (r) => formatNumber(r.total) },
  { header: "Sale Tax %", align: "center", render: (r) => formatNumber(r.saleTaxPercent) },
  { header: "Grand Total", align: "center", render: (r) => formatNumber(r.grandTotal) },
];

// One row per purchase order line of the chosen item (item-wise)
export const PO_LINE_COLUMNS: Column[] = [
  { header: "PO No", align: "center", render: (r) => String(r.poId ?? "-") },
  { header: "Date", align: "center", render: (r) => formatDate(r.date) },
  { header: "Vendor", render: (r) => String(r.vendorName ?? "-") },
  { header: "Item", render: (r) => String(r.itemName ?? "-") },
  { header: "Qty", align: "center", render: (r) => formatNumber(r.quantity) },
  { header: "Rate", align: "center", render: (r) => formatNumber(r.rate) },
  { header: "Amount", align: "center", render: (r) => formatNumber(r.amount) },
];

export const columnsFor = (tab: PoTabKey): Column[] =>
  tab === "item" ? PO_LINE_COLUMNS : tab === "balance" ? PO_COLUMNS : PO_LIST_COLUMNS;

// Date and vendor tabs list whole purchase orders, so the item filter is only sent by the tabs that use it
export const rowsLabel = (tab: PoTabKey) => (tab === "item" ? "order lines" : "purchase orders");
