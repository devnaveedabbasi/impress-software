import { INWARDS, PURCHASE_ORDERS } from "@/utlis/apiRoutes";

// Settings shared by the report filter page and the report result page

export const REPORT_PATH = "/store/inward-quality-control-report";
export const REPORT_RESULT_PATH = `${REPORT_PATH}/result`;

export type Option = { label: string; value: string };
export type TabKey = "date" | "vendor" | "item" | "id" | "po";
export type FieldKey = "fromDate" | "toDate" | "vendorId" | "itemName" | "status" | "inwardId";
export type Filters = Record<FieldKey, string>;
export type ReportRow = Record<string, string | number | null | undefined>;

// "No filter" needs a real option value, an empty string would show the placeholder
export const ALL = "all";
export const PAGE_SIZES = [25, 50, 100];
export const DEFAULT_PAGE_SIZE = 50;
export const PO_PRINT_MAX = 2000;

export const STATUS_OPTIONS: Option[] = [
  { label: "All rows (Rejected + OK)", value: ALL },
  { label: "Only rejected rows", value: "rejected" },
  { label: "Only OK rows", value: "ok" },
];

export type TabConfig = {
  key: TabKey;
  label: string;
  description: string;
  dataPath: string; // API that returns the rows page by page
  printPath: string;
  fields: FieldKey[]; // the fields this report uses, in order
  required: FieldKey[];
};

// Every report has its own fields
export const TABS: TabConfig[] = [
  {
    key: "date",
    label: "Date-wise",
    description: "All inward entries between two dates, grouped by date.",
    dataPath: `${INWARDS}/report`,
    printPath: "/print/inward-quality-control-report",
    fields: ["fromDate", "toDate", "status"],
    required: ["fromDate", "toDate"],
  },
  {
    key: "vendor",
    label: "Vendor-wise",
    description: "Inward entries of one vendor, grouped by PO.",
    dataPath: `${INWARDS}/report`,
    printPath: "/print/inward-quality-control-report",
    fields: ["vendorId", "fromDate", "toDate", "status"],
    required: ["vendorId"],
  },
  {
    key: "item",
    label: "Item-wise",
    description: "Inward entries of one item, with received, rejected and OK totals.",
    dataPath: `${INWARDS}/report`,
    printPath: "/print/inward-quality-control-item-wise",
    fields: ["itemName", "fromDate", "toDate", "status"],
    required: ["itemName"],
  },
  {
    key: "id",
    label: "ID-wise",
    description: "The full report of one inward entry. Enter its Inward / Q.C number.",
    dataPath: `${INWARDS}/report`,
    printPath: "/print/inward-quality-control-report",
    fields: ["inwardId"],
    required: ["inwardId"],
  },
  {
    key: "po",
    label: "PO Balance",
    description: "Ordered, received and balance quantity of purchase orders.",
    dataPath: `${PURCHASE_ORDERS}/balance-report`,
    printPath: "/print/purchase-order-balance",
    fields: ["vendorId", "itemName", "fromDate", "toDate"],
    required: [],
  },
];

export const findTab = (key: string | null | undefined) => TABS.find((tab) => tab.key === key);

export const FIELD_LABELS: Record<FieldKey, string> = {
  fromDate: "From Date",
  toDate: "To Date",
  vendorId: "Vendor",
  itemName: "Item",
  status: "Row Status (REJ / OK)",
  inwardId: "Inward / Q.C No",
};

const today = () => new Date().toISOString().split("T")[0];
const monthStart = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString().split("T")[0];
};

// Vendor / item are required in some tabs (no "All" choice there) and optional in others
export const emptyFilters = (tab: TabKey): Filters => ({
  fromDate: tab === "date" ? monthStart() : "",
  toDate: tab === "date" ? today() : "",
  vendorId: tab === "vendor" ? "" : ALL,
  itemName: tab === "item" ? "" : ALL,
  status: ALL,
  inwardId: "",
});

const INWARD_TYPE_LABELS: Record<string, string> = {
  againstPO: "Against PO",
  againstSimple: "Against Simple",
  againstDealarRejection: "Against Dealer Rejection",
};

// The header of an ID-wise report: who, when and which papers
export const inwardDocumentEntries = (doc: Record<string, string | number | null | undefined>): [string, string | number | null | undefined][] => [
  ["Inward / Q.C No", doc.inwardId],
  ["Date", doc.date ? formatDate(doc.date) : ""],
  ["Type", doc.type ? INWARD_TYPE_LABELS[String(doc.type)] ?? String(doc.type) : ""],
  ["PO No", doc.poNo],
  ["Vendor", doc.vendorName],
  ["G.R.LR No", doc.grirNo],
  ["D.C No", doc.dcNo],
  ["Bill No", doc.billNo],
  ["Details", doc.detail],
];

export const formatDate = (value: string | number | null | undefined) =>
  value ? new Date(value).toISOString().split("T")[0] : "-";
// A number as it is, up to two decimals (money is shown exactly, to the paisa: 0.8 stays 0.8)
export const formatNumber = (value: string | number | null | undefined) =>
  Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

export type Column = { header: string; align?: "left" | "center"; render: (row: ReportRow) => string };

export const INWARD_COLUMNS: Column[] = [
  { header: "Date", align: "center", render: (r) => formatDate(r.date) },
  { header: "Gr#", align: "center", render: (r) => String(r.grirNo ?? "-") },
  { header: "PO No", align: "center", render: (r) => String(r.poNo ?? "-") },
  { header: "Vendor", render: (r) => String(r.vendorName ?? "-") },
  { header: "D.C No", align: "center", render: (r) => String(r.dcNo ?? "-") },
  { header: "Bill No", align: "center", render: (r) => String(r.billNo ?? "-") },
  { header: "Item", render: (r) => String(r.itemName ?? "-") },
  { header: "Recvd", align: "center", render: (r) => formatNumber(r.recQty) },
  { header: "Rej", align: "center", render: (r) => formatNumber(r.rejQty) },
  { header: "OK", align: "center", render: (r) => formatNumber(r.okQty) },
];

// The item table of an ID-wise report (the inward's own details are in its header)
export const INWARD_DOC_COLUMNS: Column[] = [
  { header: "Item", render: (r) => String(r.itemName ?? "-") },
  { header: "Received", align: "center", render: (r) => formatNumber(r.recQty) },
  { header: "Rejected", align: "center", render: (r) => formatNumber(r.rejQty) },
  { header: "OK", align: "center", render: (r) => formatNumber(r.okQty) },
];

export const PO_COLUMNS: Column[] = [
  { header: "PO No", align: "center", render: (r) => String(r.poId ?? "-") },
  { header: "Date", align: "center", render: (r) => formatDate(r.date) },
  { header: "Vendor", render: (r) => String(r.vendorName ?? "-") },
  { header: "Item", render: (r) => String(r.itemName ?? "-") },
  { header: "Ordered", align: "center", render: (r) => formatNumber(r.orderedQty) },
  { header: "Received", align: "center", render: (r) => formatNumber(r.receivedQty) },
  { header: "Balance", align: "center", render: (r) => formatNumber(r.balanceQty) },
];
