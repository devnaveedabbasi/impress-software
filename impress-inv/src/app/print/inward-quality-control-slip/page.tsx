"use client";

import { Suspense } from "react";
import { INWARDS } from "@/utlis/apiRoutes";
import { usePermissions } from "@/hooks/usePermissions";
import { usePrintDocuments } from "@/hooks/usePrintDocuments";
import { PrintStatus } from "@/components/print/PrintStatus";
import { PrintCompanyName } from "@/components/print/PrintCompanyName";

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

function InwardSlipBody({ inward }: { inward: SlipInward }) {
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
        <div className="mx-auto mb-6 max-w-4xl bg-white p-8 text-black print:mb-0 print:p-0">
            <PrintCompanyName />
            <h2 className="mt-1 mb-6 text-center text-xl font-semibold uppercase tracking-wide">
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

function InwardSlip() {
    const { hasPermission } = usePermissions();
    const canView = hasPermission("inward_quality_control", "view");

    const { records, label, truncated, total, state, errorMessage, retry } = usePrintDocuments<SlipInward>({
        basePath: INWARDS,
        canView,
    });

    if (state !== "ready") {
        return <PrintStatus state={state} message={errorMessage} onRetry={retry} />;
    }

    if (records.length === 0) {
        return <p className="p-10 text-center text-black">No entries found.</p>;
    }

    // Every entry starts on a new paper
    return (
        <>
            {label && <p className="p-2 text-center text-xs text-zinc-500 print:hidden">Printing: {label} ({records.length})</p>}
            {truncated && (
                <p className="p-2 text-center text-xs text-red-500 print:hidden">
                    Only the first {records.length.toLocaleString()} of {total.toLocaleString()} entries are shown. Choose a range to print the rest.
                </p>
            )}
            {records.map((inward, index) => (
                <div key={inward.id} className={index > 0 ? "break-before-page" : undefined}>
                    <InwardSlipBody inward={inward} />
                </div>
            ))}
        </>
    );
}

export default function InwardQualityControlSlipPage() {
    return (
        <Suspense fallback={<div className="p-10 text-center text-black">Loading entry...</div>}>
            <InwardSlip />
        </Suspense>
    );
}
