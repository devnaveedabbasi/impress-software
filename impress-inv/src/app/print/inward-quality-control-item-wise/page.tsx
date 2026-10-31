"use client";

import { useEffect, useState } from "react";
import React from "react";
import api from "@/lib/axios";
import { VENDORS, INWARDS } from "@/utlis/apiRoutes";
import toast from "react-hot-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { useSearchParams } from "next/navigation";

export default function InwardItemWiseReportPrintPage() {
    const searchParams = useSearchParams();
    const { hasPermission } = usePermissions();
    const canView = hasPermission("inward_quality_control_report", "view");

    const [vendors, setVendors] = useState<{ label: string; value: string }[]>([]);
    const [reportData, setReportData] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

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

    useEffect(() => {
        const fetchReport = async () => {
            if (!canView) {
                toast.error("You do not have permission to view this report.");
                setIsLoading(false);
                return;
            }

            try {
                const params = new URLSearchParams();
                if (vendorId) params.append("vendorId", vendorId);
                if (fromDate) params.append("fromDate", fromDate);
                if (toDate) params.append("toDate", toDate);
                if (itemName) params.append("itemName", itemName);
                if (status) params.append("status", status);

                const { data } = await api.get(`${INWARDS}/report?${params.toString()}`);
                setReportData(data.data || []);
            } catch (error: any) {
                if (error.response?.status === 403) {
                    toast.error(error.response?.data?.message || "Access denied.");
                } else {
                    toast.error("Failed to fetch report data");
                }
            } finally {
                setIsLoading(false);
                setTimeout(() => window.print(), 500);
            }
        };

        fetchReport();
    }, [vendorId, fromDate, toDate, itemName, status, canView]);

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

    if (isLoading) {
        return <div className="p-10 text-center text-black">Loading report data...</div>;
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
