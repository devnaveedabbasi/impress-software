"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ITEM_RETURNS } from "@/utlis/apiRoutes";
import { usePermissions } from "@/hooks/usePermissions";
import { usePrintDocuments } from "@/hooks/usePrintDocuments";
import { PrintStatus } from "@/components/print/PrintStatus";
import { PrintCompanyName } from "@/components/print/PrintCompanyName";

type SlipItem = {
    id: number;
    inventoryId: number;
    inventory?: { itemName: string } | null;
    recvdQty: number;
    purpose: string;
};

type SlipReturn = {
    id: number;
    date: string;
    department?: { name: string } | null;
    items: SlipItem[];
};

function ReturnSlipBody({ record }: { record: SlipReturn }) {

    const totalRecvdQty = record.items.reduce((sum, item) => sum + item.recvdQty, 0);

    return (
        <div className="mx-auto mb-6 max-w-4xl bg-white p-8 text-black print:mb-0 print:p-0">
            <PrintCompanyName />
            <h2 className="mt-1 mb-6 text-center text-xl font-semibold uppercase tracking-wide">
                Rejection Received
            </h2>

            <div className="mb-5 grid grid-cols-2 gap-x-8 gap-y-1 text-[14px]">
                <p><span className="font-semibold">Requisition Slip #:</span> {record.id}</p>
                <p><span className="font-semibold">Requisition Date:</span> {new Date(record.date).toISOString().split("T")[0]}</p>
                <p className="col-span-2"><span className="font-semibold">Department:</span> {record.department?.name || "-"}</p>
            </div>

            <table className="w-full border-collapse border border-zinc-400 bg-white text-black">
                <thead>
                    <tr className="bg-[#e4e4e4] text-[13px]">
                        <th className="w-16 border border-zinc-400 p-2 text-center">Code</th>
                        <th className="border border-zinc-400 p-2 text-left">Item Description</th>
                        <th className="w-28 border border-zinc-400 p-2 text-center">Recvd Qty</th>
                        <th className="border border-zinc-400 p-2 text-left">Purpose</th>
                    </tr>
                </thead>
                <tbody>
                    {record.items.map((item) => (
                        <tr key={item.id} className="text-[13px]">
                            <td className="border border-zinc-400 p-1 text-center">{item.inventoryId}</td>
                            <td className="border border-zinc-400 p-1 pl-2">{item.inventory?.itemName || "-"}</td>
                            <td className="border border-zinc-400 p-1 text-center">{item.recvdQty.toLocaleString()}</td>
                            <td className="border border-zinc-400 p-1 pl-2">{item.purpose || "-"}</td>
                        </tr>
                    ))}
                    <tr className="bg-form-bg text-[13px] font-semibold">
                        <td colSpan={2} className="border border-zinc-400 p-1 text-right">Total Recvd Qty</td>
                        <td className="border border-zinc-400 p-1 text-center">{totalRecvdQty.toLocaleString()}</td>
                        <td className="border border-zinc-400 p-1"></td>
                    </tr>
                </tbody>
            </table>

            <div className="mt-16 grid grid-cols-3 gap-8 text-center text-[13px]">
                {["Returned By (Department)", "Checked By", "Received By (Store)"].map((label) => (
                    <div key={label} className="border-t border-zinc-500 pt-1">
                        {label}
                    </div>
                ))}
            </div>
        </div>
    );
}

function ReturnSlip() {
    const { hasPermission } = usePermissions();
    const canView = hasPermission("item_return_from_department", "view");

    const { records, label, truncated, total, state, errorMessage, retry } = usePrintDocuments<SlipReturn>({
        basePath: ITEM_RETURNS,
        canView,
    });

    if (state !== "ready") {
        return <PrintStatus state={state} message={errorMessage} onRetry={retry} />;
    }

    if (records.length === 0) {
        return <p className="p-10 text-center text-black">No documents found.</p>;
    }

    // Every document starts on a new paper
    return (
        <>
            {label && <p className="p-2 text-center text-xs text-zinc-500 print:hidden">Printing: {label} ({records.length})</p>}
            {truncated && (
                <p className="p-2 text-center text-xs text-red-500 print:hidden">
                    Only the first {records.length.toLocaleString()} of {total.toLocaleString()} documents are shown. Choose a range to print the rest.
                </p>
            )}
            {records.map((record, index) => (
                <div key={record.id} className={index > 0 ? "break-before-page" : undefined}>
                    <ReturnSlipBody record={record} />
                </div>
            ))}
        </>
    );
}

export default function ItemReturnSlipPage() {
    return (
        <Suspense fallback={null}>
            <ReturnSlip />
        </Suspense>
    );
}
