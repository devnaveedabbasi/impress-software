import api from "@/lib/axios";

// A printed report is read page by page and never above this many rows, so that a huge table (for example
// 200,000 records) cannot freeze the browser. When there is more, the report says so and asks to narrow the filters.
export const PRINT_MAX_ROWS = 5000;

export type ReportMeta = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  totals?: { recQty: number; rejQty: number; okQty: number };
  // The header of a one-document (ID-wise) report
  document?: Record<string, string | number | null | undefined>;
};

// keepMs: how long the pages may be kept in the browser storage, so a print tab opened a moment later re-uses them
// The server is asked for a report in pieces of this many rows. The result page and the print page both use this
// piece (same address, filters in one fixed order), so what the result page already read is the first piece of the
// print: the print tab finds it in the browser storage and does not ask the server again.
export const REPORT_CHUNK = 500;

export async function fetchReportChunk<T>(url: string, params: URLSearchParams, page: number, keepMs = 0) {
  const sorted = new URLSearchParams([...params.entries()].sort(([a], [b]) => a.localeCompare(b)));
  sorted.set("page", String(page));
  sorted.set("limit", String(REPORT_CHUNK));
  const { data } = await api.get(`${url}?${sorted.toString()}`, { persistMs: keepMs });
  return { rows: ((data.data as T[]) || []), meta: data.meta as ReportMeta | undefined };
}

export async function fetchAllReportRows<T>(url: string, params: URLSearchParams, maxRows = PRINT_MAX_ROWS, keepMs = 0) {
  const rows: T[] = [];
  let page = 1;
  let meta: ReportMeta | undefined;

  for (;;) {
    const chunk = await fetchReportChunk<T>(url, params, page, keepMs);
    rows.push(...chunk.rows);
    meta = chunk.meta;

    const totalPages = meta?.totalPages ?? 1;
    if (page >= totalPages || rows.length >= maxRows) {
      return { rows: rows.slice(0, maxRows), total: meta?.total ?? rows.length, truncated: page < totalPages, meta };
    }
    page++;
  }
}
