"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { REJECTION_RECEIVED_FROM_DEALER } from "@/utlis/apiRoutes";
import { usePermissions } from "@/hooks/usePermissions";
import { usePrintDocument } from "@/hooks/usePrintDocument";
import { PrintStatus } from "@/components/print/PrintStatus";

type SlipItem = {
    id: number;
    inventoryId: number;
    inventory?: { itemName: string } | null;
    rej: number;
    report: string;
};

type SlipReturn = {
    id: number;
    date: string;
    dealer?: { dealarShipName: string } | null;
    address: string;
    contactNo: string;
    saleTaxNo: string;
    transport: string;
    builtyNo: string;
    bookNo: string;
    receivedBy: string;
    items: SlipItem[];
};

function ReturnSlip() {
    const searchParams = useSearchParams();
    const id = searchParams.get("id");
    const { hasPermission } = usePermissions();
    const canView = hasPermission("rejection_received_from_dealer", "view");

    const { data: record, state, errorMessage, retry } = usePrintDocument<SlipReturn>(
        id && /^\d+$/.test(id) ? `${REJECTION_RECEIVED_FROM_DEALER}/${id}` : null,
        canView
    );

    if (state !== "ready" || !record) {
        return <PrintStatus state={state === "ready" ? "error" : state} message={errorMessage} onRetry={retry} />;
    }

    const totalRej = record.items.reduce((sum, item) => sum + item.rej, 0);

    return (
        <div className="min-h-screen w-full bg-white p-8 text-black">
            <h2 className="mb-6 text-center text-2xl font-bold uppercase tracking-wider underline underline-offset-4">
                Rejection Received From Dealer Gate Pass
            </h2>

            <div className="mb-5 grid grid-cols-2 gap-x-8 gap-y-1 text-[14px]">
                <p><span className="font-semibold">Claim Note No:</span> {record.id}</p>
                <p><span className="font-semibold">Date:</span> {new Date(record.date).toISOString().split("T")[0]}</p>
                <p className="col-span-2"><span className="font-semibold">Dealer Name:</span> {record.dealer?.dealarShipName || "-"}</p>
                <p className="col-span-2"><span className="font-semibold">Address:</span> {record.address}</p>
                <p><span className="font-semibold">Contact:</span> {record.contactNo}</p>
                <p><span className="font-semibold">Sale Tax No:</span> {record.saleTaxNo}</p>
                <p><span className="font-semibold">Transport:</span> {record.transport}</p>
                <p><span className="font-semibold">Builty No:</span> {record.builtyNo || "-"}</p>
                <p><span className="font-semibold">Book No:</span> {record.bookNo || "-"}</p>
                <p><span className="font-semibold">Received By:</span> {record.receivedBy}</p>
            </div>

            <table className="w-full border-collapse border border-zinc-400 bg-white text-black">
                <thead>
                    <tr className="bg-[#e4e4e4] text-[13px]">
                        <th className="w-16 border border-zinc-400 p-2 text-center">Code</th>
                        <th className="border border-zinc-400 p-2 text-left">Item Name</th>
                        <th className="w-20 border border-zinc-400 p-2 text-center">Rej</th>
                        <th className="border border-zinc-400 p-2 text-left">Report</th>
                    </tr>
                </thead>
                <tbody>
                    {record.items.map((item) => (
                        <tr key={item.id} className="text-[13px]">
                            <td className="border border-zinc-400 p-1 text-center">{item.inventoryId}</td>
                            <td className="border border-zinc-400 p-1 pl-2">{item.inventory?.itemName || "-"}</td>
                            <td className="border border-zinc-400 p-1 text-center">{item.rej}</td>
                            <td className="border border-zinc-400 p-1 pl-2">{item.report || "-"}</td>
                        </tr>
                    ))}
                    <tr className="bg-form-bg text-[13px] font-semibold">
                        <td colSpan={2} className="border border-zinc-400 p-1 text-right">Total Rej</td>
                        <td className="border border-zinc-400 p-1 text-center">{totalRej}</td>
                        <td className="border border-zinc-400 p-1"></td>
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

export default function RejectionReceivedSlipPage() {
    return (
        <Suspense fallback={null}>
            <ReturnSlip />
        </Suspense>
    );
}
