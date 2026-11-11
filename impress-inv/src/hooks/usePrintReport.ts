"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAllReportRows } from "@/lib/reportFetch";

export type PrintReportState = "loading" | "ready" | "error" | "forbidden";

const MAX_ATTEMPTS = 3;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type ErrorLike = { response?: { status?: number; data?: { message?: string } } };

// A network problem or a server error may be temporary, a 4xx answer (bad filter, no permission) is final
const isTemporary = (error: unknown) => {
  const status = (error as ErrorLike).response?.status;
  return !status || status >= 500 || status === 408 || status === 429;
};

interface UsePrintReportOptions {
  url: string;
  params: string; // filters only (no page / limit)
  canView: boolean;
  maxRows?: number;
}

// Loads a report for printing, page by page, and opens the print dialog once - only after the data is on screen.
// A temporary failure is retried by itself; a real failure is shown with a Retry button and never prints.
export function usePrintReport<T>({ url, params, canView, maxRows }: UsePrintReportOptions) {
  const [rows, setRows] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [state, setState] = useState<PrintReportState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const requestRef = useRef(0);
  const printedKeyRef = useRef("");

  const queryKey = `${url}?${params}#${reloadKey}`;

  useEffect(() => {
    if (!canView) {
      setState("forbidden");
      return;
    }

    // Only the latest request may update the screen (React can run this effect twice while developing)
    const requestId = ++requestRef.current;
    setState("loading");

    const load = async () => {
      for (let attempt = 1; ; attempt++) {
        try {
          const result = await fetchAllReportRows<T>(url, new URLSearchParams(params), maxRows);
          if (requestId !== requestRef.current) return;
          setRows(result.rows);
          setTotal(result.total);
          setTruncated(result.truncated);
          setState("ready");
          return;
        } catch (error) {
          if (requestId !== requestRef.current) return;
          if (isTemporary(error) && attempt < MAX_ATTEMPTS) {
            await wait(1200 * attempt);
            if (requestId !== requestRef.current) return;
            continue;
          }
          const message = (error as ErrorLike).response?.data?.message;
          setErrorMessage(
            message || "The report could not be loaded. Please check your connection and try again."
          );
          setState("error");
          return;
        }
      }
    };

    void load();
  }, [url, params, canView, maxRows, reloadKey]);

  // Print once per loaded report, after the browser has drawn the data
  useEffect(() => {
    if (state !== "ready") return;
    const timer = setTimeout(() => {
      if (printedKeyRef.current === queryKey) return;
      printedKeyRef.current = queryKey;
      window.print();
    }, 600);
    return () => clearTimeout(timer);
  }, [state, queryKey]);

  const retry = useCallback(() => setReloadKey((key) => key + 1), []);

  return { rows, total, truncated, state, errorMessage, retry };
}
