"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { LabeledField } from "@/components/ui/LabeledField";
import { Button } from "@/components/ui/Button";
import useDebounce from "@/hooks/useDebounce";
import { stockTransferSchema, type StockTransferFormValues } from "@/lib/validations/master";
import { STOCK_TRANSFERS } from "@/utlis/apiRoutes";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { ViewAllModal, type ViewAllColumn } from "@/components/ui/ViewAllModal";
import { InventoryPickerModal, type InventoryPickItem } from "@/components/ui/InventoryPickerModal";
import { RowDeleteButton, deletableRowClassName } from "@/components/ui/RowDeleteButton";
import { AddRowButton } from "@/components/ui/AddRowButton";

type TransferItemRow = {
    id: number;
    inventoryId: number;
    inventory?: { id: number; itemName: string } | null;
    qty: number;
};

type TransferRow = {
    id: number; // the Trans ID
    date: string;
    newInventoryId: number;
    newInventory?: { id: number; itemName: string } | null;
    qty: number;
    items?: TransferItemRow[];
    newItemName?: string;
    itemsSummary?: string;
    [key: string]: unknown;
};

type ApiError = {
    response?: {
        status?: number;
        data?: { message?: string };
    };
};

// Which part of the form the item picker is filling: the NEW item, or the OLD item of a grid row
type PickerTarget = { kind: "new" } | { kind: "row"; index: number } | null;

const MIN_ROWS = 5;
const MAX_ROWS = 500;
const padRows = <T,>(rows: T[], makeRow: () => T): T[] => {
    const padded = [...rows];
    while (padded.length < MIN_ROWS) padded.push(makeRow());
    return padded;
};

const defaultRow = () => ({ inventoryId: "", itemName: "", qty: "", handStock: "" });
const today = () => new Date().toISOString().split("T")[0];

const initialValues: StockTransferFormValues = {
    id: "",
    date: today(),
    newInventoryId: "",
    newItemName: "",
    items: Array.from({ length: MIN_ROWS }, defaultRow),
};

