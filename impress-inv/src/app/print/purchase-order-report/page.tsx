"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import api from "@/lib/axios";
import { VENDORS, PURCHASE_ORDERS } from "@/utlis/apiRoutes";
import { usePermissions } from "@/hooks/usePermissions";
import { usePrintReport } from "@/hooks/usePrintReport";
import { PrintStatus } from "@/components/print/PrintStatus";
import type { ReportRow } from "@/lib/inwardReport";
import { PO_REPORT_PRINT_MAX, columnsFor, findPoTab, formatNumber } from "@/lib/purchaseOrderReport";

// Prints the Purchase Order report of the Date-wise, Vendor-wise and Item-wise tabs.
// (PO Balance has its own print page.)
function PurchaseOrderReportPrint() {
    const searchParams = useSearchParams();
    const { hasPermission } = usePermissions();
    const canView = hasPermission("purchase_order", "view");

    const tab = findPoTab(searchParams.get("tab"));
    const vendorId = searchParams.get("vendorId") || "";
    const fromDate = searchParams.get("fromDate") || "";
    const toDate = searchParams.get("toDate") || "";
    const itemName = searchParams.get("itemName") || "";

    const [vendorName, setVendorName] = useState("");
    useEffect(() => {
        if (!vendorId) return;
        api.get(VENDORS)
            .then(({ data }) => {
                const found = (data.data || []).find((v: { id: number }) => String(v.id) === vendorId);
                setVendorName(found?.vendorName || "");
            })
            .catch(() => undefined);
    }, [vendorId]);

    const reportParams = useMemo(() => {
        const params = new URLSearchParams();
        if (vendorId) params.set("vendorId", vendorId);
        if (fromDate) params.set("fromDate", fromDate);
        if (toDate) params.set("toDate", toDate);
        if (itemName) params.set("itemName", itemName);
        return params.toString();
    }, [vendorId, fromDate, toDate, itemName]);

    const {
        rows,
        total: totalRows,
        truncated,
        state,
        errorMessage,
        retry,
    } = usePrintReport<ReportRow>({
        url: `${PURCHASE_ORDERS}/report`,
        params: reportParams,
        canView,
        maxRows: PO_REPORT_PRINT_MAX,
    });

    if (state !== "ready") {
        return <PrintStatus state={state} message={errorMessage} onRetry={retry} />;
    }

    const key = tab?.key ?? "date";
    const columns = columnsFor(key);
    const sum = (field: string) => rows.reduce((total, row) => total + (Number(row[field]) || 0), 0);

    return (
        <div className="min-h-screen w-full bg-white p-8 text-black">
            <div className="mb-6 text-center">
                <h2 className="text-2xl font-bold uppercase tracking-wider">Purchase Order {tab?.label} Report</h2>
                {vendorName && <p className="mt-2 text-lg font-bold uppercase">Vendor Name: {vendorName}</p>}
                {itemName && <p className="mt-1 text-[14px] font-semibold uppercase">Item: {itemName}</p>}
                {(fromDate || toDate) && (
                    <p className="mt-1 text-[14px] font-semibold">
                        {fromDate ? `From: ${fromDate}` : ""} {toDate ? `To: ${toDate}` : ""}
                    </p>
                )}
            </div>

            {truncated && (
                <p className="mb-4 border border-zinc-400 bg-form-bg p-2 text-center text-[13px]">
                    Showing the first {PO_REPORT_PRINT_MAX.toLocaleString()} of {totalRows.toLocaleString()} purchase
                    orders. Narrow the filters (dates, vendor, item) to print everything.
                </p>
            )}

            <table className="w-full border-collapse border border-zinc-400 bg-white">
                <thead>
                    <tr className="bg-[#e4e4e4] text-[13px]">
                        {columns.map((column) => (
                            <th
                                key={column.header}
                                className={`border border-zinc-400 p-2 ${column.align === "center" ? "text-center" : "text-left"}`}
                            >
                                {column.header}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.length === 0 ? (
                        <tr>
                            <td colSpan={columns.length} className="py-4 text-center text-[13px]">
                                No records found
                            </td>
                        </tr>
                    ) : (
                        rows.map((row, index) => (
                            <tr key={index} className="text-[13px]">
                                {columns.map((column) => (
                                    <td
                                        key={column.header}
                                        className={`border border-zinc-400 p-1 ${column.align === "center" ? "text-center" : "pl-2"}`}
                                    >
                                        {column.render(row)}
                                    </td>
                                ))}
                            </tr>
                        ))
                    )}
                </tbody>
                {rows.length > 0 && (
                    <tfoot>
                        <tr className="bg-[#e4e4e4] text-[13px] font-bold">
                            <td className="border border-zinc-400 p-1 pl-2" colSpan={columns.length - 1}>
                                Total
                            </td>
                            <td className="border border-zinc-400 p-1 text-center">
                                {formatNumber(key === "item" ? sum("amount") : sum("grandTotal"))}
                            </td>
                        </tr>
                    </tfoot>
                )}
            </table>
        </div>
    );
}

export default function PurchaseOrderReportPrintPage() {
    return (
        <Suspense fallback={null}>
            <PurchaseOrderReportPrint />
        </Suspense>
    );
}
