import api from "@/lib/axios";

// A printed report is read page by page and never above this many rows, so that a huge table (for example
// 200,000 records) cannot freeze the browser. When there is more, the report says so and asks to narrow the filters.
export const PRINT_MAX_ROWS = 5000;
const PRINT_PAGE_SIZE = 500;

export type ReportMeta = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  totals?: { recQty: number; rejQty: number; okQty: number };
};

export async function fetchAllReportRows<T>(url: string, params: URLSearchParams, maxRows = PRINT_MAX_ROWS) {
  const rows: T[] = [];
  let page = 1;
  let meta: ReportMeta | undefined;

  for (;;) {
    const pageParams = new URLSearchParams(params);
    pageParams.set("page", String(page));
    pageParams.set("limit", String(PRINT_PAGE_SIZE));

    const { data } = await api.get(`${url}?${pageParams.toString()}`);
    rows.push(...((data.data as T[]) || []));
    meta = data.meta as ReportMeta | undefined;

    const totalPages = meta?.totalPages ?? 1;
    if (page >= totalPages || rows.length >= maxRows) {
      return { rows: rows.slice(0, maxRows), total: meta?.total ?? rows.length, truncated: page < totalPages, meta };
    }
    page++;
  }
}
