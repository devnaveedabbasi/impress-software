"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import toast from "react-hot-toast";
import api from "@/lib/axios";
import { Button } from "@/components/ui/Button";
import { LabeledField } from "@/components/ui/LabeledField";
import { LabeledSelect } from "@/components/ui/LabeledSelect";
import { GroupedReportTables } from "@/components/reports/GroupedReportTables";
import { fetchAllReportRows } from "@/lib/reportFetch";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";
import { CATEGORIES, COLORS, DEPARTMENTS, INVENTORY } from "@/utlis/apiRoutes";
import {
  ALL,
  PRINT_MAX_ROWS,
  buildFilterParams,
  initialFilterValues,
  validateFilters,
  type FilterDef,
  type StoreReportDef,
  type StoreReportRow,
  type StoreReportTotals,
} from "@/lib/storeReports";

type Option = { label: string; value: string };
type Meta = { total: number; page: number; limit: number; totalPages: number; totals?: StoreReportTotals };

const PAGE_SIZE = 50;
const fmt = (value: number) => value.toLocaleString();

// Where the options of a "source" select come from
const SOURCES: Record<NonNullable<FilterDef["source"]>, { url: string; label: (item: Record<string, unknown>) => string }> = {
  categories: { url: CATEGORIES, label: (item) => String(item.name ?? "") },
  departments: { url: DEPARTMENTS, label: (item) => String(item.name ?? "") },
  colors: { url: COLORS, label: (item) => String(item.name ?? "") },
  items: { url: INVENTORY, label: (item) => `${item.id} - ${item.itemName}` },
};

