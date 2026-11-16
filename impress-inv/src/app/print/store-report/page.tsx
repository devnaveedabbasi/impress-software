"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { usePermissions } from "@/hooks/usePermissions";
import { usePrintReport } from "@/hooks/usePrintReport";
import { PrintStatus } from "@/components/print/PrintStatus";
import { GroupedReportTables } from "@/components/reports/GroupedReportTables";
import { cn } from "@/lib/utils";
import { PRINT_MAX_ROWS, buildFilterParams, findStoreReport, type StoreReportRow, type StoreReportTotals } from "@/lib/storeReports";

// Prints any Store report (Stock Register, Stock Ledger, Shortage, Issue): ?report=<key>&<the filters>
function StoreReportPrint() {
    const searchParams = useSearchParams();
    const { hasPermission } = usePermissions();

    const def = findStoreReport(searchParams.get("report"));
    const canView = def ? hasPermission(def.operation, "view") : false;

    const filterValues = useMemo(() => {
        const values: Record<string, string> = {};
        if (def) for (const filter of def.filters) values[filter.key] = searchParams.get(filter.key) ?? "";
        return values;
    }, [def, searchParams]);

    const reportParams = useMemo(() => (def ? buildFilterParams(def, filterValues).toString() : ""), [def, filterValues]);

    const { rows, total, truncated, meta, state, errorMessage, retry } = usePrintReport<StoreReportRow>({
        url: def?.endpoint ?? "",
        params: reportParams,
        canView: Boolean(def) && canView,
        maxRows: PRINT_MAX_ROWS,
    });

    if (!def) {
        return <p className="p-8 text-center text-sm text-red-500">This report is not valid.</p>;
    }
    if (state !== "ready") {
        return <PrintStatus state={state} message={errorMessage} onRetry={retry} />;
    }

    // The filters that were used, in words (only the ones that can be shown without looking up names)
    const used: string[] = [];
    for (const filter of def.filters) {
        const value = filterValues[filter.key];
        if (!value || value === "all") continue;
        if (filter.type === "date" || filter.type === "number" || filter.type === "text") used.push(`${filter.label}: ${value}`);
        else if (filter.options) {
            const label = filter.options.find((option) => option.value === value)?.label;
            if (label) used.push(`${filter.label}: ${label}`);
        }
    }
    const summary = meta?.totals ? def.summary(meta.totals as StoreReportTotals) : [];

    return (
        <div className="min-h-screen w-full bg-white p-8 text-black">
            <div className="mb-5 text-center">
                <h2 className="text-2xl font-bold uppercase tracking-wider">{def.title}</h2>
                {used.length > 0 && <p className="mt-2 text-[13px] font-semibold">{used.join("  |  ")}</p>}
            </div>

            {summary.length > 0 && (
                <p className="mb-3 text-center text-[13px] font-semibold">
                    {summary.map(([label, value]) => `${label}: ${value.toLocaleString()}`).join("  |  ")}
                </p>
            )}

            {truncated && (
                <p className="mb-4 border border-zinc-400 bg-form-bg p-2 text-center text-[13px]">
                    Showing the first {rows.length.toLocaleString()} of {total.toLocaleString()} rows. Narrow the filters to print everything.
                </p>
            )}

            {def.grouped ? (
                <GroupedReportTables variant="print" rows={rows} columns={def.columns} emptyText={def.emptyText} by={def.grouped} />
            ) : (
            <table className="w-full border-collapse border border-zinc-400 bg-white">
                <thead>
                    <tr className="bg-[#e4e4e4] text-[13px]">
                        {def.columns.map((column) => (
                            <th
                                key={column.header}
                                className={cn(
                                    "border border-zinc-400 p-2",
                                    column.align === "center" ? "text-center" : column.align === "right" ? "text-right" : "text-left"
                                )}
                            >
                                {column.header}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.length === 0 ? (
                        <tr>
                            <td colSpan={def.columns.length} className="py-4 text-center text-[13px]">
                                {def.emptyText}
                            </td>
                        </tr>
                    ) : (
                        rows.map((row, index) => (
                            <tr key={index} className="text-[13px]">
                                {def.columns.map((column) => (
                                    <td
                                        key={column.header}
                                        className={cn(
                                            "border border-zinc-400 p-1 px-2",
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
            )}
        </div>
    );
}

export default function StoreReportPrintPage() {
    return (
        <Suspense fallback={null}>
            <StoreReportPrint />
        </Suspense>
    );
}
