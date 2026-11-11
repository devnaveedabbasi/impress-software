"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { STORE_ISSUES } from "@/utlis/apiRoutes";
import { usePermissions } from "@/hooks/usePermissions";
import { usePrintDocument } from "@/hooks/usePrintDocument";
import { PrintStatus } from "@/components/print/PrintStatus";

type SlipItem = {
    id: number;
    inventoryId: number;
    inventory?: { itemName: string } | null;
    upm: number;
    handStock: number;
    issueQty: number;
    purpose: string;
};

type SlipIssue = {
    id: number;
    date: string;
    department?: { name: string } | null;
    color?: { name: string } | null;
    bikeQty: number;
    items: SlipItem[];
};

function IssueSlip() {
    const searchParams = useSearchParams();
    const id = searchParams.get("id");
    const { hasPermission } = usePermissions();
    const canView = hasPermission("issue_from_line", "view");

    const { data: issue, state, errorMessage, retry } = usePrintDocument<SlipIssue>(
        id && /^\d+$/.test(id) ? `${STORE_ISSUES}/${id}` : null,
        canView
    );

    if (state !== "ready" || !issue) {
        return <PrintStatus state={state === "ready" ? "error" : state} message={errorMessage} onRetry={retry} />;
    }

    const totalIssueQty = issue.items.reduce((sum, item) => sum + item.issueQty, 0);

    return (
        <div className="min-h-screen w-full bg-white p-8 text-black">
            <h2 className="mb-6 text-center text-2xl font-bold uppercase tracking-wider underline underline-offset-4">
                Store Issuance
            </h2>

            <div className="mb-5 grid grid-cols-2 gap-x-8 gap-y-1 text-[14px]">
                <p><span className="font-semibold">Requisition Slip #:</span> {issue.id}</p>
                <p><span className="font-semibold">Requisition Date:</span> {new Date(issue.date).toISOString().split("T")[0]}</p>
                <p><span className="font-semibold">Department:</span> {issue.department?.name || "-"}</p>
                <p><span className="font-semibold">Color:</span> {issue.color?.name || "-"}</p>
                <p><span className="font-semibold">Bike Qty:</span> {issue.bikeQty.toLocaleString()}</p>
            </div>

            <table className="w-full border-collapse border border-zinc-400 bg-white text-black">
                <thead>
                    <tr className="bg-[#e4e4e4] text-[13px]">
                        <th className="w-16 border border-zinc-400 p-2 text-center">Code</th>
                        <th className="border border-zinc-400 p-2 text-left">Item Description</th>
                        <th className="w-20 border border-zinc-400 p-2 text-center">Upm Unit</th>
                        <th className="w-24 border border-zinc-400 p-2 text-center">Hand Stock</th>
                        <th className="w-24 border border-zinc-400 p-2 text-center">Issue Qty</th>
                        <th className="border border-zinc-400 p-2 text-left">Purpose</th>
                    </tr>
                </thead>
                <tbody>
                    {issue.items.map((item) => (
                        <tr key={item.id} className="text-[13px]">
                            <td className="border border-zinc-400 p-1 text-center">{item.inventoryId}</td>
                            <td className="border border-zinc-400 p-1 pl-2">{item.inventory?.itemName || "-"}</td>
                            <td className="border border-zinc-400 p-1 text-center">{item.upm}</td>
                            <td className="border border-zinc-400 p-1 text-center">{item.handStock.toLocaleString()}</td>
                            <td className="border border-zinc-400 p-1 text-center">{item.issueQty.toLocaleString()}</td>
                            <td className="border border-zinc-400 p-1 pl-2">{item.purpose || "-"}</td>
                        </tr>
                    ))}
                    <tr className="bg-form-bg text-[13px] font-semibold">
                        <td colSpan={4} className="border border-zinc-400 p-1 text-right">Total Issue Qty</td>
                        <td className="border border-zinc-400 p-1 text-center">{totalIssueQty.toLocaleString()}</td>
                        <td className="border border-zinc-400 p-1"></td>
                    </tr>
                </tbody>
            </table>

            <div className="mt-16 grid grid-cols-3 gap-8 text-center text-[13px]">
                {["Issued By (Store)", "Checked By", "Received By (Line)"].map((label) => (
                    <div key={label} className="border-t border-zinc-500 pt-1">
                        {label}
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function StoreIssueSlipPage() {
    return (
        <Suspense fallback={null}>
            <IssueSlip />
        </Suspense>
    );
}
