"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import {
  PRINT_ALL_MAX,
  PRINT_LAST_CHOICES,
  selectionToQuery,
  type PrintSelection,
} from "@/lib/printSelection";

type Mode = "record" | "all" | "range" | "last";

interface PrintOptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** What is printed, for the heading: "Inventory" */
  entityName: string;
  /** The address of the print page, e.g. /print/inventory */
  printPath: string;
  /** The code of the saved record that is open on the screen, or null (a new record is not saved yet) */
  recordId: string | number | null;
  /** The highest code that exists, used to check the range (optional) */
  maxCode?: number;
  /** How many records exist, shown for "All records" (optional) */
  totalCount?: number;
}

const digits = (value: string) => /^\d*$/.test(value);

// "What do you want to print?" One choice is selected; the boxes of the other choices are switched off, so the
// dialog always shows exactly what will be printed. The Print button works only when the choice is valid.
export function PrintOptionsModal({ isOpen, onClose, entityName, printPath, recordId, maxCode, totalCount }: PrintOptionsModalProps) {
  const hasRecord = recordId !== null && recordId !== undefined && String(recordId) !== "";

  const [mode, setMode] = useState<Mode>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [lastChoice, setLastChoice] = useState<string>(String(PRINT_LAST_CHOICES[0]));
  const [customLast, setCustomLast] = useState("");
  const [touched, setTouched] = useState({ from: false, to: false, custom: false });
  const [tried, setTried] = useState(false);

  const fromRef = useRef<HTMLInputElement>(null);
  const customRef = useRef<HTMLInputElement>(null);

  // Every time the dialog opens it starts fresh: the open record is the first choice, otherwise all of them
  useEffect(() => {
    if (!isOpen) return;
    setMode(hasRecord ? "record" : "all");
    setFrom("");
    setTo("");
    setLastChoice(String(PRINT_LAST_CHOICES[0]));
    setCustomLast("");
    setTouched({ from: false, to: false, custom: false });
    setTried(false);
  }, [isOpen, hasRecord]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  // Choosing a choice puts the cursor in its first box
  const choose = (next: Mode) => {
    setMode(next);
    if (next === "range") setTimeout(() => fromRef.current?.focus(), 0);
    if (next === "last" && lastChoice === "custom") setTimeout(() => customRef.current?.focus(), 0);
  };

  // The problems of the selected choice only (the other choices are switched off, they cannot be wrong)
  const errors = useMemo(() => {
    const found: { from?: string; to?: string; custom?: string } = {};
    if (mode === "range") {
      const fromNumber = Number(from);
      const toNumber = Number(to);
      if (from === "") found.from = "Enter the first code";
      else if (fromNumber < 1) found.from = "The code must be 1 or more";
      else if (maxCode && fromNumber > maxCode) found.from = `The highest code is ${maxCode}`;

      if (to === "") found.to = "Enter the last code";
      else if (toNumber < 1) found.to = "The code must be 1 or more";
      else if (maxCode && toNumber > maxCode) found.to = `The highest code is ${maxCode}`;
      else if (!found.from && fromNumber > toNumber) found.to = "The last code cannot be less than the first";
      else if (!found.from && toNumber - fromNumber + 1 > PRINT_ALL_MAX) {
        found.to = `A range can hold ${PRINT_ALL_MAX.toLocaleString()} records at most`;
      }
    }
    if (mode === "last" && lastChoice === "custom") {
      const count = Number(customLast);
      if (customLast === "") found.custom = "Enter how many records";
      else if (count < 1) found.custom = "Enter 1 or more";
      else if (count > PRINT_ALL_MAX) found.custom = `${PRINT_ALL_MAX.toLocaleString()} records at most`;
    }
    return found;
  }, [mode, from, to, lastChoice, customLast, maxCode]);

  const isValid = Object.keys(errors).length === 0;

  const selection: PrintSelection | null = useMemo(() => {
    if (!isValid) return null;
    if (mode === "record") return { mode: "record", id: Number(recordId) };
    if (mode === "range") return { mode: "range", from: Number(from), to: Number(to) };
    if (mode === "last") return { mode: "last", count: Number(lastChoice === "custom" ? customLast : lastChoice) };
    return { mode: "all" };
  }, [isValid, mode, recordId, from, to, lastChoice, customLast]);

  // What will be printed, in words
  const summary = (() => {
    if (!selection) return "";
    if (selection.mode === "record") return `Record ${selection.id} only`;
    if (selection.mode === "range") return `Codes ${selection.from} to ${selection.to}`;
    if (selection.mode === "last") return `The last ${selection.count} records`;
    return totalCount ? `All ${totalCount.toLocaleString()} records` : "All records";
  })();

  const handlePrint = () => {
    setTried(true);
    if (!selection) {
      // show the problems and put the cursor on the first wrong box
      setTouched({ from: true, to: true, custom: true });
      if (errors.from || errors.to) fromRef.current?.focus();
      else if (errors.custom) customRef.current?.focus();
      return;
    }
    const query = selectionToQuery(selection);
    window.open(query ? `${printPath}?${query}` : printPath, "_blank");
    onClose();
  };

  if (!isOpen) return null;

  const showError = (field: "from" | "to" | "custom") => (touched[field] || tried) && errors[field];

  const optionClass = (active: boolean, disabled = false) =>
    cn(
      "flex items-start gap-3 rounded-md border px-3 py-2.5 transition-colors",
      disabled ? "cursor-not-allowed border-zinc-200 bg-zinc-50 opacity-60" : "cursor-pointer",
      !disabled && (active ? "border-primary-500 bg-primary-50" : "border-zinc-300 bg-white hover:bg-zinc-50")
    );
  const boxClass = (invalid: boolean) =>
    cn(
      "w-24 rounded-md border bg-white px-2 py-1 text-sm text-zinc-900 outline-none transition-colors focus:border-primary-400 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400",
      invalid ? "border-red-400" : "border-zinc-300"
    );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label={`Print ${entityName}`}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          handlePrint();
        }}
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
      >
        <h2 className="text-lg font-semibold text-zinc-900">Print {entityName}</h2>
        <p className="mt-1 text-sm text-zinc-500">Choose what to print.</p>

        <div className="mt-4 space-y-2">
          {/* 1. This record */}
          <label className={optionClass(mode === "record", !hasRecord)}>
            <input type="radio" name="print-mode" className="mt-1 accent-primary-600" checked={mode === "record"} disabled={!hasRecord} onChange={() => choose("record")} />
            <span>
              <span className="block text-sm font-medium text-zinc-900">{hasRecord ? `This record (code ${recordId})` : "This record"}</span>
              <span className="block text-xs text-zinc-500">{hasRecord ? "Only the record that is open now." : "Open a saved record first to use this."}</span>
            </span>
          </label>

          {/* 2. All records */}
          <label className={optionClass(mode === "all")}>
            <input type="radio" name="print-mode" className="mt-1 accent-primary-600" checked={mode === "all"} onChange={() => choose("all")} />
            <span>
              <span className="block text-sm font-medium text-zinc-900">All records</span>
              <span className="block text-xs text-zinc-500">
                {totalCount ? `${totalCount.toLocaleString()} records. ` : ""}The most that one print holds is {PRINT_ALL_MAX.toLocaleString()}.
              </span>
            </span>
          </label>

          {/* 3. A range of codes */}
          <div className={optionClass(mode === "range")} onClick={() => mode !== "range" && choose("range")}>
            <input type="radio" name="print-mode" aria-label="A range of codes" className="mt-1 accent-primary-600" checked={mode === "range"} onChange={() => choose("range")} />
            <div className="flex-1">
              <span className="block text-sm font-medium text-zinc-900">A range of codes</span>
              <fieldset disabled={mode !== "range"} className="mt-1.5 flex items-start gap-2 text-sm text-zinc-600">
                <div>
                  <input
                    ref={fromRef}
                    className={boxClass(Boolean(showError("from")))}
                    inputMode="numeric"
                    placeholder="From"
                    aria-label="From code"
                    aria-invalid={Boolean(showError("from"))}
                    value={from}
                    maxLength={9}
                    onChange={(event) => digits(event.target.value) && setFrom(event.target.value)}
                    onBlur={() => setTouched((t) => ({ ...t, from: true }))}
                  />
                  {showError("from") && <p className="mt-0.5 w-28 text-xs text-red-500">{errors.from}</p>}
                </div>
                <span className="pt-1">to</span>
                <div>
                  <input
                    className={boxClass(Boolean(showError("to")))}
                    inputMode="numeric"
                    placeholder="To"
                    aria-label="To code"
                    aria-invalid={Boolean(showError("to"))}
                    value={to}
                    maxLength={9}
                    onChange={(event) => digits(event.target.value) && setTo(event.target.value)}
                    onBlur={() => setTouched((t) => ({ ...t, to: true }))}
                  />
                  {showError("to") && <p className="mt-0.5 w-32 text-xs text-red-500">{errors.to}</p>}
                </div>
              </fieldset>
            </div>
          </div>

          {/* 4. The last records */}
          <div className={optionClass(mode === "last")} onClick={() => mode !== "last" && choose("last")}>
            <input type="radio" name="print-mode" aria-label="The last records" className="mt-1 accent-primary-600" checked={mode === "last"} onChange={() => choose("last")} />
            <div className="flex-1">
              <span className="block text-sm font-medium text-zinc-900">The last records</span>
              <fieldset disabled={mode !== "last"} className="mt-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  {[...PRINT_LAST_CHOICES.map(String), "custom"].map((choice) => (
                    <button
                      key={choice}
                      type="button"
                      onClick={() => {
                        setLastChoice(choice);
                        if (choice === "custom") setTimeout(() => customRef.current?.focus(), 0);
                      }}
                      className={cn(
                        "rounded-full border px-3 py-0.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                        lastChoice === choice ? "border-primary-500 bg-primary-500 text-white" : "border-zinc-300 bg-white text-zinc-700 hover:bg-primary-50"
                      )}
                    >
                      {choice === "custom" ? "Other" : choice}
                    </button>
                  ))}
                  {lastChoice === "custom" && (
                    <input
                      ref={customRef}
                      className={boxClass(Boolean(showError("custom")))}
                      inputMode="numeric"
                      placeholder="How many"
                      aria-label="How many records"
                      aria-invalid={Boolean(showError("custom"))}
                      value={customLast}
                      maxLength={5}
                      onChange={(event) => digits(event.target.value) && setCustomLast(event.target.value)}
                      onBlur={() => setTouched((t) => ({ ...t, custom: true }))}
                    />
                  )}
                </div>
                {showError("custom") && <p className="mt-0.5 text-xs text-red-500">{errors.custom}</p>}
              </fieldset>
            </div>
          </div>
        </div>

        <p className={cn("mt-4 min-h-5 text-sm", isValid ? "text-zinc-600" : "text-zinc-400")}>
          {isValid ? (
            <>Will print: <span className="font-semibold text-zinc-900">{summary}</span></>
          ) : mode === "range" ? (
            "Enter the first and the last code to continue."
          ) : (
            "Enter how many records to continue."
          )}
        </p>

        <div className="mt-3 flex justify-end gap-2">
          <Button type="button" variant="secondary" shape="rounded" onClick={onClose} className="border border-zinc-400 bg-white px-6 hover:bg-zinc-50">
            Cancel
          </Button>
          <Button type="submit" shape="rounded" disabled={!isValid} className="px-8">
            Print
          </Button>
        </div>
      </form>
    </div>
  );
}
