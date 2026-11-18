"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { usePrintableList } from "@/hooks/usePrintableList";
import { COMPANY_NAME } from "@/lib/company";
import { selectPrintRecords, PRINT_ALL_MAX } from "@/lib/printSelection";
import { PrintStatus } from "@/components/print/PrintStatus";
import { PrintButton } from "@/components/print/PrintButton";
import { INVENTORY } from "@/utlis/apiRoutes";


interface InventoryRow {
    id: number;
    itemName: string;
    category?: { name: string };
    department?: { name: string };
    pack: number;
    rate: number;
    unitPerBike: number;
}

function InventorySheet() {
    const searchParams = useSearchParams();
    const { rows: all, state, errorMessage, retry } = usePrintableList<InventoryRow>(INVENTORY, (raw) => raw as InventoryRow[]);

    // The title is the suggested name of a saved PDF
    useEffect(() => {
        document.title = "Inventory Items";
    }, []);

    if (state !== "ready") {
        return <PrintStatus state={state} message={errorMessage} onRetry={retry} />;
    }

    // Only what was chosen in the Print dialog (this record, a range, the last N, or all)
    const { rows: items, total, truncated, label } = selectPrintRecords(all, searchParams);

    return (
        <div className="min-h-screen bg-zinc-100 px-4 py-8 print:bg-white print:p-0">
            <PrintButton />
            <div className="mx-auto max-w-4xl bg-white p-8 text-black print:p-0">
                <h1 className="text-center text-2xl font-bold uppercase tracking-wide">
                    {COMPANY_NAME}
                </h1>
                <h2 className="mt-1 text-center text-xl font-semibold uppercase tracking-wide">
                    Inventory Items
                </h2>
                {label !== "All records" && <p className="mt-1 text-center text-sm font-medium text-zinc-600">{label}</p>}
                {truncated && (
                    <p className="mt-2 border border-zinc-400 bg-zinc-100 p-2 text-center text-xs">
                        Showing the first {PRINT_ALL_MAX.toLocaleString()} of {total.toLocaleString()} records. Choose a range to print the rest.
                    </p>
                )}

                <div className="mt-6 space-y-4">
                    {items.map((item) => (
                        <div key={item.id} className="break-inside-avoid border border-zinc-400">
                            <div className="border-b border-zinc-400 bg-zinc-200 px-3 py-1.5 text-center text-sm font-semibold">
                                {item.itemName}
                            </div>
                            <table className="w-full border-collapse text-sm">
                                <thead>
                                    <tr className="border-b border-zinc-400 bg-zinc-50">
                                        <th className="w-16 border-r border-zinc-400 px-2 py-1 text-left font-medium">
                                            Code
                                        </th>
                                        <th className="border-r border-zinc-400 px-2 py-1 text-left font-medium">
                                            Category
                                        </th>
                                        <th className="border-r border-zinc-400 px-2 py-1 text-left font-medium">
                                            Department
                                        </th>
                                        <th className="w-20 border-r border-zinc-400 px-2 py-1 text-left font-medium">
                                            Pack
                                        </th>
                                        <th className="w-24 border-r border-zinc-400 px-2 py-1 text-left font-medium">
                                            Rate
                                        </th>
                                        <th className="w-24 px-2 py-1 text-left font-medium">Unit/Bike</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr className="border-b border-zinc-400">
                                        <td className="border-r border-zinc-400 px-2 py-1.5">{item.id}</td>
                                        <td className="border-r border-zinc-400 px-2 py-1.5">
                                            {item.category?.name ?? "-"}
                                        </td>
                                        <td className="border-r border-zinc-400 px-2 py-1.5">
                                            {item.department?.name ?? "-"}
                                        </td>
                                        <td className="border-r border-zinc-400 px-2 py-1.5">{item.pack}</td>
                                        <td className="border-r border-zinc-400 px-2 py-1.5">{item.rate}</td>
                                        <td className="px-2 py-1.5">{item.unitPerBike}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    ))}

                    {items.length === 0 && (
                        <p className="text-center text-zinc-500">No inventory items found.</p>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function InventoryPrintPage() {
    return (
        <Suspense fallback={null}>
            <InventorySheet />
        </Suspense>
    );
}
