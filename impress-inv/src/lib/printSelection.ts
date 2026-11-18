// "What to print" of the Master Entries print pages (Vendors, Dealers, Inventory).
// The choice travels in the address of the print page: ?id=5  |  ?from=10&to=40  |  ?last=100  |  (nothing = all)

export const PRINT_ALL_MAX = 2000; // the most records one print can hold
export const PRINT_LAST_CHOICES = [50, 100, 200];

export type PrintRecordLike = { id: number };

export type PrintSelection =
  | { mode: "record"; id: number }
  | { mode: "all" }
  | { mode: "range"; from: number; to: number }
  | { mode: "last"; count: number };

export const selectionToQuery = (selection: PrintSelection) => {
  switch (selection.mode) {
    case "record":
      return `id=${selection.id}`;
    case "range":
      return `from=${selection.from}&to=${selection.to}`;
    case "last":
      return `last=${selection.count}`;
    default:
      return "";
  }
};

const wholeNumber = (value: string | null) => (value && /^\d+$/.test(value) ? Number(value) : null);

// The records of a print page after the choice. "label" says what was chosen, for the heading of the paper.
export function selectPrintRecords<T extends PrintRecordLike>(records: T[], params: URLSearchParams, codeWord = "Codes") {
  const sorted = [...records].sort((a, b) => a.id - b.id);

  const id = wholeNumber(params.get("id"));
  if (id !== null) {
    return { rows: sorted.filter((record) => record.id === id), total: 1, truncated: false, label: `Record ${id}` };
  }

  const from = wholeNumber(params.get("from"));
  const to = wholeNumber(params.get("to"));
  if (from !== null && to !== null) {
    const rows = sorted.filter((record) => record.id >= from && record.id <= to);
    return { rows: rows.slice(0, PRINT_ALL_MAX), total: rows.length, truncated: rows.length > PRINT_ALL_MAX, label: `${codeWord} ${from} to ${to}` };
  }

  const last = wholeNumber(params.get("last"));
  if (last !== null && last > 0) {
    const count = Math.min(last, PRINT_ALL_MAX);
    return { rows: sorted.slice(-count), total: Math.min(sorted.length, count), truncated: false, label: `Last ${Math.min(count, sorted.length)} records` };
  }

  return { rows: sorted.slice(0, PRINT_ALL_MAX), total: sorted.length, truncated: sorted.length > PRINT_ALL_MAX, label: "All records" };
}

// The print page asks the server for only the chosen records (the server does the selecting, so a print of 50
// records does not read the whole table). These are the parts of the address that carry the choice.
export const printRequestParams = (params: URLSearchParams) => {
  const out: Record<string, string> = { print: "1" };
  for (const key of ["id", "from", "to", "last"]) {
    const value = wholeNumber(params.get(key));
    if (value !== null) out[key] = String(value);
  }
  return out;
};

// The line under the heading of the paper, which says what was chosen
export function describePrintSelection(params: URLSearchParams, shown: number, codeWord = "Codes") {
  const id = wholeNumber(params.get("id"));
  if (id !== null) return `Record ${id}`;
  const from = wholeNumber(params.get("from"));
  const to = wholeNumber(params.get("to"));
  if (from !== null && to !== null) return `${codeWord} ${from} to ${to}`;
  const last = wholeNumber(params.get("last"));
  if (last !== null && last > 0) return `Last ${shown} records`;
  return "All records";
}
