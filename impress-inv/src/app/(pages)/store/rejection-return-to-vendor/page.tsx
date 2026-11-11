"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { LabeledField } from "@/components/ui/LabeledField";
import { Button } from "@/components/ui/Button";
import useDebounce from "@/hooks/useDebounce";
import {
    rejectionReturnToVendorSchema,
    type RejectionReturnToVendorFormValues,
} from "@/lib/validations/master";
import { REJECTION_RETURN_TO_VENDOR } from "@/utlis/apiRoutes";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { ViewAllModal, type ViewAllColumn } from "@/components/ui/ViewAllModal";
import { InventoryPickerModal, type InventoryPickItem } from "@/components/ui/InventoryPickerModal";
import { VendorPickerModal, type VendorPickItem } from "@/components/ui/VendorPickerModal";
import { RowDeleteButton, deletableRowClassName } from "@/components/ui/RowDeleteButton";
import { AddRowButton } from "@/components/ui/AddRowButton";

type ReturnItemRow = {
    id: number;
    inventoryId: number;
    inventory?: { id: number; itemName: string } | null;
    rej: number;
    report: string;
};

type RejectionReturnRow = {
    id: number; // the Claim Note No
    date: string;
    vendorId: number;
    vendor?: { id: number; vendorName: string } | null;
    vendorName?: string;
    address: string;
    contactNo: string;
    saleTaxNo: string;
    transport: string;
    builtyNo: string;
    bookNo: string;
    receivedBy: string;
    items?: ReturnItemRow[];
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

const defaultRow = () => ({ inventoryId: "", itemName: "", rej: "", report: "" });
const today = () => new Date().toISOString().split("T")[0];

const initialValues: RejectionReturnToVendorFormValues = {
    id: "",
    date: today(),
    vendorId: "",
    vendorName: "",
    address: "",
    contactNo: "",
    saleTaxNo: "",
    transport: "",
    builtyNo: "",
    bookNo: "",
    receivedBy: "",
    items: Array.from({ length: MIN_ROWS }, defaultRow),
};

// Rejection Return To Vendor Gate Pass: rejected parts going back to a vendor.
// The Claim Note No is the automatic id of the gate pass.
export default function RejectionReturnToVendorPage() {
    const [isNewMode, setIsNewMode] = useState(true);
    const [isEditing, setIsEditing] = useState(true);
    const [pickerRowIndex, setPickerRowIndex] = useState<number | null>(null);
    // Problems found in the item rows: which cell of which row is wrong and why
    const [rowErrors, setRowErrors] = useState<Record<number, { field: string; message: string }>>({});
    const [isVendorPickerOpen, setIsVendorPickerOpen] = useState(false);

    const { hasPermission } = usePermissions();
    const canCreate = hasPermission("rejection_return_to_vendor", "create");
    const canUpdate = hasPermission("rejection_return_to_vendor", "update");
    const canView = hasPermission("rejection_return_to_vendor", "view");

    const [isIdLoading, setIsIdLoading] = useState(true);
    const [nextId, setNextId] = useState("");
    const [isViewAllOpen, setIsViewAllOpen] = useState(false);
    const [rejectionReturns, setRejectionReturns] = useState<RejectionReturnRow[]>([]);
    const [hasLoadedRejectionReturns, setHasLoadedRejectionReturns] = useState(false);
    const [isRejectionReturnsLoading, setIsRejectionReturnsLoading] = useState(false);
    const [rejectionReturnsError, setRejectionReturnsError] = useState("");
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
    } = useForm<RejectionReturnToVendorFormValues>({ defaultValues: initialValues });
    const values = watch();

    const freshForm = (id: string): RejectionReturnToVendorFormValues => ({
        ...initialValues,
        id,
        date: today(),
        items: Array.from({ length: MIN_ROWS }, defaultRow),
    });

    const fetchNextId = async () => {
        setIsIdLoading(true);
        try {
            const { data } = await api.get(`${REJECTION_RETURN_TO_VENDOR}/next-id`, {
                params: { _ts: Date.now() },
            });
            const fetchedNextId = String(data.data.nextId);
            setNextId(fetchedNextId);
            skipNextIdLookup.current = true;
            reset(freshForm(fetchedNextId));
            setIsNewMode(true);
            setIsEditing(true);
        } catch (error) {
            console.error("Failed to fetch next Claim Note No", error);
        } finally {
            setIsIdLoading(false);
        }
    };

    const mapReturnToForm = (record: RejectionReturnRow): RejectionReturnToVendorFormValues => ({
        id: String(record.id),
        date: record.date ? new Date(record.date).toISOString().split("T")[0] : today(),
        vendorId: String(record.vendorId),
        vendorName: record.vendor?.vendorName || record.vendorName || `Vendor #${record.vendorId}`,
        address: record.address || "",
        contactNo: record.contactNo || "",
        saleTaxNo: record.saleTaxNo || "",
        transport: record.transport || "",
        builtyNo: record.builtyNo || "",
        bookNo: record.bookNo || "",
        receivedBy: record.receivedBy || "",
        items: padRows(
            (record.items || []).map((item) => ({
                inventoryId: String(item.inventoryId),
                itemName: item.inventory?.itemName || `Item #${item.inventoryId}`,
                rej: String(item.rej ?? ""),
                report: item.report || "",
            })),
            defaultRow
        ),
    });

    const withListFields = (item: RejectionReturnRow): RejectionReturnRow => ({
        ...item,
        date: item.date ? new Date(item.date).toISOString().split("T")[0] : "",
        vendorName: item.vendor?.vendorName || `Vendor #${item.vendorId}`,
        itemsSummary: (item.items || []).map((row) => row.inventory?.itemName).filter(Boolean).join(", "),
    });

    const fetchAllRejectionReturns = async (openModal = true, force = false) => {
        if (openModal) setIsViewAllOpen(true);
        if (hasLoadedRejectionReturns && !force) return;

        setIsRejectionReturnsLoading(true);
        setRejectionReturnsError("");
        try {
            const { data } = await api.get(REJECTION_RETURN_TO_VENDOR);
            setRejectionReturns((data.data || []).map(withListFields));
            setHasLoadedRejectionReturns(true);
        } catch (error: unknown) {
            const apiError = error as ApiError;
            setRejectionReturnsError(apiError.response?.data?.message || "Failed to fetch Rejection Returns");
        } finally {
            setIsRejectionReturnsLoading(false);
        }
    };

    const addReturnToCache = (item: RejectionReturnRow) => {
        setRejectionReturns((current) => {
            const cached = withListFields(item);
            const existingIndex = current.findIndex((c) => String(c.id) === String(item.id));
            if (existingIndex === -1) return [...current, cached];
            return current.map((c, index) => (index === existingIndex ? cached : c));
        });
        setHasLoadedRejectionReturns(true);
    };

    useEffect(() => {
        void fetchNextId();
        void fetchAllRejectionReturns(false);
    }, []);

    // Show every problem of the form: field messages under the fields, row problems on the row itself
    const showValidationIssues = (issues: { path: PropertyKey[]; message: string }[]) => {
        const rows: Record<number, { field: string; message: string }> = {};
        for (const issue of issues) {
            const [field, rowIndex, rowField] = issue.path;
            if (field === "items" && typeof rowIndex === "number") {
                if (!rows[rowIndex]) rows[rowIndex] = { field: String(rowField ?? "inventoryId"), message: issue.message };
            } else if (typeof field === "string") {
                setError(field as keyof RejectionReturnToVendorFormValues, { type: "manual", message: issue.message });
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

    const onSubmit = async (data: RejectionReturnToVendorFormValues) => {
        clearErrors();
        setRowErrors({});
        const validationResult = rejectionReturnToVendorSchema.safeParse(data);
        if (!validationResult.success) {
            showValidationIssues(validationResult.error.issues);
            return;
        }

        const validRows = data.items.filter((row) => row.inventoryId && row.rej);
        const payload = {
            date: new Date(data.date).toISOString(),
            vendorId: Number(data.vendorId),
            address: data.address.trim(),
            contactNo: data.contactNo.trim(),
            saleTaxNo: data.saleTaxNo.trim(),
            transport: data.transport.trim(),
            builtyNo: (data.builtyNo ?? "").trim(),
            bookNo: (data.bookNo ?? "").trim(),
            receivedBy: data.receivedBy.trim(),
            items: validRows.map((row) => ({
                inventoryId: Number(row.inventoryId),
                rej: Number(row.rej),
                report: (row.report ?? "").trim(),
            })),
        };

        try {
            const response = isNewMode
                ? await api.post(REJECTION_RETURN_TO_VENDOR, payload)
                : await api.put(`${REJECTION_RETURN_TO_VENDOR}/${data.id}`, payload);

            toast.success(response.data.message || "Gate pass saved successfully");
            if (hasLoadedRejectionReturns) {
                setHasLoadedRejectionReturns(false);
                await fetchAllRejectionReturns(false, true);
            }
            refreshNextIdAfterSubmit.current = true;
        } catch (error: unknown) {
            const apiError = error as ApiError;
            console.error("Rejection return save failed:", apiError.response?.data || error);
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
    const returnColumns: ViewAllColumn<RejectionReturnRow>[] = [
        { key: "id", header: "Claim Note No" },
        { key: "date", header: "Date" },
        { key: "vendorName", header: "Vendor" },
        { key: "transport", header: "Transport" },
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
                const cached = rejectionReturns.find((item) => String(item.id) === debouncedId);
                const record: RejectionReturnRow | undefined =
                    cached || (await api.get(`${REJECTION_RETURN_TO_VENDOR}/${debouncedId}`)).data.data;

                if (!record) {
                    toast.error("Gate pass not found");
                    resetToNextId();
                    return;
                }

                if (!cached) addReturnToCache(record);
                reset(mapReturnToForm(record));
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
    }, [debouncedId, nextId, canView, rejectionReturns]);

    const updateItemRow = (index: number, field: keyof (typeof initialValues.items)[number], value: string) => {
        setRowErrors({});
        const currentItems = [...values.items];
        let cleanValue = value;
        if (field === "rej") {
            if (!currentItems[index].inventoryId) {
                toast.error(`Row ${index + 1}: Select Item Name first`, { id: `row-hint-${index}` });
                return;
            }
            cleanValue = value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
        }
        currentItems[index] = { ...currentItems[index], [field]: cleanValue };
        setValue("items", currentItems, { shouldDirty: true, shouldValidate: true });
    };

    const rowHasData = (row: (typeof values.items)[number]) =>
        !!(row.inventoryId || row.itemName || row.rej || row.report);

    const removeRow = (index: number) => {
        setRowErrors({});
        const remaining = values.items.filter((_, i) => i !== index);
        setValue("items", padRows(remaining, defaultRow), { shouldDirty: true, shouldValidate: true });
    };

    const addRow = () => {
        setValue("items", [...values.items, defaultRow()], { shouldDirty: true });
    };

    // The vendor comes from the vendor list. The other fields (address, contact...) are written by the user.
    const handleVendorSelect = (vendor: VendorPickItem) => {
        setValue("vendorId", String(vendor.id), { shouldDirty: true, shouldValidate: true });
        setValue("vendorName", vendor.vendorName, { shouldDirty: true });
        setIsVendorPickerOpen(false);
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

    const totalRej = values.items.reduce((sum, row) => sum + (Number(row.rej) || 0), 0);

    const handlePrint = () => {
        if (isNewMode || !values.id) {
            toast.error("Open a saved gate pass first (enter its Claim Note No or use View All) to print it");
            return;
        }
        window.open(`/print/rejection-return-slip?id=${values.id}`, "_blank");
    };

    return (
        <section className="mx-auto mt-10 w-full max-w-5xl bg-form-bg p-6 shadow-sm sm:p-8">
            <h1 className="mb-8 text-center text-2xl font-medium tracking-wide text-black underline decoration-2 underline-offset-4 sm:text-4xl">
                Rejection Return To Vendor Gate Pass
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
                        label="Claim Note No"
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

                    {/* Click to select the vendor from the vendor list */}
                    <LabeledField
                        label="Vendor Name"
                        value={values.vendorName ?? ""}
                        readOnly
                        onClick={() => isEditing && setIsVendorPickerOpen(true)}
                        onKeyDown={(event) => {
                            if (isEditing && (event.key === "Enter" || event.key === " ")) {
                                event.preventDefault();
                                setIsVendorPickerOpen(true);
                            }
                        }}
                        placeholder={isEditing ? "Click to select vendor" : ""}
                        title={isEditing ? "Click to select the vendor" : undefined}
                        error={errors.vendorId?.message}
                        disabled={!isEditing}
                        wrapperClassName="md:col-span-2"
                        className={isEditing ? "cursor-pointer hover:bg-primary-50" : ""}
                    />

                    <LabeledField
                        label="Address"
                        value={values.address}
                        onChange={(event) =>
                            setValue("address", event.target.value, { shouldDirty: true, shouldValidate: true })
                        }
                        error={errors.address?.message}
                        disabled={!isEditing}
                        maxLength={255}
                        wrapperClassName="md:col-span-2"
                    />
                    <LabeledField
                        label="Contact"
                        value={values.contactNo}
                        onChange={(event) =>
                            setValue("contactNo", event.target.value, { shouldDirty: true, shouldValidate: true })
                        }
                        error={errors.contactNo?.message}
                        disabled={!isEditing}
                        maxLength={100}
                    />
                    <LabeledField
                        label="Sale Tax No"
                        value={values.saleTaxNo}
                        onChange={(event) =>
                            setValue("saleTaxNo", event.target.value, { shouldDirty: true, shouldValidate: true })
                        }
                        error={errors.saleTaxNo?.message}
                        disabled={!isEditing}
                        maxLength={50}
                    />
                    <LabeledField
                        label="Transport"
                        value={values.transport}
                        onChange={(event) =>
                            setValue("transport", event.target.value, { shouldDirty: true, shouldValidate: true })
                        }
                        error={errors.transport?.message}
                        disabled={!isEditing}
                        maxLength={100}
                        wrapperClassName="md:col-span-2"
                    />
                    <LabeledField
                        label="Builty No (optional)"
                        value={values.builtyNo ?? ""}
                        onChange={(event) =>
                            setValue("builtyNo", event.target.value, { shouldDirty: true, shouldValidate: true })
                        }
                        error={errors.builtyNo?.message}
                        disabled={!isEditing}
                        maxLength={50}
                    />
                    <LabeledField
                        label="Book No (optional)"
                        value={values.bookNo ?? ""}
                        onChange={(event) =>
                            setValue("bookNo", event.target.value, { shouldDirty: true, shouldValidate: true })
                        }
                        error={errors.bookNo?.message}
                        disabled={!isEditing}
                        maxLength={50}
                    />
                    <LabeledField
                        label="Received By"
                        value={values.receivedBy}
                        onChange={(event) =>
                            setValue("receivedBy", event.target.value, { shouldDirty: true, shouldValidate: true })
                        }
                        error={errors.receivedBy?.message}
                        disabled={!isEditing}
                        maxLength={100}
                        wrapperClassName="md:col-span-2"
                    />
                </div>

                <div className="max-h-100 overflow-y-auto border border-zinc-400 bg-white">
                    <table className="relative w-full table-fixed border-collapse bg-white text-sm text-black">
                        <thead className="sticky top-0 z-10 bg-white">
                            <tr className="border-b border-zinc-400">
                                <th className="w-20 border-r border-zinc-400 px-2 py-1.5 text-center font-medium">Code</th>
                                <th className="border-r border-zinc-400 px-2 py-1.5 text-center font-medium">Item Name</th>
                                <th className="w-24 border-r border-zinc-400 px-2 py-1.5 text-center font-medium">Rej</th>
                                <th className="w-2/5 px-2 py-1.5 text-center font-medium">Report</th>
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
                                            inputMode="numeric"
                                            value={row.rej ?? ""}
                                            onChange={(e) => updateItemRow(index, "rej", e.target.value)}
                                            disabled={!isEditing}
                                            data-row-error={rowErrors[index]?.field === "rej" ? "true" : undefined}
                                            className={`w-full bg-transparent px-2 py-1.5 text-center text-[13px] outline-none disabled:bg-[#f3f4f6] ${rowErrors[index]?.field === "rej" ? "ring-2 ring-inset ring-red-400" : ""}`}
                                        />
                                    </td>
                                    <td className="relative p-0">
                                        <input
                                            type="text"
                                            value={row.report ?? ""}
                                            onChange={(e) => updateItemRow(index, "report", e.target.value)}
                                            disabled={!isEditing}
                                            maxLength={255}
                                            title={row.report || undefined}
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
                            Total Rej: <span className="font-semibold text-black">{totalRej.toLocaleString()}</span>
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
                        onClick={() => fetchAllRejectionReturns()}
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

            <VendorPickerModal
                isOpen={isVendorPickerOpen}
                onClose={() => setIsVendorPickerOpen(false)}
                onSelect={handleVendorSelect}
            />

            <InventoryPickerModal
                isOpen={pickerRowIndex !== null}
                title={`Select Item${pickerRowIndex !== null ? ` (Row ${pickerRowIndex + 1})` : ""}`}
                onClose={() => setPickerRowIndex(null)}
                onSelect={handleItemSelect}
            />

            <ViewAllModal
                key={isViewAllOpen ? "open" : "closed"}
                isOpen={isViewAllOpen}
                title="All Rejection Return Gate Passes"
                rows={rejectionReturns}
                columns={returnColumns}
                searchKeys={["id", "date", "vendorName", "transport", "builtyNo", "itemsSummary"]}
                isLoading={isRejectionReturnsLoading}
                error={rejectionReturnsError}
                onClose={() => setIsViewAllOpen(false)}
                onRowSelect={(item) => {
                    reset(mapReturnToForm(item));
                    setIsNewMode(false);
                    setIsEditing(false);
                    setIsViewAllOpen(false);
                }}
                onDelete={() => undefined}
            />
        </section>
    );
}
