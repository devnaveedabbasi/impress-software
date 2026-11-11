"use client";

import { useEffect, useMemo, useState } from "react";
import React from "react";
import api from "@/lib/axios";
import { VENDORS, INWARDS } from "@/utlis/apiRoutes";
import { usePermissions } from "@/hooks/usePermissions";
import { useSearchParams } from "next/navigation";
import { usePrintReport } from "@/hooks/usePrintReport";
import { PrintStatus } from "@/components/print/PrintStatus";

export default function InwardItemWiseReportPrintPage() {
    const searchParams = useSearchParams();
    const { hasPermission } = usePermissions();
    const canView = hasPermission("inward_quality_control_report", "view");

    const [vendors, setVendors] = useState<{ label: string; value: string }[]>([]);

    const vendorId = searchParams.get("vendorId") || "";
    const fromDate = searchParams.get("fromDate") || "";
    const toDate = searchParams.get("toDate") || "";
    const itemName = searchParams.get("itemName") || "";
    const status = searchParams.get("status") || "";

    useEffect(() => {
        const fetchVendors = async () => {
            try {
                const { data } = await api.get(VENDORS);
                if (data.data) {
                    setVendors([
                        { label: "All Vendors", value: "" },
                        ...data.data.map((v: any) => ({ label: v.vendorName, value: String(v.id) }))
                    ]);
                }
            } catch (error) {
                console.error("Failed to load vendors", error);
            }
        };
        fetchVendors();
    }, []);

    // The filters of this report (the same address always gives the same query)
    const reportParams = useMemo(() => {
        const params = new URLSearchParams();
        if (vendorId) params.set("vendorId", vendorId);
        if (fromDate) params.set("fromDate", fromDate);
        if (toDate) params.set("toDate", toDate);
        if (itemName) params.set("itemName", itemName);
        if (status) params.set("status", status);
        return params.toString();
    }, [vendorId, fromDate, toDate, itemName, status]);

    const {
        rows: reportData,
        total: totalRows,
        truncated,
        state: reportState,
        errorMessage,
        retry,
    } = usePrintReport<any>({
        url: `${INWARDS}/report`,
        params: reportParams,
        canView,
    });

    // Group data by item name
    const groupedByItem = reportData.reduce((acc: any, row: any) => {
        const key = row.itemName || "Unknown Item";
        if (!acc[key]) acc[key] = { rows: [], totalRec: 0, totalRej: 0, totalOk: 0 };
        acc[key].rows.push(row);
        acc[key].totalRec += Number(row.recQty) || 0;
        acc[key].totalRej += Number(row.rejQty) || 0;
        acc[key].totalOk += Number(row.okQty) || 0;
        return acc;
    }, {});

    if (reportState !== "ready") {
        return <PrintStatus state={reportState} message={errorMessage} onRetry={retry} />;
    }

    const selectedVendorName = vendorId ? vendors.find(v => v.value === vendorId)?.label : null;

    return (
        <div className="p-8 bg-white min-h-screen text-black w-full">
            <div className="text-center mb-6">
                <h2 className="text-2xl font-bold uppercase tracking-wider text-black">Quality Control Item Wise Report</h2>
                {selectedVendorName && (
                    <p className="text-lg font-bold mt-2 text-black uppercase">
                        Vendor Name: {selectedVendorName}
                    </p>
                )}
                {itemName && (
                    <p className="text-[14px] font-semibold mt-1 text-black uppercase">
                        Item: {itemName}
                    </p>
                )}
                {status && (
                    <p className="text-[14px] font-semibold mt-1 text-black uppercase">
                        Status: {status === "ok" ? "OK Only" : "Rejected Only"}
                    </p>
                )}
                {(fromDate || toDate) && (
                    <p className="text-[14px] font-semibold mt-1 text-black">
                        {fromDate ? `From: ${fromDate}` : ''} {toDate ? `To: ${toDate}` : ''}
                    </p>
                )}
            </div>

            {truncated && (
                <p className="mb-4 border border-zinc-400 bg-form-bg p-2 text-center text-[13px] text-black">
                    Showing the first {reportData.length.toLocaleString()} of {totalRows.toLocaleString()} records.
                    Narrow the filters (dates, vendor, item) to print everything.
                </p>
            )}

            {Object.keys(groupedByItem).length === 0 ? (
                <p className="text-center text-[13px] text-black">No records found</p>
            ) : (
                Object.entries(groupedByItem).map(([itemName, group]: [string, any]) => (
                    <div key={itemName} className="mb-6">
                        <div className="bg-[#e4e4e4] border border-zinc-400 px-3 py-1 font-bold text-[14px] text-black uppercase">
                            {itemName}
                        </div>
                        <table className="w-full border-collapse border border-zinc-400 bg-white text-black">
                            <thead>
                                <tr className="bg-[#e4e4e4] text-[13px] text-black">
                                    <th className="border border-zinc-400 p-2 text-center w-16">Gr#</th>
                                    <th className="border border-zinc-400 p-2 text-center">Date</th>
                                    <th className="border border-zinc-400 p-2 text-left">Vendor Name</th>
                                    <th className="border border-zinc-400 p-2 text-center w-20">PO No</th>
                                    <th className="border border-zinc-400 p-2 text-center w-20">D.C No</th>
                                    <th className="border border-zinc-400 p-2 text-center w-16">Recvd</th>
                                    <th className="border border-zinc-400 p-2 text-center w-16">Rej</th>
                                    <th className="border border-zinc-400 p-2 text-center w-16">OK</th>
                                </tr>
                            </thead>
                            <tbody>
                                {group.rows.map((row: any, idx: number) => (
                                    <tr key={idx} className="text-[13px] text-black">
                                        <td className="border border-zinc-400 p-1 text-center">{row.grirNo}</td>
                                        <td className="border border-zinc-400 p-1 text-center">{new Date(row.date).toLocaleDateString()}</td>
                                        <td className="border border-zinc-400 p-1 pl-2">{row.vendorName}</td>
                                        <td className="border border-zinc-400 p-1 text-center">{row.poNo || '-'}</td>
                                        <td className="border border-zinc-400 p-1 text-center">{row.dcNo}</td>
                                        <td className="border border-zinc-400 p-1 text-center">{row.recQty}</td>
                                        <td className="border border-zinc-400 p-1 text-center">{row.rejQty}</td>
                                        <td className="border border-zinc-400 p-1 text-center">{row.okQty}</td>
                                    </tr>
                                ))}
                                <tr className="text-[13px] font-bold bg-[#e4e4e4] text-black">
                                    <td colSpan={5} className="border border-zinc-400 p-1 text-right pr-3">Total:</td>
                                    <td className="border border-zinc-400 p-1 text-center">{group.totalRec}</td>
                                    <td className="border border-zinc-400 p-1 text-center">{group.totalRej}</td>
                                    <td className="border border-zinc-400 p-1 text-center">{group.totalOk}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                ))
            )}
        </div>
    );
}
