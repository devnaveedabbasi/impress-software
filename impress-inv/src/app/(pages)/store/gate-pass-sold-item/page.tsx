"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { LabeledField } from "@/components/ui/LabeledField";
import { Button } from "@/components/ui/Button";
import useDebounce from "@/hooks/useDebounce";
import { saleGatePassSchema, type SaleGatePassFormValues } from "@/lib/validations/master";
import { SALE_GATE_PASSES } from "@/utlis/apiRoutes";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { ViewAllModal, type ViewAllColumn } from "@/components/ui/ViewAllModal";
import { InventoryPickerModal, type InventoryPickItem } from "@/components/ui/InventoryPickerModal";
import { RowDeleteButton, deletableRowClassName } from "@/components/ui/RowDeleteButton";
import { AddRowButton } from "@/components/ui/AddRowButton";
import { DetailField } from "@/components/ui/DetailField";

type GatePassItemRow = {
    id: number;
    inventoryId: number;
    inventory?: { id: number; itemName: string } | null;
    unit: string;
    stockInHand: number;
    qty: number;
};

type GatePassRow = {
    id: number;
    date: string;
    accountName: string;
    billNO?: number | null;
    throughBy: string;
    remarks: string;
    vehicleNo: string;
    items?: GatePassItemRow[];
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
const padRows = <T,>(rows: T[], makeRow: () => T): T[] => {
    const padded = [...rows];
    while (padded.length < MIN_ROWS) padded.push(makeRow());
    return padded;
};

const defaultRow = () => ({ inventoryId: "", itemName: "", unit: "", stockInHand: "", qty: "" });

const today = () => new Date().toISOString().split("T")[0];

const initialValues: SaleGatePassFormValues = {
    id: "",
    date: today(),
    accountName: "",
    billNO: "",
    throughBy: "",
    remarks: "",
    vehicleNo: "",
    items: Array.from({ length: MIN_ROWS }, defaultRow),
};

// Part Sale Gate Pass (Gate Pass for Sold Item): the parts leaving the store for a customer
export default function GatePassSoldItemPage() {
    const [isNewMode, setIsNewMode] = useState(true);
    const [isEditing, setIsEditing] = useState(true);
    const [pickerRowIndex, setPickerRowIndex] = useState<number | null>(null);
    // Problems found in the item rows: which cell of which row is wrong and why
    const [rowErrors, setRowErrors] = useState<Record<number, { field: string; message: string }>>({});

    const { hasPermission } = usePermissions();
    const canCreate = hasPermission("sale_gate_pass", "create");
    const canUpdate = hasPermission("sale_gate_pass", "update");
    const canView = hasPermission("sale_gate_pass", "view");

    const [isIdLoading, setIsIdLoading] = useState(true);
    const [nextId, setNextId] = useState("");
    const [isViewAllOpen, setIsViewAllOpen] = useState(false);
    const [gatePasses, setGatePasses] = useState<GatePassRow[]>([]);
    const [hasLoadedGatePasses, setHasLoadedGatePasses] = useState(false);
    const [isGatePassesLoading, setIsGatePassesLoading] = useState(false);
    const [gatePassesError, setGatePassesError] = useState("");
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
    } = useForm<SaleGatePassFormValues>({ defaultValues: initialValues });
    const values = watch();

    const freshForm = (id: string): SaleGatePassFormValues => ({
        ...initialValues,
        id,
        date: today(),
        items: Array.from({ length: MIN_ROWS }, defaultRow),
    });

    const fetchNextId = async () => {
        setIsIdLoading(true);
        try {
            const { data } = await api.get(`${SALE_GATE_PASSES}/next-id`, {
                params: { _ts: Date.now() },
            });
            const fetchedNextId = String(data.data.nextId);
            setNextId(fetchedNextId);
            skipNextIdLookup.current = true;
            reset(freshForm(fetchedNextId));
            setIsNewMode(true);
            setIsEditing(true);
        } catch (error) {
            console.error("Failed to fetch next gate pass ID", error);
        } finally {
            setIsIdLoading(false);
        }
    };

    const mapGatePassToForm = (gatePass: GatePassRow): SaleGatePassFormValues => ({
        id: String(gatePass.id),
        date: gatePass.date ? new Date(gatePass.date).toISOString().split("T")[0] : today(),
        accountName: gatePass.accountName || "",
        billNO: gatePass.billNO !== undefined && gatePass.billNO !== null ? String(gatePass.billNO) : "",
        throughBy: gatePass.throughBy || "",
        remarks: gatePass.remarks || "",
        vehicleNo: gatePass.vehicleNo || "",
        items: padRows(
            (gatePass.items || []).map((item) => ({
                inventoryId: String(item.inventoryId),
                itemName: item.inventory?.itemName || `Item #${item.inventoryId}`,
                unit: item.unit || "",
                stockInHand: String(item.stockInHand ?? 0),
                qty: String(item.qty ?? ""),
            })),
            defaultRow
        ),
    });

    const withListFields = (item: GatePassRow): GatePassRow => ({
        ...item,
        date: item.date ? new Date(item.date).toISOString().split("T")[0] : "",
        itemsSummary: (item.items || []).map((row) => row.inventory?.itemName).filter(Boolean).join(", "),
    });

    const fetchAllGatePasses = async (openModal = true, force = false) => {
        if (openModal) setIsViewAllOpen(true);
        if (hasLoadedGatePasses && !force) return;

        setIsGatePassesLoading(true);
        setGatePassesError("");
        try {
            const { data } = await api.get(SALE_GATE_PASSES);
            setGatePasses((data.data || []).map(withListFields));
            setHasLoadedGatePasses(true);
        } catch (error: unknown) {
            const apiError = error as ApiError;
            setGatePassesError(apiError.response?.data?.message || "Failed to fetch gate passes");
        } finally {
            setIsGatePassesLoading(false);
        }
    };

    const addGatePassToCache = (item: GatePassRow) => {
        setGatePasses((current) => {
            const cached = withListFields(item);
            const existingIndex = current.findIndex((c) => String(c.id) === String(item.id));
            if (existingIndex === -1) return [...current, cached];
            return current.map((c, index) => (index === existingIndex ? cached : c));
        });
        setHasLoadedGatePasses(true);
    };

    useEffect(() => {
        void fetchNextId();
        void fetchAllGatePasses(false);
    }, []);

    // Show every problem of the form: field messages under the fields, row problems on the row itself
    const showValidationIssues = (issues: { path: PropertyKey[]; message: string }[]) => {
        const rows: Record<number, { field: string; message: string }> = {};
        for (const issue of issues) {
            const [field, rowIndex, rowField] = issue.path;
            if (field === "items" && typeof rowIndex === "number") {
                if (!rows[rowIndex]) rows[rowIndex] = { field: String(rowField ?? "inventoryId"), message: issue.message };
            } else if (typeof field === "string") {
                setError(field as keyof SaleGatePassFormValues, { type: "manual", message: issue.message });
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

    const onSubmit = async (data: SaleGatePassFormValues) => {
        clearErrors();
        setRowErrors({});
        const validationResult = saleGatePassSchema.safeParse(data);
        if (!validationResult.success) {
            showValidationIssues(validationResult.error.issues);
            return;
        }

        const validRows = data.items.filter((row) => row.inventoryId && row.qty);
        const payload = {
            date: new Date(data.date).toISOString(),
            accountName: data.accountName.trim(),
            billNO: data.billNO ? Number(data.billNO) : null,
            throughBy: (data.throughBy ?? "").trim(),
            remarks: (data.remarks ?? "").trim(),
            vehicleNo: (data.vehicleNo ?? "").trim(),
            items: validRows.map((row) => ({
                inventoryId: Number(row.inventoryId),
                unit: (row.unit ?? "").trim(),
                qty: Number(row.qty),
            })),
        };

        // The old system allowed stock to go below zero, so this only warns and does not block
        const overStock = validRows
            .filter((row) => Number(row.qty) > Number(row.stockInHand || 0))
            .map((row) => row.itemName);

        try {
            const response = isNewMode
                ? await api.post(SALE_GATE_PASSES, payload)
                : await api.put(`${SALE_GATE_PASSES}/${data.id}`, payload);

            toast.success(response.data.message || "Gate pass saved successfully");
            if (overStock.length > 0) {
                toast(`Qty is more than the stock in hand for: ${overStock.join(", ")}`, {
                    icon: "⚠️",
                    duration: 6000,
                });
            }
            if (hasLoadedGatePasses) {
                setHasLoadedGatePasses(false);
                await fetchAllGatePasses(false, true);
            }
            refreshNextIdAfterSubmit.current = true;
        } catch (error: unknown) {
            const apiError = error as ApiError;
            console.error("Gate pass save failed:", apiError.response?.data || error);
            toast.error(apiError.response?.data?.message || "Failed to save gate pass");
        }
    };

    useEffect(() => {
        if (!isSubmitting && refreshNextIdAfterSubmit.current) {
            refreshNextIdAfterSubmit.current = false;
            void fetchNextId();
        }
    }, [isSubmitting]);

    const debouncedId = useDebounce(values.id, 500);
    const gatePassColumns: ViewAllColumn<GatePassRow>[] = [
        { key: "id", header: "Gate Pass No" },
        { key: "date", header: "Date" },
        { key: "accountName", header: "Account" },
        { key: "vehicleNo", header: "Vehicle No" },
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
                const cached = gatePasses.find((item) => String(item.id) === debouncedId);
                const gatePass: GatePassRow | undefined =
                    cached || (await api.get(`${SALE_GATE_PASSES}/${debouncedId}`)).data.data;

                if (!gatePass) {
                    toast.error("Gate pass not found");
                    resetToNextId();
                    return;
                }

                if (!cached) addGatePassToCache(gatePass);
                reset(mapGatePassToForm(gatePass));
                setIsNewMode(false);
                setIsEditing(false);
            } catch (error: unknown) {
                const apiError = error as ApiError;
                toast.error(
                    apiError.response?.status === 403
                        ? apiError.response?.data?.message || "Access denied. You do not have permission."
                        : "Gate pass not found"
                );
                resetToNextId();
            } finally {
                setIsIdLoading(false);
            }
        };

        void fetchDebouncedId();
    }, [debouncedId, nextId, canView, gatePasses]);

    const updateItemRow = (index: number, field: keyof (typeof initialValues.items)[number], value: string) => {
        setRowErrors({});
        const currentItems = [...values.items];
        let cleanValue = value;
        if (field === "qty") cleanValue = value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
        if (field === "qty" && !currentItems[index].inventoryId) {
            toast.error(`Row ${index + 1}: Select Item Name first`, { id: `row-hint-${index}` });
            return;
        }
        currentItems[index] = { ...currentItems[index], [field]: cleanValue };
        setValue("items", currentItems, { shouldDirty: true, shouldValidate: true });
    };

    const rowHasData = (row: (typeof values.items)[number]) =>
        !!(row.inventoryId || row.itemName || row.unit || row.qty);

    const removeRow = (index: number) => {
        setRowErrors({});
        const remaining = values.items.filter((_, i) => i !== index);
        setValue("items", padRows(remaining, defaultRow), { shouldDirty: true, shouldValidate: true });
    };

    const addRow = () => {
        setValue("items", [...values.items, defaultRow()], { shouldDirty: true });
    };

    // The item comes from the inventory: its id is the Code, and its current stock is shown as Stock in Hand
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
            stockInHand: String(item.stock),
        };
        setValue("items", currentItems, { shouldDirty: true, shouldValidate: true });
        setPickerRowIndex(null);
    };

    const totalQty = values.items.reduce((sum, row) => sum + (Number(row.qty) || 0), 0);

    const handlePrint = () => {
        if (isNewMode || !values.id) {
            toast.error("Open a saved gate pass first (enter its number or use View All) to print it");
            return;
        }
        window.open(`/print/sale-gate-pass-slip?id=${values.id}`, "_blank");
    };

    return (
        <section className="mx-auto mt-10 w-full max-w-5xl bg-form-bg p-6 shadow-sm sm:p-8">
            <h1 className="mb-8 text-center text-3xl font-medium tracking-wide text-black sm:text-4xl">
                Part Sale Gate Pass
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
                        label="Gate Pass No"
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
                        label="Date"
                        value={values.date}
                        onChange={(event) =>
                            setValue("date", event.target.value, { shouldDirty: true, shouldValidate: true })
                        }
                        error={errors.date?.message}
                        disabled={!isEditing}
                    />

                    <LabeledField
                        label="Account Name"
                        value={values.accountName}
                        onChange={(event) =>
                            setValue("accountName", event.target.value, { shouldDirty: true, shouldValidate: true })
                        }
                        error={errors.accountName?.message}
                        disabled={!isEditing}
                        maxLength={100}
                        wrapperClassName="md:col-span-2"
                    />

                    <LabeledField
                        type="number"
                        label="Bill No (optional)"
                        value={values.billNO ?? ""}
                        onChange={(event) =>
                            setValue("billNO", event.target.value, { shouldDirty: true, shouldValidate: true })
                        }
                        error={errors.billNO?.message}
                        disabled={!isEditing}
                        min={0}
                    />
                    <LabeledField
                        label="Through By"
                        value={values.throughBy ?? ""}
                        onChange={(event) =>
                            setValue("throughBy", event.target.value, { shouldDirty: true, shouldValidate: true })
                        }
                        error={errors.throughBy?.message}
                        disabled={!isEditing}
                        maxLength={100}
                    />

                    <LabeledField
                        label="Vehicle No"
                        value={values.vehicleNo ?? ""}
                        onChange={(event) =>
                            setValue("vehicleNo", event.target.value, { shouldDirty: true, shouldValidate: true })
                        }
                        error={errors.vehicleNo?.message}
                        disabled={!isEditing}
                        maxLength={20}
                    />
                    <DetailField
                        label="Remarks"
                        value={values.remarks ?? ""}
                        onChange={(text) => setValue("remarks", text, { shouldDirty: true, shouldValidate: true })}
                        error={errors.remarks?.message}
                        disabled={!isEditing}
                        maxLength={255}
                        placeholder="Click to add remarks"
                    />
                </div>

                <div className="max-h-100 overflow-y-auto border border-zinc-400 bg-white">
                    <table className="relative w-full table-fixed border-collapse bg-white text-sm text-black">
                        <thead className="sticky top-0 z-10 bg-white">
                            <tr className="border-b border-zinc-400">
                                <th className="w-20 border-r border-zinc-400 px-2 py-1.5 text-center font-medium">Code</th>
                                <th className="border-r border-zinc-400 px-2 py-1.5 text-center font-medium">Item Name</th>
                                <th className="w-24 border-r border-zinc-400 px-2 py-1.5 text-center font-medium">Unit</th>
                                <th className="w-28 border-r border-zinc-400 px-2 py-1.5 text-center font-medium">
                                    Stock in Hand
                                </th>
                                <th className="w-28 px-2 py-1.5 text-center font-medium">Qty</th>
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
                                            className={`w-full cursor-pointer truncate bg-transparent px-2 py-1.5 text-[13px] outline-none placeholder:text-zinc-400 hover:bg-primary-50 disabled:cursor-default disabled:bg-[#f3f4f6] ${rowErrors[index]?.field === "inventoryId" ? "ring-2 ring-inset ring-red-400" : ""}`}
                                        />
                                    </td>
                                    <td className="border-r border-zinc-300 p-0">
                                        <input
                                            type="text"
                                            value={row.unit ?? ""}
                                            onChange={(e) => updateItemRow(index, "unit", e.target.value)}
                                            disabled={!isEditing}
                                            maxLength={20}
                                            className="w-full bg-transparent px-2 py-1.5 text-center text-[13px] outline-none disabled:bg-[#f3f4f6]"
                                        />
                                    </td>
                                    <td className="border-r border-zinc-300 p-0">
                                        <input
                                            type="text"
                                            value={row.stockInHand ?? ""}
                                            readOnly
                                            tabIndex={-1}
                                            title="Stock of this item when the gate pass is issued"
                                            disabled={!isEditing}
                                            className="w-full bg-transparent px-2 py-1.5 text-center text-[13px] outline-none disabled:bg-[#f3f4f6]"
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
                                            className={`w-full bg-transparent px-2 py-1.5 pr-8 text-center text-[13px] outline-none disabled:bg-[#f3f4f6] ${rowErrors[index]?.field === "qty" ? "ring-2 ring-inset ring-red-400" : ""}`}
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
                            Total Qty: <span className="font-semibold text-black">{totalQty.toLocaleString()}</span>
                        </span>
                        <AddRowButton onClick={addRow} disabled={!isEditing} />
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
                        onClick={() => fetchAllGatePasses()}
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
                        title={isNewMode ? "Open a saved gate pass to print it" : "Print this gate pass"}
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
                title="All Part Sale Gate Passes"
                rows={gatePasses}
                columns={gatePassColumns}
                searchKeys={["id", "date", "accountName", "vehicleNo", "itemsSummary"]}
                isLoading={isGatePassesLoading}
                error={gatePassesError}
                onClose={() => setIsViewAllOpen(false)}
                onRowSelect={(item) => {
                    reset(mapGatePassToForm(item));
                    setIsNewMode(false);
                    setIsEditing(false);
                    setIsViewAllOpen(false);
                }}
                onDelete={() => undefined}
            />
        </section>
    );
}