// One page for every Store report: the filters on top, then the table (page by page), the totals and Print.
export function StoreReport({ def }: { def: StoreReportDef }) {
  const { hasPermission } = usePermissions();
  const canView = hasPermission(def.operation, "view");

  const [values, setValues] = useState<Record<string, string>>(() => initialFilterValues(def));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [options, setOptions] = useState<Record<string, Option[]>>({});
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);

  const [rows, setRows] = useState<StoreReportRow[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [appliedParams, setAppliedParams] = useState<URLSearchParams | null>(null);
  const [page, setPage] = useState(1);
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const requestRef = useRef(0);

  // The lists behind the select filters (categories, departments, colors, items)
  useEffect(() => {
    const sources = Array.from(new Set(def.filters.map((filter) => filter.source).filter(Boolean))) as NonNullable<FilterDef["source"]>[];
    if (sources.length === 0 || !canView) return;

    let cancelled = false;
    const load = async () => {
      setIsLoadingOptions(true);
      const results = await Promise.allSettled(sources.map((source) => api.get(SOURCES[source].url)));
      if (cancelled) return;
      const next: Record<string, Option[]> = {};
      results.forEach((result, index) => {
        const source = sources[index];
        if (result.status === "fulfilled") {
          next[source] = ((result.value.data.data || []) as Record<string, unknown>[]).map((item) => ({
            label: SOURCES[source].label(item),
            value: String(item.id),
          }));
        } else {
          next[source] = [];
          toast.error(`Failed to load ${source}`);
        }
      });
      setOptions(next);
      setIsLoadingOptions(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [def, canView]);

  const load = async (params: URLSearchParams, nextPage: number) => {
    const requestId = ++requestRef.current;
    setIsFetching(true);
    setFetchError("");
    try {
      // A grouped report (stock position) shows everything at once, in tables per department and category
      if (def.grouped) {
        const result = await fetchAllReportRows<StoreReportRow>(def.endpoint, params, PRINT_MAX_ROWS);
        if (requestId !== requestRef.current) return;
        setRows(result.rows);
        setMeta({
          total: result.total,
          page: 1,
          limit: result.rows.length,
          totalPages: 1,
          totals: result.meta?.totals as unknown as StoreReportTotals | undefined,
        });
        setPage(1);
        return;
      }

      const query = new URLSearchParams(params);
      query.set("page", String(nextPage));
      query.set("limit", String(PAGE_SIZE));
      const { data } = await api.get(`${def.endpoint}?${query.toString()}`);
      if (requestId !== requestRef.current) return;
      setRows(data.data || []);
      setMeta((data.meta as Meta) ?? null);
      setPage(nextPage);
    } catch (error: unknown) {
      if (requestId !== requestRef.current) return;
      const message = (error as { response?: { data?: { message?: string } } }).response?.data?.message;
      setFetchError(message || "Failed to load the report. Please try again.");
      setRows([]);
      setMeta(null);
    } finally {
      if (requestId === requestRef.current) setIsFetching(false);
    }
  };

  const setValue = (key: string, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const found = validateFilters(def, values);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      toast.error("Please fix the highlighted fields");
      return;
    }
    const params = buildFilterParams(def, values);
    setAppliedParams(params);
    void load(params, 1);
  };

  const handleReset = () => {
    setValues(initialFilterValues(def));
    setErrors({});
  };

  const handlePrint = () => {
    if (!appliedParams) return;
    window.open(`/print/store-report?report=${def.key}&${appliedParams.toString()}`, "_blank");
  };

  const renderFilter = (filter: FilterDef) => {
    const error = errors[filter.key] || undefined;
    if (filter.type === "select") {
      const choices = filter.options ?? options[filter.source ?? ""] ?? [];
      const all = filter.allLabel ? [{ label: filter.allLabel, value: ALL }] : [];
      return (
        <LabeledSelect
          key={filter.key}
          label={filter.label}
          options={[...all, ...choices]}
          value={values[filter.key]}
          onChange={(value) => setValue(filter.key, value)}
          error={error}
          disabled={Boolean(filter.source) && isLoadingOptions}
          placeholder={filter.source && isLoadingOptions ? "Loading..." : "Select"}
        />
      );
    }
    return (
      <LabeledField
        key={filter.key}
        type={filter.type === "date" ? "date" : "text"}
        label={filter.required ? `${filter.label} *` : filter.label}
        value={values[filter.key]}
        onChange={(event) => {
          const value = event.target.value;
          if (filter.type === "number" && !/^\d*$/.test(value)) return;
          setValue(filter.key, value);
        }}
        inputMode={filter.type === "number" ? "numeric" : undefined}
        placeholder={filter.placeholder}
        maxLength={filter.type === "number" ? 7 : filter.maxLength}
        max={filter.type === "date" && filter.key === "fromDate" ? values.toDate || undefined : undefined}
        min={filter.type === "date" && filter.key === "toDate" ? values.fromDate || undefined : undefined}
        error={error}
      />
    );
  };

  const total = meta?.total ?? 0;
  const totalPages = meta?.totalPages ?? 1;
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  return (
    <section className="w-full bg-white p-4 shadow-xl sm:p-6" aria-live="polite">
      <h1 className="text-xl font-bold text-zinc-900 sm:text-2xl">{def.title}</h1>
      <p className="mt-1 text-xs text-zinc-500">{def.description}</p>

      {!canView ? (
        <p className="py-10 text-center text-sm text-red-500">You do not have permission to view this report.</p>
      ) : (
        <>
          <form className="mt-4" onSubmit={handleSubmit} noValidate>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{def.filters.map(renderFilter)}</div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Button type="submit" shape="rounded" isLoading={isFetching} disabled={isLoadingOptions} className="px-10">
                Show Report
              </Button>
              <Button
                type="button"
                variant="secondary"
                shape="rounded"
                onClick={handleReset}
                className="border border-zinc-400 bg-white px-8 hover:bg-zinc-50"
              >
                Clear Filters
              </Button>
              <Button
                type="button"
                variant="secondary"
                shape="rounded"
                onClick={handlePrint}
                disabled={isFetching || !meta || total === 0}
                className="border border-zinc-400 bg-white px-8 hover:bg-zinc-50"
              >
                Print
              </Button>
            </div>
          </form>

          {fetchError && (
            <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{fetchError}</p>
          )}

          {meta && (
            <>
              {meta.totals && total > 0 && (
                <div className="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                  {def.summary(meta.totals).map(([label, value]) => (
                    <div key={label} className="rounded-md border border-zinc-200 bg-form-bg px-2 py-2">
                      <div className="text-xs text-zinc-500">{label}</div>
                      <div className="text-base font-semibold text-zinc-900">{fmt(value)}</div>
                    </div>
                  ))}
                </div>
              )}

              {total > PRINT_MAX_ROWS && (
                <p className="mt-3 rounded-md border border-zinc-200 bg-form-bg px-3 py-2 text-xs text-zinc-600">
                  There are {fmt(total)} rows. Printing is limited to the first {fmt(PRINT_MAX_ROWS)}, narrow the filters to print everything.
                </p>
              )}

              <p className="mt-3 text-xs text-zinc-500">
                {total === 0 ? "No records" : def.grouped ? `${fmt(total)} items` : `Showing ${fmt(from)}-${fmt(to)} of ${fmt(total)} rows`}
              </p>

              {def.grouped ? (
                <div className={cn("mt-3", isFetching && "opacity-50")}>
                  <GroupedReportTables rows={rows} columns={def.columns} emptyText={def.emptyText} by={def.grouped} />
                </div>
              ) : (
              <>
              <div className="mt-2 overflow-x-auto border border-zinc-300">
                <table className="w-full min-w-160 border-collapse text-left text-sm text-zinc-900">
                  <thead className="bg-zinc-100 text-zinc-700">
                    <tr>
                      {def.columns.map((column) => (
                        <th
                          key={column.header}
                          className={cn(
                            "border-b border-zinc-300 px-3 py-2 font-semibold",
                            column.align === "center" && "text-center",
                            column.align === "right" && "text-right"
                          )}
                        >
                          {column.header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className={cn(isFetching && "opacity-50")}>
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={def.columns.length} className="px-3 py-10 text-center text-sm text-zinc-500">
                          {def.emptyText}
                        </td>
                      </tr>
                    ) : (
                      rows.map((row, rowIndex) => (
                        <tr key={rowIndex} className="hover:bg-primary-50">
                          {def.columns.map((column) => (
                            <td
                              key={column.header}
                              className={cn(
                                "border-b border-zinc-100 px-3 py-2",
                                column.align === "center" && "text-center",
                                column.align === "right" && "text-right"
                              )}
                            >
                              {column.render(row)}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  shape="rounded"
                  disabled={isFetching || page <= 1}
                  onClick={() => appliedParams && void load(appliedParams, page - 1)}
                >
                  Previous
                </Button>
                <span className="min-w-24 text-center text-xs text-zinc-600">
                  Page {fmt(page)} / {fmt(totalPages)}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  shape="rounded"
                  disabled={isFetching || page >= totalPages}
                  onClick={() => appliedParams && void load(appliedParams, page + 1)}
                >
                  Next
                </Button>
              </div>
              </>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
