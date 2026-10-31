"use client";

import { useEffect, useState } from "react";
import api from "@/lib/axios";
import { VENDORS, PURCHASE_ORDERS } from "@/utlis/apiRoutes";
import toast from "react-hot-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { useSearchParams } from "next/navigation";

export default function PurchaseOrderBalancePrintPage() {
    const searchParams = useSearchParams();
    const { hasPermission } = usePermissions();
    const canView = hasPermission("purchaseOrder", "view");

    const [vendors, setVendors] = useState<{ label: string; value: string }[]>([]);
    const [reportData, setReportData] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const vendorId = searchParams.get("vendorId") || "";
    const fromDate = searchParams.get("fromDate") || "";
    const toDate = searchParams.get("toDate") || "";
    const itemName = searchParams.get("itemName") || "";

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

                const { data } = await api.get(`${PURCHASE_ORDERS}/balance-report?${params.toString()}`);
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
    }, [vendorId, fromDate, toDate, itemName, canView]);

    const groupedByPo = reportData.reduce((acc: any, row: any) => {
        const key = row.poId;
        if (!acc[key]) acc[key] = { vendorName: row.vendorName, date: row.date, rows: [] };
        acc[key].rows.push(row);
        return acc;
    }, {});

    if (isLoading) {
        return <div className="p-10 text-center text-black">Loading report data...</div>;
    }

    const selectedVendorName = vendorId ? vendors.find(v => v.value === vendorId)?.label : null;

    return (
        <div className="p-8 bg-white min-h-screen text-black w-full">
            <div className="text-center mb-6">
                <h2 className="text-2xl font-bold uppercase tracking-wider text-black">Purchase Order Balance Report</h2>
                {selectedVendorName && (
                    <p className="text-lg font-bold mt-2 text-black uppercase">Vendor Name: {selectedVendorName}</p>
                )}
                {itemName && (
                    <p className="text-[14px] font-semibold mt-1 text-black uppercase">Item: {itemName}</p>
                )}
                {(fromDate || toDate) && (
                    <p className="text-[14px] font-semibold mt-1 text-black">
                        {fromDate ? `From: ${fromDate}` : ''} {toDate ? `To: ${toDate}` : ''}
                    </p>
                )}
            </div>

            {Object.keys(groupedByPo).length === 0 ? (
                <p className="text-center text-[13px] text-black">No records found</p>
            ) : (
                Object.entries(groupedByPo).map(([poId, group]: [string, any]) => (
                    <div key={poId} className="mb-6">
                        <div className="bg-[#e4e4e4] border border-zinc-400 px-3 py-1 font-bold text-[14px] text-black flex justify-between">
                            <span>PO No: {poId}</span>
                            <span>{group.vendorName} &middot; {new Date(group.date).toLocaleDateString()}</span>
                        </div>
                        <table className="w-full border-collapse border border-zinc-400 bg-white text-black">
                            <thead>
                                <tr className="bg-[#e4e4e4] text-[13px] text-black">
                                    <th className="border border-zinc-400 p-2 text-left">Item Name</th>
                                    <th className="border border-zinc-400 p-2 text-center w-24">Ordered</th>
                                    <th className="border border-zinc-400 p-2 text-center w-24">Received</th>
                                    <th className="border border-zinc-400 p-2 text-center w-24">Balance</th>
                                </tr>
                            </thead>
                            <tbody>
                                {group.rows.map((row: any, idx: number) => (
                                    <tr key={idx} className="text-[13px] text-black">
                                        <td className="border border-zinc-400 p-1 pl-2">{row.itemName}</td>
                                        <td className="border border-zinc-400 p-1 text-center">{row.orderedQty}</td>
                                        <td className="border border-zinc-400 p-1 text-center">{row.receivedQty}</td>
                                        <td className={`border border-zinc-400 p-1 text-center font-semibold ${row.balanceQty > 0 ? "text-red-600" : "text-green-700"}`}>
                                            {row.balanceQty}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ))
            )}
        </div>
    );
}
