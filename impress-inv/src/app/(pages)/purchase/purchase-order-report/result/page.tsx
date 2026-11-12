"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import api from "@/lib/axios";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";
import type { ReportRow } from "@/lib/inwardReport";
import {
    DEFAULT_PAGE_SIZE,
    PAGE_SIZES,
    PO_REPORT_PATH,
    PO_REPORT_PRINT_MAX,
    columnsFor,
    findPoTab,
    formatNumber,
    rowsLabel,
} from "@/lib/purchaseOrderReport";

type PoReportMeta = {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    totals?: { total: number; grandTotal: number };
};

// The report itself, on its own page. The filters come from the address (?tab=vendor&vendorId=3&...),
// so the page can be refreshed or bookmarked and "Change filters" returns to the same choices.
function PurchaseOrderReportResult() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { hasPermission } = usePermissions();
    const canView = hasPermission("purchase_order", "view");

    const tab = findPoTab(searchParams.get("tab"));
    const missing = tab ? tab.required.filter((field) => !searchParams.get(field)) : [];
    const requestedLimit = Number(searchParams.get("limit"));
    const limit = PAGE_SIZES.includes(requestedLimit) ? requestedLimit : DEFAULT_PAGE_SIZE;
    const requestedPage = Math.floor(Number(searchParams.get("page")));
    const page = requestedPage >= 1 ? requestedPage : 1;

    // Only the filters of this report (no page / limit)
    const filterParams = useMemo(() => {
        const params = new URLSearchParams();
        if (tab) {
            for (const field of tab.fields) {
                const value = searchParams.get(field);
                if (value) params.set(field, value);
            }
        }
        return params.toString();
    }, [searchParams, tab]);

    const [rows, setRows] = useState<ReportRow[]>([]);
    const [meta, setMeta] = useState<PoReportMeta | null>(null);
    const [isFetching, setIsFetching] = useState(true);
    const [fetchError, setFetchError] = useState("");
    const [reloadKey, setReloadKey] = useState(0);
    const requestRef = useRef(0);

    // Load one page. Only the latest request may update the screen.
    useEffect(() => {
        if (!tab || missing.length > 0 || !canView) {
            setIsFetching(false);
            return;
        }

        const requestId = ++requestRef.current;
        const load = async () => {
            setIsFetching(true);
            setFetchError("");
            try {
                const params = new URLSearchParams(filterParams);
                params.set("page", String(page));
                params.set("limit", String(limit));
                const { data } = await api.get(`${tab.dataPath}?${params.toString()}`);
                if (requestId !== requestRef.current) return;
                setRows(data.data || []);
                setMeta((data.meta as PoReportMeta) ?? null);
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

        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab?.key, filterParams, page, limit, canView, reloadKey]);

    const backToFilters = `${PO_REPORT_PATH}?tab=${tab?.key ?? "date"}${filterParams ? `&${filterParams}` : ""}`;

    const goTo = (changes: Record<string, string>) => {
        const params = new URLSearchParams(searchParams.toString());
        for (const [key, value] of Object.entries(changes)) params.set(key, value);
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    };

    // The report is not valid (wrong address or a required filter is missing): send the user back, never to a blank page
    if (!tab || missing.length > 0) {
        return (
            <div className="w-full max-w-md self-center rounded-lg bg-white p-8 text-center shadow-xl">
                <h1 className="text-xl font-semibold text-zinc-900">Report is not complete</h1>
                <p className="mt-2 text-sm text-zinc-600">
                    {tab
                        ? "Some required filters are missing. Please choose them and run the report again."
                        : "This report address is not valid. Please choose a report."}
                </p>
                <Link
                    href={tab ? backToFilters : PO_REPORT_PATH}
                    className="mt-6 inline-flex items-center justify-center rounded-md bg-primary-500 px-6 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-600"
                >
                    Back to filters
                </Link>
            </div>
        );
    }

    const columns = columnsFor(tab.key);
    const total = meta?.total ?? 0;
    const totalPages = meta?.totalPages ?? 1;
    const from = total === 0 ? 0 : (page - 1) * limit + 1;
    const to = Math.min(page * limit, total);
    const unitLabel = tab.key === "item" ? "purchase orders with this item" : "purchase orders";

    // Filters used, shown as small tags under the title
    const tags: string[] = [];
    for (const field of tab.fields) {
        const value = searchParams.get(field);
        if (!value) continue;
        if (field === "vendorId") tags.push(`Vendor: ${rows[0]?.vendorName ?? `#${value}`}`);
        else if (field === "itemName") tags.push(`Item: ${value}`);
        else if (field === "fromDate") tags.push(`From ${value}`);
        else if (field === "toDate") tags.push(`To ${value}`);
    }

    return (
        <section className="w-full bg-white p-4 shadow-xl sm:p-6" aria-live="polite">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold text-zinc-900 sm:text-2xl">Purchase Order {tab.label} Report</h1>
                    <p className="mt-1 text-xs text-zinc-500">
                        {isFetching && rows.length === 0
                            ? "Loading..."
                            : total === 0
                              ? "No records"
                              : `Showing ${from.toLocaleString()}-${to.toLocaleString()} of ${total.toLocaleString()} ${unitLabel}`}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {(tags.length > 0 ? tags : ["All records"]).map((tag) => (
                            <span key={tag} className="rounded-full bg-primary-50 px-2.5 py-0.5 text-xs text-primary-800">
                                {tag}
                            </span>
                        ))}
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    <Link
                        href={backToFilters}
                        className="inline-flex items-center justify-center rounded-md border border-zinc-400 bg-white px-5 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50"
                    >
                        Change filters
                    </Link>
                    <Button
                        type="button"
                        shape="rounded"
                        onClick={() => window.open(`${tab.printPath}?tab=${tab.key}&${filterParams}`, "_blank")}
                        disabled={isFetching || total === 0}
                        className="px-8"
                    >
                        Print
                    </Button>
                </div>
            </div>

            {!canView ? (
                <p className="py-10 text-center text-sm text-red-500">You do not have permission to view this report.</p>
            ) : (
                <>
                    {total > PO_REPORT_PRINT_MAX && (
                        <p className="mb-3 rounded-md border border-zinc-200 bg-form-bg px-3 py-2 text-xs text-zinc-600">
                            There are {total.toLocaleString()} {rowsLabel(tab.key)}. Printing is limited to the first{" "}
                            {PO_REPORT_PRINT_MAX.toLocaleString()}, narrow the dates, vendor or item to print everything.
                        </p>
                    )}

                    {meta?.totals && total > 0 && (
                        <div className="mb-4 grid grid-cols-2 gap-2 text-center">
                            {[
                                ["Total", meta.totals.total],
                                ["Grand Total", meta.totals.grandTotal],
                            ].map(([label, value]) => (
                                <div key={label} className="rounded-md border border-zinc-200 bg-form-bg px-2 py-2">
                                    <div className="text-xs text-zinc-500">{label} (all pages)</div>
                                    <div className="text-base font-semibold text-zinc-900">{formatNumber(value)}</div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="overflow-x-auto border border-zinc-300">
                        <table className="w-full min-w-160 border-collapse text-left text-sm text-zinc-900">
                            <thead className="bg-zinc-100 text-zinc-700">
                                <tr>
                                    {columns.map((column) => (
                                        <th
                                            key={column.header}
                                            className={cn(
                                                "border-b border-zinc-300 px-3 py-2 font-semibold",
                                                column.align === "center" && "text-center"
                                            )}
                                        >
                                            {column.header}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className={cn(isFetching && rows.length > 0 && "opacity-50")}>
                                {isFetching && rows.length === 0 ? (
                                    Array.from({ length: 8 }).map((_, rowIndex) => (
                                        <tr key={rowIndex}>
                                            {columns.map((column) => (
                                                <td key={column.header} className="border-b border-zinc-100 px-3 py-3">
                                                    <span className="block h-4 animate-pulse rounded bg-zinc-200" />
                                                </td>
                                            ))}
                                        </tr>
                                    ))
                                ) : fetchError ? (
                                    <tr>
                                        <td colSpan={columns.length} className="px-3 py-10 text-center text-sm text-red-500">
                                            {fetchError}{" "}
                                            <button
                                                type="button"
                                                onClick={() => setReloadKey((key) => key + 1)}
                                                className="font-medium underline"
                                            >
                                                Retry
                                            </button>
                                        </td>
                                    </tr>
                                ) : rows.length === 0 ? (
                                    <tr>
                                        <td colSpan={columns.length} className="px-3 py-10 text-center text-sm text-zinc-500">
                                            No records found for these filters.{" "}
                                            <Link href={backToFilters} className="font-medium text-primary-700 underline">
                                                Change filters
                                            </Link>
                                        </td>
                                    </tr>
                                ) : (
                                    rows.map((row, rowIndex) => (
                                        <tr key={rowIndex} className="hover:bg-primary-50">
                                            {columns.map((column) => (
                                                <td
                                                    key={column.header}
                                                    className={cn(
                                                        "border-b border-zinc-100 px-3 py-2",
                                                        column.align === "center" && "text-center"
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

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                        <label className="flex items-center gap-2 text-xs text-zinc-600">
                            Rows per page
                            <select
                                value={limit}
                                onChange={(event) => goTo({ limit: event.target.value, page: "1" })}
                                className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 outline-none focus:border-primary-400"
                            >
                                {PAGE_SIZES.map((size) => (
                                    <option key={size} value={size}>
                                        {size}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                shape="rounded"
                                onClick={() => goTo({ page: String(Math.max(1, page - 1)) })}
                                disabled={isFetching || page <= 1}
                            >
                                Previous
                            </Button>
                            <span className="min-w-24 text-center text-xs text-zinc-600">
                                Page {page.toLocaleString()} / {totalPages.toLocaleString()}
                            </span>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                shape="rounded"
                                onClick={() => goTo({ page: String(Math.min(totalPages, page + 1)) })}
                                disabled={isFetching || page >= totalPages}
                            >
                                Next
                            </Button>
                        </div>
                    </div>
                </>
            )}
        </section>
    );
}

export default function PurchaseOrderReportResultPage() {
    return (
        <Suspense fallback={null}>
            <PurchaseOrderReportResult />
        </Suspense>
    );
}
