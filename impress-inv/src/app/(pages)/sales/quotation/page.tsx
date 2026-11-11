"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { LabeledField } from "@/components/ui/LabeledField";
import { LabeledSelect } from "@/components/ui/LabeledSelect";
import { Button } from "@/components/ui/Button";
import useDebounce from "@/hooks/useDebounce";
import { quotationSchema, type QuotationFormValues } from "@/lib/validations/master";
import { QUOTATIONS, VENDORS } from "@/utlis/apiRoutes";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { ViewAllModal, type ViewAllColumn } from "@/components/ui/ViewAllModal";
import { InventoryPickerModal, type InventoryPickItem } from "@/components/ui/InventoryPickerModal";
import { RowDeleteButton, deletableRowClassName } from "@/components/ui/RowDeleteButton";
import { AddRowButton } from "@/components/ui/AddRowButton";
import { DetailField } from "@/components/ui/DetailField";

type QuotationRow = {
    id: number;
    vendorId: number;
    vendorName?: string;
    date: string;
    remarks?: string;
    itemName?: string[];
    oldRate?: number[];
    proposedRate?: number[];
    approvedRate?: number[];
    vendor?: { id: number; vendorName?: string; name?: string };
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

const defaultRow = () => ({ itemName: "", oldRate: "", proposedRate: "", approvedRate: "" });
const initialValues: QuotationFormValues = {
    id: "",
    date: new Date().toISOString().split("T")[0],
    vendorId: "",
    remarks: "",
    items: Array.from({ length: 10 }, defaultRow),
};

export default function QuotationPage() {
    const [isNewMode, setIsNewMode] = useState(true);
    const [isEditing, setIsEditing] = useState(true);
    const [vendors, setVendors] = useState<{ label: string; value: string }[]>([]);
    const [pickerRowIndex, setPickerRowIndex] = useState<number | null>(null);

    const { hasPermission } = usePermissions();
    const canCreate = hasPermission("quotation", "create");
    const canUpdate = hasPermission("quotation", "update");
    const canView = hasPermission("quotation", "view");

    const [isIdLoading, setIsIdLoading] = useState(true);
    const [nextId, setNextId] = useState("");
    const [isOptionsLoading, setIsOptionsLoading] = useState(true);
    const [isViewAllOpen, setIsViewAllOpen] = useState(false);
    const [quotations, setQuotations] = useState<QuotationRow[]>([]);
    const [hasLoadedQuotations, setHasLoadedQuotations] = useState(false);
    const [isQuotationsLoading, setIsQuotationsLoading] = useState(false);
    const [quotationsError, setQuotationsError] = useState("");
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
    } = useForm<QuotationFormValues>({ defaultValues: initialValues });
    const values = watch();

    const fetchOptions = async () => {
        setIsOptionsLoading(true);
        try {
            const vendorRes = await api.get(VENDORS);
            setVendors((vendorRes.data.data || []).map((v: any) => ({
                label: v.vendorName || v.name,
                value: String(v.id),
            })));
        } catch (error) {
            console.error("Failed to fetch dropdown options", error);
            toast.error("Failed to load vendors");
        } finally {
            setIsOptionsLoading(false);
        }
    };

    const fetchNextId = async () => {
        setIsIdLoading(true);
        try {
            const { data } = await api.get(`${QUOTATIONS}/next-id`, {
                params: { _ts: Date.now() },
            });
            const fetchedNextId = String(data.data.nextId);
            setNextId(fetchedNextId);
            skipNextIdLookup.current = true;
            reset({
                ...initialValues,
                id: fetchedNextId,
                date: new Date().toISOString().split("T")[0],
                items: Array.from({ length: 10 }, defaultRow),
            });
            setIsNewMode(true);
            setIsEditing(true);
        } catch (error) {
            console.error("Failed to fetch next quotation ID", error);
        } finally {
            setIsIdLoading(false);
        }
    };

    const mapQuotationToForm = (q: any) => {
        const fetchedRows = (q.itemName || []).map((name: string, i: number) => ({
            itemName: name || "",
            oldRate: q.oldRate?.[i] !== undefined && q.oldRate?.[i] !== null ? String(q.oldRate[i]) : "",
            proposedRate: q.proposedRate?.[i] !== undefined && q.proposedRate?.[i] !== null ? String(q.proposedRate[i]) : "",
            approvedRate: q.approvedRate?.[i] !== undefined && q.approvedRate?.[i] !== null ? String(q.approvedRate[i]) : "",
        }));

        return {
            id: String(q.id),
            date: q.date ? new Date(q.date).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
            vendorId: String(q.vendorId ?? ""),
            remarks: q.remarks || "",
            items: padRows(fetchedRows, defaultRow),
        };
    };

    const fetchAllQuotations = async (openModal = true, force = false) => {
        if (openModal) setIsViewAllOpen(true);
        if (hasLoadedQuotations && !force) return;

        setIsQuotationsLoading(true);
        setQuotationsError("");
        try {
            const { data } = await api.get(QUOTATIONS);
            const vendorMap = new Map(
                vendors.map((vendor) => [vendor.value, vendor.label])
            );
            setQuotations(
                (data.data || []).map((item: QuotationRow) => ({
                    ...item,
                    vendorName:
                        vendorMap.get(String(item.vendorId)) ||
                        item.vendor?.vendorName ||
                        item.vendor?.name ||
                        `Vendor #${item.vendorId}`,
                    date: item.date ? new Date(item.date).toISOString().split("T")[0] : "",
                }))
            );
            setHasLoadedQuotations(true);
        } catch (error: unknown) {
            const apiError = error as ApiError;
            setQuotationsError(apiError.response?.data?.message || "Failed to fetch quotations");
        } finally {
            setIsQuotationsLoading(false);
        }
    };

    const addQuotationToCache = (item: QuotationRow) => {
        setQuotations((current) => {
            const vendorName =
                vendors.find((v) => String(v.value) === String(item.vendorId))?.label ||
                item.vendorName ||
                `Vendor #${item.vendorId}`;
            const cachedItem = {
                ...item,
                vendorName,
                date: item.date ? new Date(item.date).toISOString().split("T")[0] : "",
            };
            const existingIndex = current.findIndex(
                (c) => String(c.id) === String(item.id)
            );

            if (existingIndex === -1) return [...current, cachedItem];
            return current.map((c, index) =>
                index === existingIndex ? cachedItem : c
            );
        });
        setHasLoadedQuotations(true);
    };

    useEffect(() => {
        void fetchNextId();
        void fetchOptions();
        void fetchAllQuotations(false);
    }, []);

    const onSubmit = async (data: QuotationFormValues) => {
        const validationResult = quotationSchema.safeParse(data);
        if (!validationResult.success) {
            clearErrors();
            validationResult.error.issues.forEach((issue) => {
                const field = issue.path[0];
                if (typeof field === "string") {
                    setError(field as any, {
                        type: "manual",
                        message: issue.message,
                    });
                }
            });
            return;
        }

        const validRows = data.items.filter(
            (r) => r.itemName && r.oldRate && r.proposedRate && r.approvedRate
        );

        if (validRows.length === 0) {
            toast.error("Please fill at least one complete row");
            return;
        }

        const payload = {
            date: new Date(data.date).toISOString(),
            vendorId: Number(data.vendorId),
            remarks: data.remarks || "",
            itemName: validRows.map((r) => r.itemName),
            oldRate: validRows.map((r) => Number(r.oldRate)),
            proposedRate: validRows.map((r) => Number(r.proposedRate)),
            approvedRate: validRows.map((r) => Number(r.approvedRate)),
        };

        try {
            const response = isNewMode
                ? await api.post(QUOTATIONS, payload)
                : await api.put(`${QUOTATIONS}/${data.id}`, payload);

            toast.success(response.data.message || "Quotation saved successfully");
            if (hasLoadedQuotations) {
                setHasLoadedQuotations(false);
                await fetchAllQuotations(false, true);
            }
            refreshNextIdAfterSubmit.current = true;
        } catch (error: unknown) {
            const apiError = error as ApiError;
            console.error("Quotation save failed:", apiError.response?.data || error);
            toast.error(apiError.response?.data?.message || "Failed to save quotation");
        }
    };

    useEffect(() => {
        if (!isSubmitting && refreshNextIdAfterSubmit.current) {
            refreshNextIdAfterSubmit.current = false;
            void fetchNextId();
        }
    }, [isSubmitting]);

    const debouncedId = useDebounce(values.id, 500);
    const quotationColumns: ViewAllColumn<QuotationRow>[] = [
        { key: "id", header: "Quotation ID" },
        { key: "vendorName", header: "Vendor" },
        { key: "date", header: "Date" },
        { key: "remarks", header: "Remarks" },
    ];

    useEffect(() => {
        const fetchDebouncedId = async () => {
            if (!debouncedId) return;
            if (skipNextIdLookup.current) {
                skipNextIdLookup.current = false;
                return;
            }

            const resetToNextId = () => {
                reset({
                    ...initialValues,
                    id: nextId,
                    items: Array.from({ length: 10 }, defaultRow),
                });
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
                const cached = quotations.find((item) => String(item.id) === debouncedId);
                const quotation = cached || (await api.get(`${QUOTATIONS}/${debouncedId}`)).data.data;

                if (!quotation) {
                    toast.error("Quotation not found");
                    resetToNextId();
                    return;
                }

                if (!cached) addQuotationToCache(quotation);
                reset(mapQuotationToForm(quotation));
                setIsNewMode(false);
                setIsEditing(false);
                toast.success("Quotation found");
            } catch (error: unknown) {
                const apiError = error as ApiError;
                toast.error(
                    apiError.response?.status === 403
                        ? apiError.response?.data?.message || "Access denied. You do not have permission."
                        : "Quotation not found"
                );
                resetToNextId();
            } finally {
                setIsIdLoading(false);
            }
        };

        void fetchDebouncedId();
    }, [debouncedId, nextId, canView, quotations]);

    const updateItemRow = (index: number, field: keyof typeof initialValues.items[0], value: string) => {
        const currentItems = [...values.items];
        if (field === "itemName" && value === "") {
            currentItems[index] = defaultRow();
        } else {
            currentItems[index] = { ...currentItems[index], [field]: value };
        }
        setValue("items", currentItems, { shouldDirty: true, shouldValidate: true });
    };

    const rowHasData = (row: (typeof values.items)[number]) =>
        !!(row.itemName || row.oldRate || row.proposedRate || row.approvedRate);

    const removeItemRow = (index: number) => {
        const remaining = values.items.filter((_, i) => i !== index);
        setValue("items", padRows(remaining, defaultRow), { shouldDirty: true, shouldValidate: true });
    };

    const addItemRow = () => {
        setValue("items", [...values.items, defaultRow()], { shouldDirty: true });
    };

    const handleItemSelect = (item: InventoryPickItem) => {
        if (pickerRowIndex === null) return;
        const duplicateIndex = values.items.findIndex(
            (row, i) => i !== pickerRowIndex && (row.itemName ?? "").trim().toLowerCase() === item.itemName.trim().toLowerCase()
        );
        if (duplicateIndex !== -1) {
            toast.error(`"${item.itemName}" is already added in row ${duplicateIndex + 1}`);
            return;
        }
        updateItemRow(pickerRowIndex, "itemName", item.itemName);
        setPickerRowIndex(null);
    };

    return (
        <section className="mx-auto mt-10 w-full max-w-5xl bg-form-bg p-8 shadow-sm">
            <h1 className="mb-10 text-center text-4xl font-medium text-black tracking-wide">
                Quotation Entry
            </h1>

            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
                <div className="grid gap-3 md:grid-cols-2">
                    <LabeledField
                        type={isIdLoading ? "text" : "number"}
                        label="Quotation ID"
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
                        onChange={(e) =>
                            setValue("date", e.target.value, {
                                shouldDirty: true,
                                shouldValidate: true,
                            })
                        }
                        error={errors.date?.message}
                        disabled={!isEditing}
                    />

                    <LabeledSelect
                        label="Vendor"
                        options={vendors}
                        value={values.vendorId}
                        onChange={(value) =>
                            setValue("vendorId", value, {
                                shouldDirty: true,
                                shouldValidate: true,
                            })
                        }
                        error={errors.vendorId?.message}
                        disabled={!isEditing || isOptionsLoading}
                        placeholder={isOptionsLoading ? "Loading vendors..." : "Select Vendor"}
                    />

                    <DetailField
                        label="Remarks"
                        value={values.remarks ?? ""}
                        onChange={(text) =>
                            setValue("remarks", text, {
                                shouldDirty: true,
                                shouldValidate: true,
                            })
                        }
                        error={errors.remarks?.message}
                        disabled={!isEditing}
                        required
                        maxLength={255}
                        placeholder="Click to add remarks"
                        wrapperClassName="md:col-span-2"
                    />
                </div>

                <div className="max-h-[400px] overflow-y-auto border border-zinc-400 bg-white">
                    <table className="w-full border-collapse text-sm text-black relative">
                        <thead className="sticky top-0 z-10 bg-white">
                            <tr className="border-b border-zinc-400">
                                <th className="border-r border-zinc-400 px-2 py-1.5 text-center font-medium w-1/2">
                                    Item Name
                                </th>
                                <th className="border-r border-zinc-400 px-2 py-1.5 text-center font-medium w-1/6">
                                    Old Rate
                                </th>
                                <th className="border-r border-zinc-400 px-2 py-1.5 text-center font-medium w-1/6">
                                    Proposed Rate
                                </th>
                                <th className="px-2 py-1.5 text-center font-medium w-1/6">
                                    Approved Rate
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {values.items.map((row, index) => (
                                <tr key={index} className={deletableRowClassName}>
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
                                            className="w-full cursor-pointer bg-transparent px-2 py-1.5 text-[13px] outline-none placeholder:text-zinc-400 hover:bg-primary-50 disabled:cursor-default disabled:bg-[#f3f4f6] disabled:text-zinc-500"
                                        />
                                    </td>
                                    <td className="border-r border-zinc-300 p-0">
                                        <input
                                            type="number"
                                            value={row.oldRate}
                                            onChange={(e) => updateItemRow(index, "oldRate", e.target.value)}
                                            disabled={!isEditing}
                                            min={0}
                                            className="w-full bg-transparent px-2 py-1.5 text-center text-[13px] outline-none disabled:bg-[#f3f4f6] disabled:text-zinc-500"
                                        />
                                    </td>
                                    <td className="border-r border-zinc-300 p-0">
                                        <input
                                            type="number"
                                            value={row.proposedRate}
                                            onChange={(e) => updateItemRow(index, "proposedRate", e.target.value)}
                                            disabled={!isEditing}
                                            min={0}
                                            className="w-full bg-transparent px-2 py-1.5 text-center text-[13px] outline-none disabled:bg-[#f3f4f6] disabled:text-zinc-500"
                                        />
                                    </td>
                                    <td className="relative p-0">
                                        <input
                                            type="number"
                                            value={row.approvedRate}
                                            onChange={(e) => updateItemRow(index, "approvedRate", e.target.value)}
                                            disabled={!isEditing}
                                            min={0}
                                            className="w-full bg-transparent px-2 py-1.5 text-center text-[13px] outline-none disabled:bg-[#f3f4f6] disabled:text-zinc-500"
                                        />
                                        {isEditing && rowHasData(row) && (
                                            <RowDeleteButton rowNumber={index + 1} onClick={() => removeItemRow(index)} />
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-zinc-500">
                        {isEditing ? "Tip: hover a row and click the trash icon to remove it" : ""}
                    </span>
                    <AddRowButton onClick={addItemRow} disabled={!isEditing} />
                </div>
                {errors.items && (
                    <p className="mt-1.5 text-xs text-red-500">{errors.items.message}</p>
                )}

                <div className="flex flex-wrap items-center justify-center gap-3 pt-6">
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
                        onClick={() => fetchAllQuotations()}
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
                isOpen={pickerRowIndex !== null}
                title={`Select Item${pickerRowIndex !== null ? ` (Row ${pickerRowIndex + 1})` : ""}`}
                onClose={() => setPickerRowIndex(null)}
                onSelect={handleItemSelect}
            />

            <ViewAllModal
                key={isViewAllOpen ? "open" : "closed"}
                isOpen={isViewAllOpen}
                title="All Quotations"
                rows={quotations}
                columns={quotationColumns}
                searchKeys={["id", "vendorName", "date", "remarks"]}
                isLoading={isQuotationsLoading}
                error={quotationsError}
                onClose={() => setIsViewAllOpen(false)}
                onRowSelect={(item) => {
                    reset(mapQuotationToForm(item));
                    setIsNewMode(false);
                    setIsEditing(false);
                    setIsViewAllOpen(false);
                }}
                onDelete={() => undefined}
            />
        </section>
    );
}
