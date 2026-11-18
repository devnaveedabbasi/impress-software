"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import api from "@/lib/axios";
import { selectPrintRecords } from "@/lib/printSelection";
import type { PrintReportState } from "@/hooks/usePrintReport";

import { PRINT_KEEP_MS } from "@/lib/printCache";

const MAX_ATTEMPTS = 3;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type ErrorLike = { response?: { status?: number; data?: { message?: string } } };

// A network problem or a server error may be temporary, a 4xx answer (not found, no permission) is final
const isTemporary = (error: unknown) => {
  const status = (error as ErrorLike).response?.status;
  return !status || status >= 500 || status === 408 || status === 429;
};

interface Options {
  /** The address of the documents, e.g. /store-issues */
  basePath: string;
  canView: boolean;
}

// Loads the documents of a slip print page for printing and shows them on the page as a preview;
// the print dialog opens only when the user presses the Print button.
// What is printed comes from the address: ?id=5 (one document) | ?from=10&to=40 | ?last=100 | nothing (all of them).
export function usePrintDocuments<T extends { id: number }>({ basePath, canView }: Options) {
  const searchParams = useSearchParams();
  const query = searchParams.toString();

  const [records, setRecords] = useState<T[]>([]);
  const [label, setLabel] = useState("");
  const [truncated, setTruncated] = useState(false);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState<PrintReportState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const requestRef = useRef(0);
  const queryKey = `${basePath}?${query}#${reloadKey}`;

  useEffect(() => {
    if (!canView) {
      setState("forbidden");
      return;
    }

    const params = new URLSearchParams(query);
    const id = params.get("id");
    const isOne = id !== null && /^\d+$/.test(id);

    const requestId = ++requestRef.current;
    setState("loading");

    const load = async () => {
      for (let attempt = 1; ; attempt++) {
        try {
          // _ts: a printed document must be current, never an answer remembered by the page
          const response = await api.get(isOne ? `${basePath}/${id}` : basePath, {
            // a print tab opened a moment ago re-uses the data; a Retry reads it fresh
            persistMs: attempt === 1 && reloadKey === 0 ? PRINT_KEEP_MS : 0,
          });
          if (requestId !== requestRef.current) return;

          if (isOne) {
            setRecords([response.data.data as T]);
            setTotal(1);
            setTruncated(false);
            setLabel("");
          } else {
            const chosen = selectPrintRecords((response.data.data || []) as T[], params, "Nos.");
            setRecords(chosen.rows);
            setTotal(chosen.total);
            setTruncated(chosen.truncated);
            setLabel(chosen.label);
          }
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
                  "The documents could not be loaded. Please check your connection and try again."
          );
          setState("error");
          return;
        }
      }
    };

    void load();
  }, [basePath, query, canView, reloadKey]);

  const retry = useCallback(() => setReloadKey((key) => key + 1), []);

  return { records, label, truncated, total, state, errorMessage, retry };
}
