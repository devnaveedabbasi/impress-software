"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { usePrintableList } from "@/hooks/usePrintableList";
import { describePrintSelection, printRequestParams, PRINT_ALL_MAX } from "@/lib/printSelection";
import { COMPANY_NAME } from "@/lib/company";
import { PrintStatus } from "@/components/print/PrintStatus";


export interface PrintableRecord {
    id: number;
    name: string;
    address: string;
    contactNo: string;
    saleTaxNo: string;
    NTNNo: string;
}

interface PrintableProfileListProps {
    subtitle: string;
    apiPath: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mapRecord: (raw: any) => PrintableRecord;
    emptyMessage?: string;
}

function ProfileListSheet({
    subtitle,
    apiPath,
    mapRecord,
    emptyMessage = "No records found.",
}: PrintableProfileListProps) {
    const searchParams = useSearchParams();
    const { rows: records, total, truncated, state, errorMessage, retry } = usePrintableList<PrintableRecord>(
        apiPath,
        (raw) => raw.map(mapRecord),
        printRequestParams(searchParams)
    );

    // The title is the suggested name of a saved PDF
    useEffect(() => {
        document.title = subtitle;
    }, [subtitle]);

    if (state !== "ready") {
        return <PrintStatus state={state} message={errorMessage} onRetry={retry} />;
    }

    // The server sent only what was chosen in the Print dialog (this record, a range, the last N, or all)
    const label = describePrintSelection(searchParams, records.length);

    return (
        <div>
            <div className="mx-auto max-w-4xl bg-white p-8 text-black print:p-0">
                <h1 className="text-center text-2xl font-bold uppercase tracking-wide">
                    {COMPANY_NAME}
                </h1>
                <h2 className="mt-1 text-center text-xl font-semibold uppercase tracking-wide">
                    {subtitle}
                </h2>
                {label !== "All records" && <p className="mt-1 text-center text-sm font-medium text-zinc-600">{label}</p>}
                {truncated && (
                    <p className="mt-2 border border-zinc-400 bg-zinc-100 p-2 text-center text-xs">
                        Showing the first {PRINT_ALL_MAX.toLocaleString()} of {total.toLocaleString()} records. Choose a range to print the rest.
                    </p>
                )}

                <div className="mt-6 space-y-4">
                    {records.map((r) => (
                        <div key={r.id} className="break-inside-avoid border border-zinc-400">
                            <div className="border-b border-zinc-400 bg-zinc-200 px-3 py-1.5 text-center text-sm font-semibold">
                                {r.name}
                            </div>
                            <table className="w-full border-collapse text-sm">
                                <thead>
                                    <tr className="border-b border-zinc-400 bg-zinc-50">
                                        <th className="w-16 border-r border-zinc-400 px-2 py-1 text-left font-medium">
                                            Code
                                        </th>
                                        <th className="border-r border-zinc-400 px-2 py-1 text-left font-medium">
                                            Address
                                        </th>
                                        <th className="w-40 border-r border-zinc-400 px-2 py-1 text-left font-medium">
                                            Contact
                                        </th>
                                        <th className="w-28 border-r border-zinc-400 px-2 py-1 text-left font-medium">
                                            Sale Tax #
                                        </th>
                                        <th className="w-28 px-2 py-1 text-left font-medium">NTN #</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td className="border-r border-zinc-400 px-2 py-1.5">{r.id}</td>
                                        <td className="border-r border-zinc-400 px-2 py-1.5">{r.address}</td>
                                        <td className="border-r border-zinc-400 px-2 py-1.5">{r.contactNo}</td>
                                        <td className="border-r border-zinc-400 px-2 py-1.5">{r.saleTaxNo}</td>
                                        <td className="px-2 py-1.5">{r.NTNNo}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    ))}

                    {records.length === 0 && (
                        <p className="text-center text-zinc-500">{emptyMessage}</p>
                    )}
                </div>
            </div>
        </div>
    );
}

export function PrintableProfileList(props: PrintableProfileListProps) {
    return (
        <Suspense fallback={null}>
            <ProfileListSheet {...props} />
        </Suspense>
    );
}