// Transfer Form: the stock of old item(s) moves to a new item (new code / new name).
// Old items lose their Qty, the new item gets the total. The Trans ID is the automatic id of the transfer.
export default function TransferFormPage() {
    const [isNewMode, setIsNewMode] = useState(true);
    const [isEditing, setIsEditing] = useState(true);
    const [picker, setPicker] = useState<PickerTarget>(null);
    // Problems found in the old item rows: which cell of which row is wrong and why
    const [rowErrors, setRowErrors] = useState<Record<number, { field: string; message: string }>>({});

    const { hasPermission } = usePermissions();
    const canCreate = hasPermission("transfer_form", "create");
    const canUpdate = hasPermission("transfer_form", "update");
    const canView = hasPermission("transfer_form", "view");

    const [isIdLoading, setIsIdLoading] = useState(true);
    const [nextId, setNextId] = useState("");
    const [isViewAllOpen, setIsViewAllOpen] = useState(false);
    const [transfers, setTransfers] = useState<TransferRow[]>([]);
    const [hasLoadedTransfers, setHasLoadedTransfers] = useState(false);
    const [isTransfersLoading, setIsTransfersLoading] = useState(false);
    const [transfersError, setTransfersError] = useState("");
    const skipNextIdLookup = useRef(false);
    const refreshNextIdAfterSubmit = useRef(false);

    const {
        handleSubmit,
        reset,
        setError,
        clearErrors,
        setValue,
        watch,
        formState: { errors, isSubmitting },
    } = useForm<StockTransferFormValues>({ defaultValues: initialValues });
    const values = watch();

    const freshForm = (id: string): StockTransferFormValues => ({
        ...initialValues,
        id,
        date: today(),
        items: Array.from({ length: MIN_ROWS }, defaultRow),
    });

    const fetchNextId = async () => {
        setIsIdLoading(true);
        try {
            const { data } = await api.get(`${STOCK_TRANSFERS}/next-id`, { params: { _ts: Date.now() } });
            const fetchedNextId = String(data.data.nextId);
            setNextId(fetchedNextId);
            skipNextIdLookup.current = true;
            reset(freshForm(fetchedNextId));
            setRowErrors({});
            setIsNewMode(true);
            setIsEditing(true);
        } catch (error) {
            console.error("Failed to fetch next Trans ID", error);
        } finally {
            setIsIdLoading(false);
        }
    };

    const mapTransferToForm = (record: TransferRow): StockTransferFormValues => ({
        id: String(record.id),
        date: record.date ? new Date(record.date).toISOString().split("T")[0] : today(),
        newInventoryId: String(record.newInventoryId),
        newItemName: record.newInventory?.itemName || `Item #${record.newInventoryId}`,
        items: padRows(
            (record.items || []).map((item) => ({
                inventoryId: String(item.inventoryId),
                itemName: item.inventory?.itemName || `Item #${item.inventoryId}`,
                qty: String(item.qty ?? ""),
                handStock: "",
            })),
            defaultRow
        ),
    });

    const withListFields = (item: TransferRow): TransferRow => ({
        ...item,
        date: item.date ? new Date(item.date).toISOString().split("T")[0] : "",
        newItemName: item.newInventory?.itemName || `Item #${item.newInventoryId}`,
        itemsSummary: (item.items || []).map((row) => row.inventory?.itemName).filter(Boolean).join(", "),
    });

    const fetchAllTransfers = async (openModal = true, force = false) => {
        if (openModal) setIsViewAllOpen(true);
        if (hasLoadedTransfers && !force) return;

        setIsTransfersLoading(true);
        setTransfersError("");
        try {
            const { data } = await api.get(STOCK_TRANSFERS);
            setTransfers((data.data || []).map(withListFields));
            setHasLoadedTransfers(true);
        } catch (error: unknown) {
            const apiError = error as ApiError;
            setTransfersError(apiError.response?.data?.message || "Failed to fetch transfers");
        } finally {
            setIsTransfersLoading(false);
        }
    };

    const addTransferToCache = (item: TransferRow) => {
        setTransfers((current) => {
            const cached = withListFields(item);
            const existingIndex = current.findIndex((c) => String(c.id) === String(item.id));
            if (existingIndex === -1) return [...current, cached];
            return current.map((c, index) => (index === existingIndex ? cached : c));
        });
        setHasLoadedTransfers(true);
    };

    useEffect(() => {
        void fetchNextId();
        void fetchAllTransfers(false);
    }, []);

    // Show every problem of the form: field messages under the fields, row problems on the row itself
    const showValidationIssues = (problems: { path: PropertyKey[]; message: string }[]) => {
        const rows: Record<number, { field: string; message: string }> = {};
        for (const issue of problems) {
            const [field, rowIndex, rowField] = issue.path;
            if (field === "items" && typeof rowIndex === "number") {
                if (!rows[rowIndex]) rows[rowIndex] = { field: String(rowField ?? "inventoryId"), message: issue.message };
            } else if (typeof field === "string") {
                setError(field as keyof StockTransferFormValues, { type: "manual", message: issue.message });
            }
        }
        setRowErrors(rows);
        toast.error("Please fix the highlighted fields");
        requestAnimationFrame(() =>
            document
                .querySelector('[aria-invalid="true"], [data-row-error="true"]')
                ?.scrollIntoView({ block: "center", behavior: "smooth" })
        );
    };

    const onSubmit = async (data: StockTransferFormValues) => {
        clearErrors();
        setRowErrors({});
        const validationResult = stockTransferSchema.safeParse(data);
        if (!validationResult.success) {
            showValidationIssues(validationResult.error.issues);
            return;
        }

        // The new item cannot also be an old item
        const clash = data.items.findIndex((row) => row.inventoryId && row.inventoryId === data.newInventoryId);
        if (clash !== -1) {
            setRowErrors({ [clash]: { field: "inventoryId", message: "This is the new item, it cannot also be an old item" } });
            toast.error("The new item cannot also be one of the old items");
            return;
        }

        // Qty cannot be more than the hand stock. The server checks this again with the current stock.
        const overStock = data.items
            .map((row, index) => ({ row, index }))
            .filter(({ row }) => row.inventoryId && row.qty && row.handStock && Number(row.qty) > Number(row.handStock));
        if (overStock.length > 0) {
            const rows: Record<number, { field: string; message: string }> = {};
            for (const { row, index } of overStock) {
                rows[index] = { field: "qty", message: `Qty (${row.qty}) is more than the hand stock (${row.handStock})` };
            }
            setRowErrors(rows);
            const first = overStock[0];
            toast.error(`${first.row.itemName}: Qty (${first.row.qty}) is more than the hand stock (${first.row.handStock})`);
            requestAnimationFrame(() =>
                document.querySelector('[data-row-error="true"]')?.scrollIntoView({ block: "center", behavior: "smooth" })
            );
            return;
        }

        const validRows = data.items.filter((row) => row.inventoryId && row.qty);
        const payload = {
            date: new Date(data.date).toISOString(),
            newInventoryId: Number(data.newInventoryId),
            items: validRows.map((row) => ({
                inventoryId: Number(row.inventoryId),
                qty: Number(row.qty),
            })),
        };

        try {
            const response = isNewMode
                ? await api.post(STOCK_TRANSFERS, payload)
                : await api.put(`${STOCK_TRANSFERS}/${data.id}`, payload);

            toast.success(response.data.message || "Transfer saved successfully");
            if (hasLoadedTransfers) {
                setHasLoadedTransfers(false);
                await fetchAllTransfers(false, true);
            }
            refreshNextIdAfterSubmit.current = true;
        } catch (error: unknown) {
            const apiError = error as ApiError;
            console.error("Transfer save failed:", apiError.response?.data || error);
            toast.error(apiError.response?.data?.message || "Failed to save transfer");
        }
    };

    useEffect(() => {
        if (!isSubmitting && refreshNextIdAfterSubmit.current) {
            refreshNextIdAfterSubmit.current = false;
            void fetchNextId();
        }
    }, [isSubmitting]);

    const debouncedId = useDebounce(values.id, 500);
    const transferColumns: ViewAllColumn<TransferRow>[] = [
        { key: "id", header: "Trans ID" },
        { key: "date", header: "Date" },
        { key: "newItemName", header: "New Item" },
        { key: "qty", header: "Qty" },
        { key: "itemsSummary", header: "Old Items" },
    ];

    useEffect(() => {
        const fetchDebouncedId = async () => {
            if (!debouncedId) return;
            if (skipNextIdLookup.current) {
                skipNextIdLookup.current = false;
                return;
            }

            const resetToNextId = () => {
                reset(freshForm(nextId));
                setRowErrors({});
                setIsNewMode(true);
                setIsEditing(true);
            };

            if (Number(debouncedId) < 1 || debouncedId === nextId) {
                resetToNextId();
                return;
            }

            if (!canView) {
                toast.error("You do not have permission to view or search for this record.");
                resetToNextId();
                return;
            }

            setIsIdLoading(true);
            try {
                const cached = transfers.find((item) => String(item.id) === debouncedId);
                const record: TransferRow | undefined = cached || (await api.get(`${STOCK_TRANSFERS}/${debouncedId}`)).data.data;

                if (!record) {
                    toast.error("Transfer not found");
                    resetToNextId();
                    return;
                }

                if (!cached) addTransferToCache(record);
                reset(mapTransferToForm(record));
                setRowErrors({});
                setIsNewMode(false);
                setIsEditing(false);
            } catch (error: unknown) {
                const apiError = error as ApiError;
                toast.error(
                    apiError.response?.status === 403
                        ? apiError.response?.data?.message || "Access denied. You do not have permission."
                        : "Transfer not found"
                );
                resetToNextId();
            } finally {
                setIsIdLoading(false);
            }
        };

        void fetchDebouncedId();
    }, [debouncedId, nextId, canView, transfers]);

    const updateItemRow = (index: number, field: keyof (typeof initialValues.items)[number], value: string) => {
        setRowErrors({});
        const currentItems = [...values.items];
        let cleanValue = value;
        if (field === "qty") {
            if (!currentItems[index].inventoryId) {
                toast.error(`Row ${index + 1}: Select Item Name first`, { id: `row-hint-${index}` });
                return;
            }
            cleanValue = value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
        }
        currentItems[index] = { ...currentItems[index], [field]: cleanValue };
        setValue("items", currentItems, { shouldDirty: true, shouldValidate: true });
    };

    const rowHasData = (row: (typeof values.items)[number]) => !!(row.inventoryId || row.itemName || row.qty);

    const removeRow = (index: number) => {
        setRowErrors({});
        const remaining = values.items.filter((_, i) => i !== index);
        setValue("items", padRows(remaining, defaultRow), { shouldDirty: true, shouldValidate: true });
    };

    // The item comes from the inventory: its id is the Itcode
    const handleItemSelect = (item: InventoryPickItem) => {
        if (!picker) return;
        setRowErrors({});

        if (picker.kind === "new") {
            const clash = values.items.findIndex((row) => row.inventoryId === String(item.id));
            if (clash !== -1) {
                toast.error(`"${item.itemName}" is already an old item in row ${clash + 1}. The new item must be different.`);
                return;
            }
            setValue("newInventoryId", String(item.id), { shouldDirty: true, shouldValidate: true });
            setValue("newItemName", item.itemName, { shouldDirty: true });
            setPicker(null);
            return;
        }

        if (String(item.id) === values.newInventoryId) {
            toast.error(`"${item.itemName}" is the new item, it cannot also be an old item`);
            return;
        }
        const duplicateIndex = values.items.findIndex((row, i) => i !== picker.index && row.inventoryId === String(item.id));
        if (duplicateIndex !== -1) {
            toast.error(`"${item.itemName}" is already added in row ${duplicateIndex + 1}`);
            return;
        }
        const currentItems = [...values.items];
        currentItems[picker.index] = {
            ...currentItems[picker.index],
            inventoryId: String(item.id),
            itemName: item.itemName,
            handStock: String(item.stock),
        };
        setValue("items", currentItems, { shouldDirty: true, shouldValidate: true });
        setPicker(null);
    };

    // The new item gets the total of the old rows
    const totalQty = values.items.reduce((sum, row) => sum + (Number(row.qty) || 0), 0);

    const readOnlyInput =
        "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none disabled:bg-zinc-50 disabled:text-zinc-400";

    return (
        <section className="mx-auto mt-10 w-full max-w-4xl bg-form-bg p-6 shadow-sm sm:p-8">
            <h1 className="mb-8 text-center text-3xl font-medium tracking-wide text-black sm:text-4xl">
                Transfer Form
            </h1>

            <form
                onSubmit={(event) => {
                    clearErrors();
                    void handleSubmit(onSubmit)(event);
                }}
                noValidate
                className="space-y-6"
            >
                <div className="grid gap-3 md:grid-cols-2">
                    <LabeledField
                        type={isIdLoading ? "text" : "number"}
                        label="Trans ID"
                        value={isIdLoading ? "Loading..." : values.id || ""}
                        onChange={(event) => {
                            if (/^\d*$/.test(event.target.value)) {
                                setValue("id", event.target.value, { shouldDirty: true });
                            }
                        }}
                        onKeyDown={(event) => {
                            if (
                                !/[0-9]/.test(event.key) &&
                                !["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Tab", "Home", "End"].includes(event.key)
                            ) {
                                event.preventDefault();
                            }
                        }}
                        inputMode="numeric"
                        error={errors.id?.message}
                        disabled={isIdLoading}
                        min={1}
                        max={Number(nextId) || 1}
                        wrapperClassName="w-32"
                    />
                    <LabeledField
                        type="date"
                        label="Trans Date"
                        value={values.date}
                        onChange={(event) => setValue("date", event.target.value, { shouldDirty: true, shouldValidate: true })}
                        error={errors.date?.message}
                        disabled={!isEditing}
                    />

                    {/* The NEW item: click to select it from the inventory */}
                    <LabeledField
                        label="New Item Name"
                        value={values.newItemName ?? ""}
                        readOnly
                        onClick={() => isEditing && setPicker({ kind: "new" })}
                        onKeyDown={(event) => {
                            if (isEditing && (event.key === "Enter" || event.key === " ")) {
                                event.preventDefault();
                                setPicker({ kind: "new" });
                            }
                        }}
                        placeholder={isEditing ? "Click to select the new item" : ""}
                        title={isEditing ? "Click to select the new item from inventory" : undefined}
                        error={errors.newInventoryId?.message}
                        disabled={!isEditing}
                        className="cursor-pointer"
                        wrapperClassName="md:col-span-2"
                    />
                    <div>
                        <label className="mb-1 block text-sm text-zinc-600">Itcode</label>
                        <input
                            type="text"
                            value={values.newInventoryId}
                            readOnly
                            tabIndex={-1}
                            disabled={!isEditing}
                            title="Code of the new item (set by selecting the new item)"
                            className={readOnlyInput}
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-sm text-zinc-600">Qty (total of the old items)</label>
                        <input
                            type="text"
                            value={totalQty.toLocaleString()}
                            readOnly
                            tabIndex={-1}
                            disabled={!isEditing}
                            title="Worked out from the old items, it cannot be typed"
                            className={`${readOnlyInput} text-right font-semibold`}
                        />
                    </div>
                </div>

                <div>
                    <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-black">Old Code Information</h2>
                    <div className="max-h-80 overflow-y-auto border border-zinc-400 bg-white">
                        <table className="relative w-full table-fixed border-collapse bg-white text-sm text-black">
                            <thead className="sticky top-0 z-10 bg-white">
                                <tr className="border-b border-zinc-400">
                                    <th className="w-24 border-r border-zinc-400 px-2 py-1.5 text-center font-medium">Itcode</th>
                                    <th className="border-r border-zinc-400 px-2 py-1.5 text-center font-medium">Item Name</th>
                                    <th className="w-32 px-2 py-1.5 text-center font-medium">Qty</th>
                                </tr>
                            </thead>
                            <tbody>
                                {values.items.map((row, index) => (
                                    <tr key={index} className={deletableRowClassName}>
                                        <td className="border-r border-zinc-300 p-0">
                                            <input
                                                type="text"
                                                value={row.inventoryId}
                                                readOnly
                                                tabIndex={-1}
                                                title="Inventory item code (set by selecting Item Name)"
                                                disabled={!isEditing}
                                                className="w-full bg-transparent px-2 py-1.5 text-center text-[13px] outline-none disabled:bg-[#f3f4f6]"
                                            />
                                        </td>
                                        <td className="border-r border-zinc-300 p-0">
                                            <input
                                                type="text"
                                                value={row.itemName}
                                                readOnly
                                                onClick={() => isEditing && setPicker({ kind: "row", index })}
                                                onKeyDown={(e) => {
                                                    if (isEditing && (e.key === "Enter" || e.key === " ")) {
                                                        e.preventDefault();
                                                        setPicker({ kind: "row", index });
                                                    }
                                                }}
                                                placeholder={isEditing ? "Click to select item" : ""}
                                                disabled={!isEditing}
                                                title={isEditing ? "Click to select the old item from inventory" : undefined}
                                                data-row-error={rowErrors[index]?.field === "inventoryId" ? "true" : undefined}
                                                className={`w-full cursor-pointer truncate bg-transparent px-2 py-1.5 text-[13px] outline-none placeholder:text-zinc-400 hover:bg-primary-50 disabled:cursor-default disabled:bg-[#f3f4f6] ${
                                                    rowErrors[index]?.field === "inventoryId" ? "ring-2 ring-inset ring-red-400" : ""
                                                }`}
                                            />
                                        </td>
                                        <td className="relative p-0">
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                value={row.qty ?? ""}
                                                onChange={(e) => updateItemRow(index, "qty", e.target.value)}
                                                disabled={!isEditing}
                                                data-row-error={rowErrors[index]?.field === "qty" ? "true" : undefined}
                                                className={`w-full bg-transparent px-2 py-1.5 pr-8 text-center text-[13px] outline-none disabled:bg-[#f3f4f6] ${
                                                    rowErrors[index]?.field === "qty" ? "ring-2 ring-inset ring-red-400" : ""
                                                }`}
                                            />
                                            {isEditing && rowHasData(row) && (
                                                <RowDeleteButton rowNumber={index + 1} onClick={() => removeRow(index)} />
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-zinc-500">
                        {isEditing ? "Tip: hover a row and click the trash icon to remove it" : ""}
                    </span>
                    <AddRowButton
                        onClick={() => setValue("items", [...values.items, defaultRow()], { shouldDirty: true })}
                        disabled={!isEditing || values.items.length >= MAX_ROWS}
                    />
                </div>
                {errors.items && <p className="text-center text-xs text-red-500">{errors.items.message}</p>}
                {Object.keys(rowErrors).length > 0 && (
                    <ul className="space-y-0.5 text-center text-xs text-red-500">
                        {Object.entries(rowErrors).map(([index, problem]) => (
                            <li key={index}>
                                Row {Number(index) + 1}: {problem.message}
                            </li>
                        ))}
                    </ul>
                )}

                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                    <Button
                        type="button"
                        variant="secondary"
                        shape="rounded"
                        onClick={fetchNextId}
                        disabled={isSubmitting || !canCreate}
                        className="border border-zinc-400 bg-white px-6 hover:bg-zinc-50"
                    >
                        New
                    </Button>
                    <Button
                        type="button"
                        variant="secondary"
                        shape="rounded"
                        onClick={() => fetchAllTransfers()}
                        disabled={isSubmitting || !canView}
                        className="border border-zinc-400 bg-white px-6 hover:bg-zinc-50"
                    >
                        View All
                    </Button>
                    <Button
                        type="button"
                        variant="secondary"
                        shape="rounded"
                        onClick={() => setIsEditing(true)}
                        disabled={isSubmitting || isNewMode || isEditing || !canUpdate}
                        className="border border-zinc-400 bg-white px-6 hover:bg-zinc-50"
                    >
                        Edit
                    </Button>
                    <Button
                        type="submit"
                        variant="secondary"
                        shape="rounded"
                        isLoading={isSubmitting}
                        disabled={!isEditing || (isNewMode ? !canCreate : !canUpdate)}
                        className="border border-zinc-400 bg-white px-8 hover:bg-zinc-50"
                    >
                        Save
                    </Button>
                </div>
            </form>

            <InventoryPickerModal
                isOpen={picker !== null}
                title={
                    picker?.kind === "new"
                        ? "Select New Item"
                        : `Select Old Item${picker?.kind === "row" ? ` (Row ${picker.index + 1})` : ""}`
                }
                onClose={() => setPicker(null)}
                onSelect={handleItemSelect}
            />

            <ViewAllModal
                key={isViewAllOpen ? "open" : "closed"}
                isOpen={isViewAllOpen}
                title="All Transfers"
                rows={transfers}
                columns={transferColumns}
                searchKeys={["id", "date", "newItemName", "itemsSummary"]}
                isLoading={isTransfersLoading}
                error={transfersError}
                onClose={() => setIsViewAllOpen(false)}
                onRowSelect={(item) => {
                    reset(mapTransferToForm(item));
                    setRowErrors({});
                    setIsNewMode(false);
                    setIsEditing(false);
                    setIsViewAllOpen(false);
                }}
                onDelete={() => undefined}
            />
        </section>
    );
}
