"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { SALE_GATE_PASSES } from "@/utlis/apiRoutes";
import { usePermissions } from "@/hooks/usePermissions";
import { usePrintDocument } from "@/hooks/usePrintDocument";
import { PrintStatus } from "@/components/print/PrintStatus";

type SlipItem = {
    id: number;
    inventoryId: number;
    inventory?: { itemName: string } | null;
    unit: string;
    stockInHand: number;
    qty: number;
};

type SlipGatePass = {
    id: number;
    date: string;
    accountName: string;
    billNO?: number | null;
    throughBy: string;
    remarks: string;
    vehicleNo: string;
    items: SlipItem[];
};

function GatePassSlip() {
    const searchParams = useSearchParams();
    const id = searchParams.get("id");
    const { hasPermission } = usePermissions();
    const canView = hasPermission("sale_gate_pass", "view");

    const { data: gatePass, state, errorMessage, retry } = usePrintDocument<SlipGatePass>(
        id && /^\d+$/.test(id) ? `${SALE_GATE_PASSES}/${id}` : null,
        canView
    );

    if (state !== "ready" || !gatePass) {
        return <PrintStatus state={state === "ready" ? "error" : state} message={errorMessage} onRetry={retry} />;
    }

    const totalQty = gatePass.items.reduce((sum, item) => sum + item.qty, 0);

    return (
        <div className="min-h-screen w-full bg-white p-8 text-black">
            <h2 className="mb-6 text-center text-2xl font-bold uppercase tracking-wider underline underline-offset-4">
                Part Sale Gate Pass
            </h2>

            <div className="mb-5 grid grid-cols-2 gap-x-8 gap-y-1 text-[14px]">
                <p><span className="font-semibold">Gate Pass No:</span> {gatePass.id}</p>
                <p><span className="font-semibold">Date:</span> {new Date(gatePass.date).toISOString().split("T")[0]}</p>
                <p className="col-span-2"><span className="font-semibold">Account Name:</span> {gatePass.accountName}</p>
                <p><span className="font-semibold">Bill No:</span> {gatePass.billNO ?? "-"}</p>
                <p><span className="font-semibold">Through By:</span> {gatePass.throughBy || "-"}</p>
                <p><span className="font-semibold">Vehicle No:</span> {gatePass.vehicleNo || "-"}</p>
                <p className="col-span-2"><span className="font-semibold">Remarks:</span> {gatePass.remarks || "-"}</p>
            </div>

            <table className="w-full border-collapse border border-zinc-400 bg-white text-black">
                <thead>
                    <tr className="bg-[#e4e4e4] text-[13px]">
                        <th className="w-16 border border-zinc-400 p-2 text-center">Code</th>
                        <th className="border border-zinc-400 p-2 text-left">Item Name</th>
                        <th className="w-24 border border-zinc-400 p-2 text-center">Unit</th>
                        <th className="w-28 border border-zinc-400 p-2 text-center">Stock in Hand</th>
                        <th className="w-20 border border-zinc-400 p-2 text-center">Qty</th>
                    </tr>
                </thead>
                <tbody>
                    {gatePass.items.map((item) => (
                        <tr key={item.id} className="text-[13px]">
                            <td className="border border-zinc-400 p-1 text-center">{item.inventoryId}</td>
                            <td className="border border-zinc-400 p-1 pl-2">{item.inventory?.itemName || "-"}</td>
                            <td className="border border-zinc-400 p-1 text-center">{item.unit || "-"}</td>
                            <td className="border border-zinc-400 p-1 text-center">{item.stockInHand}</td>
                            <td className="border border-zinc-400 p-1 text-center">{item.qty}</td>
                        </tr>
                    ))}
                    <tr className="bg-form-bg text-[13px] font-semibold">
                        <td colSpan={4} className="border border-zinc-400 p-1 text-right">Total Qty</td>
                        <td className="border border-zinc-400 p-1 text-center">{totalQty}</td>
                    </tr>
                </tbody>
            </table>

            <div className="mt-16 grid grid-cols-3 gap-8 text-center text-[13px]">
                {["Prepared By", "Checked By", "Received By"].map((label) => (
                    <div key={label} className="border-t border-zinc-500 pt-1">
                        {label}
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function SaleGatePassSlipPage() {
    return (
        <Suspense fallback={null}>
            <GatePassSlip />
        </Suspense>
    );
}
