"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import api from "@/lib/axios";
import type { PrintReportState } from "@/hooks/usePrintReport";

const MAX_ATTEMPTS = 3;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type ErrorLike = { response?: { status?: number; data?: { message?: string } } };

// A network problem or a server that is still waking up may be temporary, a 4xx answer (no permission) is final
const isTemporary = (error: unknown) => {
  const status = (error as ErrorLike).response?.status;
  return !status || status >= 500 || status === 408 || status === 429;
};

// Loads the list of a master entry (vendors, dealers, inventory) for its print page and opens the print dialog once
// the data is on screen. A temporary failure is retried by itself; a real failure is shown with a Retry button,
// so the page is never silently empty. The print page also has a Print button, in case the browser blocks the
// automatic print dialog.
export function usePrintableList<T>(apiPath: string, mapRows: (raw: unknown[]) => T[]) {
  const [rows, setRows] = useState<T[]>([]);
  const [state, setState] = useState<PrintReportState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const requestRef = useRef(0);
  const printedKeyRef = useRef("");
  const mapRef = useRef(mapRows);
  mapRef.current = mapRows;

  useEffect(() => {
    const requestId = ++requestRef.current;
    setState("loading");

    const load = async () => {
      for (let attempt = 1; ; attempt++) {
        try {
          // _ts: the printed list must be current, never an answer remembered by the page
          const { data } = await api.get(apiPath, { params: { _ts: Date.now() } });
          if (requestId !== requestRef.current) return;
          setRows(mapRef.current((data.data || []) as unknown[]));
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
  }, [apiPath, reloadKey]);

  // Print once per loaded list, after the browser has drawn the data
  useEffect(() => {
    if (state !== "ready" || rows.length === 0) return;
    const key = `${apiPath}#${reloadKey}`;
    const timer = setTimeout(() => {
      if (printedKeyRef.current === key) return;
      printedKeyRef.current = key;
      window.print();
    }, 600);
    return () => clearTimeout(timer);
  }, [state, rows.length, apiPath, reloadKey]);

  const retry = useCallback(() => setReloadKey((key) => key + 1), []);

  return { rows, state, errorMessage, retry };
}
