"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import api from "@/lib/axios";
import type { PrintReportState } from "@/hooks/usePrintReport";

import { PRINT_KEEP_MS } from "@/lib/printCache";

const MAX_ATTEMPTS = 3;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type ErrorLike = { response?: { status?: number; data?: { message?: string } } };

// A network problem or a server that is still waking up may be temporary, a 4xx answer (no permission) is final
const isTemporary = (error: unknown) => {
  const status = (error as ErrorLike).response?.status;
  return !status || status >= 500 || status === 408 || status === 429;
};

// Loads the list of a master entry (vendors, dealers, inventory) for its print page and shows it on the page
// as a preview of the paper. The print dialog opens only when the user presses the Print button of the page.
// A temporary failure is retried by itself; a real failure is shown with a Retry button, so the page is never
// silently empty.
export function usePrintableList<T>(
  apiPath: string,
  mapRows: (raw: unknown[]) => T[],
  // what the Print dialog chose (see printRequestParams): the server sends only those records
  selection: Record<string, string> = {}
) {
  const [rows, setRows] = useState<T[]>([]);
  const [meta, setMeta] = useState({ total: 0, truncated: false });
  const selectionKey = JSON.stringify(selection);
  const [state, setState] = useState<PrintReportState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const requestRef = useRef(0);
  const mapRef = useRef(mapRows);
  mapRef.current = mapRows;

  useEffect(() => {
    const requestId = ++requestRef.current;
    setState("loading");

    const load = async () => {
      for (let attempt = 1; ; attempt++) {
        try {
          // _ts: the printed list must be current, never an answer remembered by the page
          // a print tab opened a moment ago (or the same print again) re-uses the list; a Retry reads it fresh
          const { data } = await api.get(apiPath, {
            params: JSON.parse(selectionKey),
            persistMs: attempt === 1 && reloadKey === 0 ? PRINT_KEEP_MS : 0,
          });
          if (requestId !== requestRef.current) return;
          const result = data.data as { items?: unknown[]; total?: number; truncated?: boolean };
          setRows(mapRef.current(result?.items || []));
          setMeta({ total: result?.total ?? 0, truncated: Boolean(result?.truncated) });
          setState("ready");
          return;
        } catch (error) {
          if (requestId !== requestRef.current) return;
          if (isTemporary(error) && attempt < MAX_ATTEMPTS) {
            await wait(1200 * attempt);
            if (requestId !== requestRef.current) return;
            continue;
          }
          const status = (error as ErrorLike).response?.status;
          setErrorMessage(
            (error as ErrorLike).response?.data?.message ||
              "The list could not be loaded. Please check your connection and try again."
          );
          setState(status === 403 ? "forbidden" : "error");
          return;
        }
      }
    };

    void load();
  }, [apiPath, reloadKey, selectionKey]);

  const retry = useCallback(() => setReloadKey((key) => key + 1), []);

  return { rows, total: meta.total, truncated: meta.truncated, state, errorMessage, retry };
}
