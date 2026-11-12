"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { LabeledField } from "@/components/ui/LabeledField";
import { LabeledSelect } from "@/components/ui/LabeledSelect";
import { Button } from "@/components/ui/Button";
import useDebounce from "@/hooks/useDebounce";
import { itemReturnSchema, type ItemReturnFormValues } from "@/lib/validations/master";
import { ITEM_RETURNS, DEPARTMENTS } from "@/utlis/apiRoutes";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { ViewAllModal, type ViewAllColumn } from "@/components/ui/ViewAllModal";
import { InventoryPickerModal, type InventoryPickItem } from "@/components/ui/InventoryPickerModal";
import { RowDeleteButton, deletableRowClassName } from "@/components/ui/RowDeleteButton";
import { AddRowButton } from "@/components/ui/AddRowButton";

type Option = { label: string; value: string };

type ReturnItemRow = {
    id: number;
    inventoryId: number;
    inventory?: { id: number; itemName: string } | null;
    recvdQty: number;
    purpose: string;
};

type ItemReturnRow = {
    id: number; // the Requisition Slip No
    date: string;
    departmentId: number;
    department?: { id: number; name: string } | null;
    items?: ReturnItemRow[];
    departmentName?: string;
    itemsSummary?: string;
    [key: string]: unknown;
};

type ApiError = {
    response?: {
        status?: number;
        data?: { message?: string };
    };
};

const MIN_ROWS = 10;
const MAX_ROWS = 500;
const padRows = <T,>(rows: T[], makeRow: () => T): T[] => {
    const padded = [...rows];
    while (padded.length < MIN_ROWS) padded.push(makeRow());
    return padded;
};

const defaultRow = () => ({ inventoryId: "", itemName: "", recvdQty: "", purpose: "" });
const today = () => new Date().toISOString().split("T")[0];

const initialValues: ItemReturnFormValues = {
    id: "",
    date: today(),
    departmentId: "",
    items: Array.from({ length: MIN_ROWS }, defaultRow),
};

