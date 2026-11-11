"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { InventoryPickerModal, type InventoryPickItem } from "@/components/ui/InventoryPickerModal";
import api from "@/lib/axios";
import { usePermissions } from "@/hooks/usePermissions";
import { STOCK_LEDGER } from "@/utlis/apiRoutes";
import { cn } from "@/lib/utils";

type LedgerRow = {
    id: string;
    date: string;
    sourceType: string;
    sourceLabel: string;
    sourceId: number;
    note: string;
    qtyIn: number;
    qtyOut: number;
    balance: number;
};

type LedgerMeta = {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    item: { id: number; itemName: string };
    opening: number;
    closing: number;
    totals: { qtyIn: number; qtyOut: number };
};

const PAGE_SIZE = 50;
const fmt = (value: number) => value.toLocaleString();
const fmtDate = (value: string) => new Date(value).toLocaleDateString("en-GB");

// Item Ledger: every stock movement of one item with a running balance
export default function ItemLedgerPage() {
    const { hasPermission } = usePermissions();
    const canView = hasPermission("item_ledger", "view");

    const [item, setItem] = useState<InventoryPickItem | null>(null);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");

    const [rows, setRows] = useState<LedgerRow[]>([]);
    const [meta, setMeta] = useState<LedgerMeta | null>(null);
    const [page, setPage] = useState(1);
    const [isFetching, setIsFetching] = useState(false);
    const [error, setError] = useState("");
    const [selectError, setSelectError] = useState("");
    const requestRef = useRef(0);

    const load = async (nextPage: number) => {
        if (!item) {
            setSelectError("Please select an item");
            return;
        }
        if (fromDate && toDate && fromDate > toDate) {
            setError("From date cannot be after To date");
            return;
        }
        setSelectError("");
        const requestId = ++requestRef.current;
        setIsFetching(true);
        setError("");
        try {
            const params = new URLSearchParams({ inventoryId: String(item.id), page: String(nextPage), limit: String(PAGE_SIZE) });
            if (fromDate) params.set("fromDate", fromDate);
            if (toDate) params.set("toDate", toDate);
            const { data } = await api.get(`${STOCK_LEDGER}?${params.toString()}`);
            if (requestId !== requestRef.current) return;
            setRows(data.data || []);
            setMeta(data.meta as LedgerMeta);
            setPage(nextPage);
        } catch (err: unknown) {
            if (requestId !== requestRef.current) return;
            const message = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
            setError(message || "Failed to load the ledger. Please try again.");
            setRows([]);
            setMeta(null);
        } finally {
            if (requestId === requestRef.current) setIsFetching(false);
        }
    };

    const inputClass =
        "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-primary-400";

    return (
        <section className="w-full bg-white p-4 shadow-xl sm:p-6">
            <h1 className="text-xl font-bold text-zinc-900 sm:text-2xl">Item Ledger</h1>
            <p className="mt-1 text-xs text-zinc-500">Every stock movement of one item, with the running balance.</p>

            {!canView ? (
                <p className="py-10 text-center text-sm text-red-500">You do not have permission to view this report.</p>
            ) : (
                <>
                    <form
                        className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
                        onSubmit={(event) => {
                            event.preventDefault();
                            void load(1);
                        }}
                    >
                        <div>
                            <label className="mb-1 block text-xs font-medium text-zinc-600">Item</label>
                            <button
                                type="button"
                                onClick={() => setPickerOpen(true)}
                                className={cn(inputClass, "text-left", !item && "text-zinc-400", selectError && "border-red-500")}
                            >
                                {item ? `${item.id} - ${item.itemName}` : "Click to select an item"}
                            </button>
                            {selectError && <p className="mt-1 text-xs text-red-500">{selectError}</p>}
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-medium text-zinc-600">From date</label>
                            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inputClass} />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-medium text-zinc-600">To date</label>
                            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={inputClass} />
                        </div>
                        <div className="flex items-end">
                            <Button type="submit" shape="rounded" isLoading={isFetching} className="w-full px-8">
                                Show
                            </Button>
                        </div>
                    </form>

                    {error && <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

                    {meta && (
                        <>
                            <div className="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                                {[
                                    ["Opening", meta.opening],
                                    ["Total In", meta.totals.qtyIn],
                                    ["Total Out", meta.totals.qtyOut],
                                    ["Closing", meta.closing],
                                ].map(([label, value]) => (
                                    <div key={label} className="rounded-md border border-zinc-200 bg-form-bg px-2 py-2">
                                        <div className="text-xs text-zinc-500">{label}</div>
                                        <div className="text-base font-semibold text-zinc-900">{fmt(Number(value))}</div>
                                    </div>
                                ))}
                            </div>

                            <div className="mt-4 overflow-x-auto border border-zinc-300">
                                <table className="w-full min-w-160 border-collapse text-left text-sm text-zinc-900">
                                    <thead className="bg-zinc-100 text-zinc-700">
                                        <tr>
                                            {["Date", "Document", "No.", "Note", "In", "Out", "Balance"].map((header, index) => (
                                                <th
                                                    key={header}
                                                    className={cn("border-b border-zinc-300 px-3 py-2 font-semibold", index >= 4 && "text-right")}
                                                >
                                                    {header}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className={cn(isFetching && "opacity-50")}>
                                        <tr className="bg-zinc-50 text-zinc-600">
                                            <td className="border-b border-zinc-100 px-3 py-2" colSpan={6}>
                                                Opening balance
                                            </td>
                                            <td className="border-b border-zinc-100 px-3 py-2 text-right font-medium">{fmt(meta.opening)}</td>
                                        </tr>
                                        {rows.length === 0 ? (
                                            <tr>
                                                <td colSpan={7} className="px-3 py-10 text-center text-sm text-zinc-500">
                                                    No stock movement found for this item in the chosen dates.
                                                </td>
                                            </tr>
                                        ) : (
                                            rows.map((row) => (
                                                <tr key={row.id} className="hover:bg-primary-50">
                                                    <td className="border-b border-zinc-100 px-3 py-2">{fmtDate(row.date)}</td>
                                                    <td className="border-b border-zinc-100 px-3 py-2">{row.sourceLabel}</td>
                                                    <td className="border-b border-zinc-100 px-3 py-2">{row.sourceId}</td>
                                                    <td className="border-b border-zinc-100 px-3 py-2 text-zinc-600">{row.note || "-"}</td>
                                                    <td className="border-b border-zinc-100 px-3 py-2 text-right">{row.qtyIn ? fmt(row.qtyIn) : "-"}</td>
                                                    <td className="border-b border-zinc-100 px-3 py-2 text-right">{row.qtyOut ? fmt(row.qtyOut) : "-"}</td>
                                                    <td className="border-b border-zinc-100 px-3 py-2 text-right font-medium">{fmt(row.balance)}</td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            <div className="mt-4 flex items-center justify-end gap-2">
                                <Button type="button" size="sm" variant="outline" shape="rounded" disabled={isFetching || page <= 1} onClick={() => void load(page - 1)}>
                                    Previous
                                </Button>
                                <span className="min-w-24 text-center text-xs text-zinc-600">
                                    Page {fmt(page)} / {fmt(meta.totalPages)}
                                </span>
                                <Button type="button" size="sm" variant="outline" shape="rounded" disabled={isFetching || page >= meta.totalPages} onClick={() => void load(page + 1)}>
                                    Next
                                </Button>
                            </div>
                        </>
                    )}
                </>
            )}

            <InventoryPickerModal
                isOpen={pickerOpen}
                onClose={() => setPickerOpen(false)}
                onSelect={(picked) => {
                    setItem(picked);
                    setSelectError("");
                    setPickerOpen(false);
                }}
            />
        </section>
    );
}
