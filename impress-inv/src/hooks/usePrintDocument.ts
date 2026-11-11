"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import api from "@/lib/axios";
import type { PrintReportState } from "@/hooks/usePrintReport";

const MAX_ATTEMPTS = 3;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type ErrorLike = { response?: { status?: number; data?: { message?: string } } };

// A network problem or a server error may be temporary, a 4xx answer (not found, no permission) is final
const isTemporary = (error: unknown) => {
  const status = (error as ErrorLike).response?.status;
  return !status || status >= 500 || status === 408 || status === 429;
};

// Loads ONE document (for example a gate pass slip) for printing and opens the print dialog once, after it is
// on screen. A temporary failure is retried by itself, a real failure is shown with Retry and never prints.
export function usePrintDocument<T>(url: string | null, canView: boolean) {
  const [data, setData] = useState<T | null>(null);
  const [state, setState] = useState<PrintReportState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const requestRef = useRef(0);
  const printedKeyRef = useRef("");
  const queryKey = `${url}#${reloadKey}`;

  useEffect(() => {
    if (!url) {
      setErrorMessage("No document was selected to print.");
      setState("error");
      return;
    }
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
          const response = await api.get(url);
          if (requestId !== requestRef.current) return;
          setData(response.data.data as T);
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
            status === 404
              ? "This document was not found."
              : (error as ErrorLike).response?.data?.message ||
                  "The document could not be loaded. Please check your connection and try again."
          );
          setState("error");
          return;
        }
      }
    };

    void load();
  }, [url, canView, reloadKey]);

  // Print once per loaded document, after the browser has drawn it
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

  return { data, state, errorMessage, retry };
}