// Item Return from Department ("Rejection Received"): parts a department gives back to the store.
// The Requisition Slip No is the automatic id of the slip.
export default function ItemReturnFromDepartmentPage() {
    const [isNewMode, setIsNewMode] = useState(true);
    const [isEditing, setIsEditing] = useState(true);
    const [pickerRowIndex, setPickerRowIndex] = useState<number | null>(null);
    // Problems found in the item rows: which cell of which row is wrong and why
    const [rowErrors, setRowErrors] = useState<Record<number, { field: string; message: string }>>({});

    const [departments, setDepartments] = useState<Option[]>([]);
    const [isOptionsLoading, setIsOptionsLoading] = useState(true);

    const { hasPermission } = usePermissions();
    const canCreate = hasPermission("item_return_from_department", "create");
    const canUpdate = hasPermission("item_return_from_department", "update");
    const canView = hasPermission("item_return_from_department", "view");

    const [isIdLoading, setIsIdLoading] = useState(true);
    const [nextId, setNextId] = useState("");
    const [isViewAllOpen, setIsViewAllOpen] = useState(false);
    const [returns, setReturns] = useState<ItemReturnRow[]>([]);
    const [hasLoadedReturns, setHasLoadedReturns] = useState(false);
    const [isReturnsLoading, setIsReturnsLoading] = useState(false);
    const [returnsError, setReturnsError] = useState("");
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
    } = useForm<ItemReturnFormValues>({ defaultValues: initialValues });
    const values = watch();

    const freshForm = (id: string): ItemReturnFormValues => ({
        ...initialValues,
        id,
        date: today(),
        items: Array.from({ length: MIN_ROWS }, defaultRow),
    });

    const fetchDepartments = async () => {
        try {
            const { data } = await api.get(DEPARTMENTS);
            setDepartments(
                (data.data || []).map((d: { id: number; name: string }) => ({ label: d.name, value: String(d.id) }))
            );
        } catch (error) {
            console.error("Failed to load departments", error);
            toast.error("Failed to load departments");
        } finally {
            setIsOptionsLoading(false);
        }
    };

    const fetchNextId = async () => {
        setIsIdLoading(true);
        try {
            const { data } = await api.get(`${ITEM_RETURNS}/next-id`, { params: { _ts: Date.now() } });
            const fetchedNextId = String(data.data.nextId);
            setNextId(fetchedNextId);
            skipNextIdLookup.current = true;
            reset(freshForm(fetchedNextId));
            setRowErrors({});
            setIsNewMode(true);
            setIsEditing(true);
        } catch (error) {
            console.error("Failed to fetch next Requisition Slip No", error);
        } finally {
            setIsIdLoading(false);
        }
    };

    const mapReturnToForm = (record: ItemReturnRow): ItemReturnFormValues => ({
        id: String(record.id),
        date: record.date ? new Date(record.date).toISOString().split("T")[0] : today(),
        departmentId: String(record.departmentId),
        items: padRows(
            (record.items || []).map((item) => ({
                inventoryId: String(item.inventoryId),
                itemName: item.inventory?.itemName || `Item #${item.inventoryId}`,
                recvdQty: String(item.recvdQty ?? ""),
                purpose: item.purpose || "",
            })),
            defaultRow
        ),
    });

    const withListFields = (item: ItemReturnRow): ItemReturnRow => ({
        ...item,
        date: item.date ? new Date(item.date).toISOString().split("T")[0] : "",
        departmentName: item.department?.name || `Department #${item.departmentId}`,
        itemsSummary: (item.items || []).map((row) => row.inventory?.itemName).filter(Boolean).join(", "),
    });

    const fetchAllReturns = async (openModal = true, force = false) => {
        if (openModal) setIsViewAllOpen(true);
        if (hasLoadedReturns && !force) return;

        setIsReturnsLoading(true);
        setReturnsError("");
        try {
            const { data } = await api.get(ITEM_RETURNS);
            setReturns((data.data || []).map(withListFields));
            setHasLoadedReturns(true);
        } catch (error: unknown) {
            const apiError = error as ApiError;
            setReturnsError(apiError.response?.data?.message || "Failed to fetch return slips");
        } finally {
            setIsReturnsLoading(false);
        }
    };

    const addReturnToCache = (item: ItemReturnRow) => {
        setReturns((current) => {
            const cached = withListFields(item);
            const existingIndex = current.findIndex((c) => String(c.id) === String(item.id));
            if (existingIndex === -1) return [...current, cached];
            return current.map((c, index) => (index === existingIndex ? cached : c));
        });
        setHasLoadedReturns(true);
    };

    useEffect(() => {
        void fetchNextId();
        void fetchDepartments();
        void fetchAllReturns(false);
    }, []);

    // Show every problem of the form: field messages under the fields, row problems on the row itself
    const showValidationIssues = (problems: { path: PropertyKey[]; message: string }[]) => {
        const rows: Record<number, { field: string; message: string }> = {};
        for (const issue of problems) {
            const [field, rowIndex, rowField] = issue.path;
            if (field === "items" && typeof rowIndex === "number") {
                if (!rows[rowIndex]) rows[rowIndex] = { field: String(rowField ?? "inventoryId"), message: issue.message };
            } else if (typeof field === "string") {
                setError(field as keyof ItemReturnFormValues, { type: "manual", message: issue.message });
            }
        }
        setRowErrors(rows);
        toast.error("Please fix the highlighted fields");
        // Bring the first problem into view
        requestAnimationFrame(() =>
            document
                .querySelector('[aria-invalid="true"], [data-row-error="true"]')
                ?.scrollIntoView({ block: "center", behavior: "smooth" })
        );
    };

    const onSubmit = async (data: ItemReturnFormValues) => {
        clearErrors();
        setRowErrors({});
        const validationResult = itemReturnSchema.safeParse(data);
        if (!validationResult.success) {
            showValidationIssues(validationResult.error.issues);
            return;
        }

        const validRows = data.items.filter((row) => row.inventoryId && row.recvdQty);
        const payload = {
            date: new Date(data.date).toISOString(),
            departmentId: Number(data.departmentId),
            items: validRows.map((row) => ({
                inventoryId: Number(row.inventoryId),
                recvdQty: Number(row.recvdQty),
                purpose: (row.purpose ?? "").trim(),
            })),
        };

        try {
            const response = isNewMode
                ? await api.post(ITEM_RETURNS, payload)
                : await api.put(`${ITEM_RETURNS}/${data.id}`, payload);

            toast.success(response.data.message || "Return slip saved successfully");
            for (const warning of (response.data.warnings as string[] | undefined) ?? []) {
                toast(warning, { icon: "⚠️", duration: 7000 });
            }
            if (hasLoadedReturns) {
                setHasLoadedReturns(false);
                await fetchAllReturns(false, true);
            }
            refreshNextIdAfterSubmit.current = true;
        } catch (error: unknown) {
            const apiError = error as ApiError;
            console.error("Item return save failed:", apiError.response?.data || error);
            toast.error(apiError.response?.data?.message || "Failed to save return slip");
        }
    };

    useEffect(() => {
        if (!isSubmitting && refreshNextIdAfterSubmit.current) {
            refreshNextIdAfterSubmit.current = false;
            void fetchNextId();
        }
    }, [isSubmitting]);

    const debouncedId = useDebounce(values.id, 500);
    const returnColumns: ViewAllColumn<ItemReturnRow>[] = [
        { key: "id", header: "Slip No" },
        { key: "date", header: "Date" },
        { key: "departmentName", header: "Department" },
        { key: "itemsSummary", header: "Items" },
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
                const cached = returns.find((item) => String(item.id) === debouncedId);
                const record: ItemReturnRow | undefined = cached || (await api.get(`${ITEM_RETURNS}/${debouncedId}`)).data.data;

                if (!record) {
                    toast.error("Return slip not found");
                    resetToNextId();
                    return;
                }

                if (!cached) addReturnToCache(record);
                reset(mapReturnToForm(record));
                setRowErrors({});
                setIsNewMode(false);
                setIsEditing(false);
            } catch (error: unknown) {
                const apiError = error as ApiError;
                toast.error(
                    apiError.response?.status === 403
                        ? apiError.response?.data?.message || "Access denied. You do not have permission."
                        : "Return slip not found"
                );
                resetToNextId();
            } finally {
                setIsIdLoading(false);
            }
        };

        void fetchDebouncedId();
    }, [debouncedId, nextId, canView, returns]);

    const updateItemRow = (index: number, field: keyof (typeof initialValues.items)[number], value: string) => {
        setRowErrors({});
        const currentItems = [...values.items];
        let cleanValue = value;
        if (field === "recvdQty") {
            if (!currentItems[index].inventoryId) {
                toast.error(`Row ${index + 1}: Select Item Description first`, { id: `row-hint-${index}` });
                return;
            }
            cleanValue = value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
        }
        currentItems[index] = { ...currentItems[index], [field]: cleanValue };
        setValue("items", currentItems, { shouldDirty: true, shouldValidate: true });
    };

    const rowHasData = (row: (typeof values.items)[number]) =>
        !!(row.inventoryId || row.itemName || row.recvdQty || row.purpose);

    const removeRow = (index: number) => {
        setRowErrors({});
        const remaining = values.items.filter((_, i) => i !== index);
        setValue("items", padRows(remaining, defaultRow), { shouldDirty: true, shouldValidate: true });
    };

    // The item comes from the inventory: its id is the Code
    const handleItemSelect = (item: InventoryPickItem) => {
        if (pickerRowIndex === null) return;
        setRowErrors({});
        const duplicateIndex = values.items.findIndex(
            (row, i) => i !== pickerRowIndex && row.inventoryId === String(item.id)
        );
        if (duplicateIndex !== -1) {
            toast.error(`"${item.itemName}" is already added in row ${duplicateIndex + 1}`);
            return;
        }
        const currentItems = [...values.items];
        currentItems[pickerRowIndex] = {
            ...currentItems[pickerRowIndex],
            inventoryId: String(item.id),
            itemName: item.itemName,
        };
        setValue("items", currentItems, { shouldDirty: true, shouldValidate: true });
        setPickerRowIndex(null);
    };

    const totalRecvdQty = values.items.reduce((sum, row) => sum + (Number(row.recvdQty) || 0), 0);

    const handlePrint = () => {
        if (isNewMode || !values.id) {
            toast.error("Open a saved slip first (enter its number or use View All) to print it");
            return;
        }
        window.open(`/print/item-return-slip?id=${values.id}`, "_blank");
    };

    return (
        <section className="mx-auto mt-10 w-full max-w-4xl bg-form-bg p-6 shadow-sm sm:p-8">
            <h1 className="mb-8 text-center text-4xl text-black tracking-wide">
                Rejection Received
            </h1>

            <form
                onSubmit={(event) => {
                    // Clear stale manual errors, otherwise handleSubmit blocks onSubmit forever
                    clearErrors();
                    void handleSubmit(onSubmit)(event);
                }}
                noValidate
                className="space-y-6"
            >
                <div className="grid gap-3 md:grid-cols-2">
                    <LabeledField
                        type={isIdLoading ? "text" : "number"}
                        label="Requisition Slip #"
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
                        label="Requisition Date"
                        value={values.date}
                        onChange={(event) =>
                            setValue("date", event.target.value, { shouldDirty: true, shouldValidate: true })
                        }
                        error={errors.date?.message}
                        disabled={!isEditing}
                    />

                    <LabeledSelect
                        label="Department"
                        options={departments}
                        value={values.departmentId}
                        onChange={(value) =>
                            setValue("departmentId", value, { shouldDirty: true, shouldValidate: true })
                        }
                        error={errors.departmentId?.message}
                        disabled={!isEditing || isOptionsLoading}
                        placeholder={isOptionsLoading ? "Loading departments..." : "Select Department"}
                        wrapperClassName="md:col-span-2"
                    />
                </div>

                <div className="max-h-100 overflow-y-auto border border-zinc-400 bg-white">
                    <table className="relative w-full table-fixed border-collapse bg-white text-sm text-black">
                        <thead className="sticky top-0 z-10 bg-white">
                            <tr className="border-b border-zinc-400">
                                <th className="w-20 border-r border-zinc-400 px-2 py-1.5 text-center font-medium">Code</th>
                                <th className="border-r border-zinc-400 px-2 py-1.5 text-center font-medium">
                                    Item Description
                                </th>
                                <th className="w-28 border-r border-zinc-400 px-2 py-1.5 text-center font-medium">
                                    Recvd Qty
                                </th>
                                <th className="w-1/3 px-2 py-1.5 text-center font-medium">Purpose</th>
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
                                            title="Inventory item code (set by selecting Item Description)"
                                            disabled={!isEditing}
                                            className="w-full bg-transparent px-2 py-1.5 text-center text-[13px] outline-none disabled:bg-[#f3f4f6]"
                                        />
                                    </td>
                                    <td className="border-r border-zinc-300 p-0">
                                        <input
                                            type="text"
                                            value={row.itemName}
                                            readOnly
                                            onClick={() => isEditing && setPickerRowIndex(index)}
                                            onKeyDown={(e) => {
                                                if (isEditing && (e.key === "Enter" || e.key === " ")) {
                                                    e.preventDefault();
                                                    setPickerRowIndex(index);
                                                }
                                            }}
                                            placeholder={isEditing ? "Click to select item" : ""}
                                            disabled={!isEditing}
                                            title={isEditing ? "Click to select item from inventory" : undefined}
                                            data-row-error={rowErrors[index]?.field === "inventoryId" ? "true" : undefined}
                                            className={`w-full cursor-pointer truncate bg-transparent px-2 py-1.5 text-[13px] outline-none placeholder:text-zinc-400 hover:bg-primary-50 disabled:cursor-default disabled:bg-[#f3f4f6] ${
                                                rowErrors[index]?.field === "inventoryId" ? "ring-2 ring-inset ring-red-400" : ""
                                            }`}
                                        />
                                    </td>
                                    <td className="border-r border-zinc-300 p-0">
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            value={row.recvdQty ?? ""}
                                            onChange={(e) => updateItemRow(index, "recvdQty", e.target.value)}
                                            disabled={!isEditing}
                                            data-row-error={rowErrors[index]?.field === "recvdQty" ? "true" : undefined}
                                            className={`w-full bg-transparent px-2 py-1.5 text-center text-[13px] outline-none disabled:bg-[#f3f4f6] ${
                                                rowErrors[index]?.field === "recvdQty" ? "ring-2 ring-inset ring-red-400" : ""
                                            }`}
                                        />
                                    </td>
                                    <td className="relative p-0">
                                        <input
                                            type="text"
                                            value={row.purpose ?? ""}
                                            onChange={(e) => updateItemRow(index, "purpose", e.target.value)}
                                            disabled={!isEditing}
                                            maxLength={100}
                                            title={row.purpose || undefined}
                                            className="w-full truncate bg-transparent px-2 py-1.5 pr-8 text-[13px] outline-none disabled:bg-[#f3f4f6]"
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

                <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-zinc-500">
                        {isEditing ? "Tip: hover a row and click the trash icon to remove it" : ""}
                    </span>
                    <div className="flex items-center gap-4">
                        <span className="text-sm text-zinc-700">
                            Total Recvd Qty:{" "}
                            <span className="font-semibold text-black">{totalRecvdQty.toLocaleString()}</span>
                        </span>
                        <AddRowButton
                            onClick={() => setValue("items", [...values.items, defaultRow()], { shouldDirty: true })}
                            disabled={!isEditing || values.items.length >= MAX_ROWS}
                        />
                    </div>
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
                        onClick={() => fetchAllReturns()}
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
                    <Button
                        type="button"
                        variant="secondary"
                        shape="rounded"
                        onClick={handlePrint}
                        disabled={isSubmitting || isNewMode || !canView}
                        title={isNewMode ? "Open a saved slip to print it" : "Print this slip"}
                        className="border border-zinc-400 bg-white px-6 hover:bg-zinc-50"
                    >
                        Print
                    </Button>
                </div>
            </form>

            <InventoryPickerModal
                isOpen={pickerRowIndex !== null}
                title={`Select Item${pickerRowIndex !== null ? ` (Row ${pickerRowIndex + 1})` : ""}`}
                onClose={() => setPickerRowIndex(null)}
                onSelect={handleItemSelect}
            />

            <ViewAllModal
                key={isViewAllOpen ? "open" : "closed"}
                isOpen={isViewAllOpen}
                title="All Rejection Received Slips"
                rows={returns}
                columns={returnColumns}
                searchKeys={["id", "date", "departmentName", "itemsSummary"]}
                isLoading={isReturnsLoading}
                error={returnsError}
                onClose={() => setIsViewAllOpen(false)}
                onRowSelect={(item) => {
                    reset(mapReturnToForm(item));
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
