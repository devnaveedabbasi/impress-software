"use client";

import { useEffect, useState } from "react";
import api from "@/lib/axios";

const COMPANY_NAME = "SINDH AUTO INDUSTRIES PVT LTD";

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

export function PrintableProfileList({
    subtitle,
    apiPath,
    mapRecord,
    emptyMessage = "No records found.",
}: PrintableProfileListProps) {
    const [records, setRecords] = useState<PrintableRecord[]>([]);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        api
            .get(apiPath)
            .then(({ data }) => setRecords((data.data || []).map(mapRecord)))
            .finally(() => setLoaded(true));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [apiPath]);

    useEffect(() => {
        if (loaded && records.length > 0) {
            const timer = setTimeout(() => window.print(), 300);
            return () => clearTimeout(timer);
        }
    }, [loaded, records.length]);

    return (
        <div className="min-h-screen bg-zinc-100 px-4 py-8 print:bg-white print:p-0">
            <div className="mx-auto max-w-4xl bg-white p-8 text-black print:p-0">
                <h1 className="text-center text-2xl font-bold uppercase tracking-wide">
                    {COMPANY_NAME}
                </h1>
                <h2 className="mt-1 text-center text-xl font-semibold uppercase tracking-wide">
                    {subtitle}
                </h2>

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

                    {loaded && records.length === 0 && (
                        <p className="text-center text-zinc-500">{emptyMessage}</p>
                    )}
                    {!loaded && <p className="text-center text-zinc-500">Loading...</p>}
                </div>
            </div>
        </div>
    );
}
