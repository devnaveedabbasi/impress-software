"use client";

import { useEffect, useState } from "react";
import React from "react";
import api from "@/lib/axios";
import { VENDORS, INWARDS } from "@/utlis/apiRoutes";
import toast from "react-hot-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { useSearchParams } from "next/navigation";

export default function InwardQualityControlPrintPage() {
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
                // Give React a moment to render before calling print
                setTimeout(() => window.print(), 500);
            }
        };

        fetchReport();
    }, [vendorId, fromDate, toDate, itemName, status, canView]);

    const renderTableContent = () => {
        if (reportData.length === 0) {
            return <tr><td colSpan={8} className="text-center py-4 text-[13px] text-black">No records found</td></tr>;
        }

        if (vendorId) {
            const groupedByPo = reportData.reduce((acc: any, row: any) => {
                const key = row.poNo || "Unknown PO";
                if (!acc[key]) acc[key] = [];
                acc[key].push(row);
                return acc;
            }, {});

            const selectedVendorName = vendors.find(v => v.value === vendorId)?.label;

            return (
                <>
                    {Object.keys(groupedByPo).map(poNo => (
                        <React.Fragment key={`po-${poNo}`}>
                            <tr className="bg-[#e4e4e4]">
                                <td colSpan={8} className="font-semibold py-1 px-2 border border-zinc-400 text-black text-[14px]">PO No: {poNo}</td>
                            </tr>
                            {groupedByPo[poNo].map((row: any, idx: number) => (
                                <tr key={`row-${idx}`} className="text-[13px] text-black">
                                    <td className="border border-zinc-400 p-1 text-center">{row.grirNo}</td>
                                    <td className="border border-zinc-400 p-1 text-center">{new Date(row.date).toLocaleDateString()}</td>
                                    <td className="border border-zinc-400 p-1 text-center">{row.billNo || '-'}</td>
                                    <td className="border border-zinc-400 p-1 text-center">{row.dcNo}</td>
                                    <td className="border border-zinc-400 p-1 pl-2">{row.itemName}</td>
                                    <td className="border border-zinc-400 p-1 text-center">{row.recQty}</td>
                                    <td className="border border-zinc-400 p-1 text-center">{row.okQty}</td>
                                    <td className="border border-zinc-400 p-1 text-center">{row.rejQty}</td>
                                </tr>
                            ))}
                        </React.Fragment>
                    ))}
                </>
            );
        } else {
            const groupedByDate = reportData.reduce((acc: any, row: any) => {
                const dateKey = new Date(row.date).toLocaleDateString();
                if (!acc[dateKey]) acc[dateKey] = [];
                acc[dateKey].push(row);
                return acc;
            }, {});

            return Object.keys(groupedByDate).map(date => (
                <React.Fragment key={`date-${date}`}>
                    <tr className="bg-[#e4e4e4]">
                        <td colSpan={8} className="font-bold py-1 px-2 border border-zinc-400 text-black text-[14px]">{date}</td>
                    </tr>
                    {groupedByDate[date].map((row: any, idx: number) => (
                        <tr key={`row-${date}-${idx}`} className="text-[13px] text-black">
                            <td className="border border-zinc-400 p-1 text-center">{row.grirNo}</td>
                            <td className="border border-zinc-400 p-1 pl-2 truncate max-w-[150px]" title={row.vendorName}>{row.vendorName}</td>
                            <td className="border border-zinc-400 p-1 text-center">{row.billNo || '-'}</td>
                            <td className="border border-zinc-400 p-1 text-center">{row.dcNo}</td>
                            <td className="border border-zinc-400 p-1 pl-2">{row.itemName}</td>
                            <td className="border border-zinc-400 p-1 text-center">{row.recQty}</td>
                            <td className="border border-zinc-400 p-1 text-center">{row.okQty}</td>
                            <td className="border border-zinc-400 p-1 text-center">{row.rejQty}</td>
                        </tr>
                    ))}
                </React.Fragment>
            ));
        }
    };

    if (isLoading) {
        return <div className="p-10 text-center text-black">Loading report data...</div>;
    }

    return (
        <div className="p-8 bg-white min-h-screen text-black w-full">
            <div className="text-center mb-6">
                <h2 className="text-2xl font-bold uppercase tracking-wider text-black">{vendorId ? 'Vendor-wise Q.C Report' : 'Q.C Report'}</h2>
                {vendorId && (
                    <p className="text-lg font-bold mt-2 text-black uppercase">
                        Vendor Name: {vendors.find(v => v.value === vendorId)?.label}
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

            <table className="w-full border-collapse border border-zinc-400 bg-white text-black">
                <thead>
                    <tr className="bg-[#e4e4e4] text-[13px] text-black">
                        <th className="border border-zinc-400 p-2 text-center w-16">Gr#</th>
                        <th className="border border-zinc-400 p-2 text-left">{vendorId ? 'Date' : 'Vendor Name'}</th>
                        <th className="border border-zinc-400 p-2 text-center w-20">Bill No</th>
                        <th className="border border-zinc-400 p-2 text-center w-20">D.C No</th>
                        <th className="border border-zinc-400 p-2 text-left">Item Name</th>
                        <th className="border border-zinc-400 p-2 text-center w-16">Recvd</th>
                        <th className="border border-zinc-400 p-2 text-center w-16">OK</th>
                        <th className="border border-zinc-400 p-2 text-center w-16">Rej</th>
                    </tr>
                </thead>
                <tbody>
                    {renderTableContent()}
                </tbody>
            </table>
        </div>
    );
}
