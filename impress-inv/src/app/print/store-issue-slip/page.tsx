"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { STORE_ISSUES } from "@/utlis/apiRoutes";
import { usePermissions } from "@/hooks/usePermissions";
import { usePrintDocuments } from "@/hooks/usePrintDocuments";
import { PrintStatus } from "@/components/print/PrintStatus";
import { PrintCompanyName } from "@/components/print/PrintCompanyName";

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

function IssueSlipBody({ issue }: { issue: SlipIssue }) {

    const totalIssueQty = issue.items.reduce((sum, item) => sum + item.issueQty, 0);

    return (
        <div className="mx-auto mb-6 max-w-4xl bg-white p-8 text-black print:mb-0 print:p-0">
            <PrintCompanyName />
            <h2 className="mt-1 mb-6 text-center text-xl font-semibold uppercase tracking-wide">
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
                            <td className="border border-zinc-400 p-1 text-center">{item.issueQty.toLocaleString()}</td>
                            <td className="border border-zinc-400 p-1 pl-2">{item.purpose || "-"}</td>
                        </tr>
                    ))}
                    <tr className="bg-form-bg text-[13px] font-semibold">
                        <td colSpan={3} className="border border-zinc-400 p-1 text-right">Total Issue Qty</td>
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

function IssueSlip() {
    const { hasPermission } = usePermissions();
    const canView = hasPermission("issue_from_line", "view");

    const { records, label, truncated, total, state, errorMessage, retry } = usePrintDocuments<SlipIssue>({
        basePath: STORE_ISSUES,
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
            {records.map((issue, index) => (
                <div key={issue.id} className={index > 0 ? "break-before-page" : undefined}>
                    <IssueSlipBody issue={issue} />
                </div>
            ))}
        </>
    );
}

export default function StoreIssueSlipPage() {
    return (
        <Suspense fallback={null}>
            <IssueSlip />
        </Suspense>
    );
}
