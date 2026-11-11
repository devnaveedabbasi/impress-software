"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import api from "@/lib/axios";
import { INWARDS } from "@/utlis/apiRoutes";
import toast from "react-hot-toast";
import { usePermissions } from "@/hooks/usePermissions";

type SlipItem = {
    id: number;
    inventoryId: number;
    inventory?: { itemName: string } | null;
    poBalQty: number;
    recQty: number;
    rejQty: number;
    okQty: number;
    packingDetail: string;
};

type SlipInward = {
    id: number;
    date: string;
    Type: string;
    purchaseOrderId?: number | null;
    quotationId?: number | null;
    GRIRNo: number;
    DCNo: number;
    billNO?: number | null;
    detail: string;
    purchaseOrder?: { vendor?: { vendorName?: string } } | null;
    quotation?: { vendor?: { vendorName?: string } } | null;
    items: SlipItem[];
};

const TYPE_LABELS: Record<string, string> = {
    againstPO: "Against PO",
    againstSimple: "Against Simple",
    againstDealarRejection: "Against Dealer Rejection",
};

function InwardSlip() {
    const searchParams = useSearchParams();
    const id = searchParams.get("id") || "";
    const { hasPermission } = usePermissions();
    const canView = hasPermission("inward_quality_control", "view");

    const [inward, setInward] = useState<SlipInward | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState("");

    useEffect(() => {
        const fetchInward = async () => {
            if (!canView) {
                toast.error("You do not have permission to print this entry.");
                setIsLoading(false);
                return;
            }
            if (!id) {
                setIsLoading(false);
                return;
            }

            try {
                const { data } = await api.get(`${INWARDS}/${id}`);
                setInward(data.data || null);
                // Give React a moment to render before calling print
                setTimeout(() => window.print(), 500);
            } catch (error: unknown) {
                const response = (error as { response?: { status?: number; data?: { message?: string } } }).response;
                setLoadError(
                    response?.status === 404
                        ? "Inward entry not found"
                        : response?.data?.message ||
                              (response?.status
                                  ? `Failed to load entry (server error ${response.status})`
                                  : "Failed to load entry (cannot reach the server)")
                );
            } finally {
                setIsLoading(false);
            }
        };

        void fetchInward();
    }, [id, canView]);

    if (isLoading) {
        return <div className="p-10 text-center text-black">Loading entry...</div>;
    }

    if (!inward) {
        return (
            <div className="p-10 text-center text-black">
                {loadError || (id ? "Entry not found." : "No entry selected to print.")}
            </div>
        );
    }

    const vendorName =
        inward.purchaseOrder?.vendor?.vendorName || inward.quotation?.vendor?.vendorName || "-";
    const totals = inward.items.reduce(
        (sum, item) => ({
            rec: sum.rec + item.recQty,
            rej: sum.rej + item.rejQty,
            ok: sum.ok + item.okQty,
        }),
        { rec: 0, rej: 0, ok: 0 }
    );

    return (
        <div className="min-h-screen w-full bg-white p-8 text-black">
            <h2 className="mb-6 text-center text-2xl font-bold uppercase tracking-wider">
                Inward / Quality Control
            </h2>

            <div className="mb-5 grid grid-cols-2 gap-x-8 gap-y-1 text-[14px]">
                <p><span className="font-semibold">Q.C No:</span> {inward.id}</p>
                <p><span className="font-semibold">Date:</span> {new Date(inward.date).toLocaleDateString()}</p>
                <p><span className="font-semibold">Type:</span> {TYPE_LABELS[inward.Type] || inward.Type}</p>
                <p><span className="font-semibold">PO No:</span> {inward.purchaseOrderId || inward.quotationId || "-"}</p>
                <p className="col-span-2"><span className="font-semibold">Vendor:</span> {vendorName}</p>
                <p><span className="font-semibold">G.R.LR No:</span> {inward.GRIRNo}</p>
                <p><span className="font-semibold">D.C No:</span> {inward.DCNo}</p>
                <p><span className="font-semibold">Bill No:</span> {inward.billNO ?? "-"}</p>
                <p className="col-span-2"><span className="font-semibold">Details:</span> {inward.detail}</p>
            </div>

            <table className="w-full border-collapse border border-zinc-400 bg-white text-black">
                <thead>
                    <tr className="bg-[#e4e4e4] text-[13px]">
                        <th className="w-16 border border-zinc-400 p-2 text-center">Code</th>
                        <th className="border border-zinc-400 p-2 text-left">Item Name</th>
                        <th className="w-24 border border-zinc-400 p-2 text-center">PO Bal Qty</th>
                        <th className="w-20 border border-zinc-400 p-2 text-center">Rec Qty</th>
                        <th className="w-20 border border-zinc-400 p-2 text-center">REJ Qty</th>
                        <th className="w-20 border border-zinc-400 p-2 text-center">OK Qty</th>
                        <th className="border border-zinc-400 p-2 text-left">Packing Detail</th>
                    </tr>
                </thead>
                <tbody>
                    {inward.items.map((item) => (
                        <tr key={item.id} className="text-[13px]">
                            <td className="border border-zinc-400 p-1 text-center">{item.inventoryId}</td>
                            <td className="border border-zinc-400 p-1 pl-2">{item.inventory?.itemName || "-"}</td>
                            <td className="border border-zinc-400 p-1 text-center">{item.poBalQty}</td>
                            <td className="border border-zinc-400 p-1 text-center">{item.recQty}</td>
                            <td className="border border-zinc-400 p-1 text-center">{item.rejQty}</td>
                            <td className="border border-zinc-400 p-1 text-center">{item.okQty}</td>
                            <td className="border border-zinc-400 p-1 pl-2">{item.packingDetail || "-"}</td>
                        </tr>
                    ))}
                    <tr className="bg-[#f3f3f3] text-[13px] font-semibold">
                        <td colSpan={3} className="border border-zinc-400 p-1 text-right">Total</td>
                        <td className="border border-zinc-400 p-1 text-center">{totals.rec}</td>
                        <td className="border border-zinc-400 p-1 text-center">{totals.rej}</td>
                        <td className="border border-zinc-400 p-1 text-center">{totals.ok}</td>
                        <td className="border border-zinc-400 p-1"></td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
}

export default function InwardQualityControlSlipPage() {
    return (
        <Suspense fallback={<div className="p-10 text-center text-black">Loading entry...</div>}>
            <InwardSlip />
        </Suspense>
    );
}
