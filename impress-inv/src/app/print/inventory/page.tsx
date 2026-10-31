"use client";

import { useEffect, useState } from "react";
import api from "@/lib/axios";
import { INVENTORY } from "@/utlis/apiRoutes";

const COMPANY_NAME = "SINDH AUTO INDUSTRIES PVT LTD";

interface InventoryRow {
    id: number;
    itemName: string;
    category?: { name: string };
    department?: { name: string };
    pack: number;
    rate: number;
    unitPerBike: number;
}

export default function InventoryPrintPage() {
    const [items, setItems] = useState<InventoryRow[]>([]);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        api
            .get(INVENTORY)
            .then(({ data }) => setItems(data.data || []))
            .finally(() => setLoaded(true));
    }, []);

    useEffect(() => {
        if (loaded && items.length > 0) {
            const timer = setTimeout(() => window.print(), 300);
            return () => clearTimeout(timer);
        }
    }, [loaded, items.length]);

    return (
        <div className="min-h-screen bg-zinc-100 px-4 py-8 print:bg-white print:p-0">
            <div className="mx-auto max-w-4xl bg-white p-8 text-black print:p-0">
                <h1 className="text-center text-2xl font-bold uppercase tracking-wide">
                    {COMPANY_NAME}
                </h1>
                <h2 className="mt-1 text-center text-xl font-semibold uppercase tracking-wide">
                    Inventory Items
                </h2>

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

                    {loaded && items.length === 0 && (
                        <p className="text-center text-zinc-500">No inventory items found.</p>
                    )}
                    {!loaded && <p className="text-center text-zinc-500">Loading...</p>}
                </div>
            </div>
        </div>
    );
}
