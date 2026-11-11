"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { LabeledField } from "@/components/ui/LabeledField";
import { LabeledSelect } from "@/components/ui/LabeledSelect";
import { Button } from "@/components/ui/Button";
import useDebounce from "@/hooks/useDebounce";
import { purchaseOrderSchema, type PurchaseOrderFormValues } from "@/lib/validations/master";
import { PURCHASE_ORDERS, VENDORS, QUOTATIONS, INVENTORY } from "@/utlis/apiRoutes";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { ViewAllModal, type ViewAllColumn } from "@/components/ui/ViewAllModal";
import { InventoryPickerModal, type InventoryPickItem } from "@/components/ui/InventoryPickerModal";
import { RowDeleteButton, deletableRowClassName } from "@/components/ui/RowDeleteButton";
import { AddRowButton } from "@/components/ui/AddRowButton";
import { DetailField } from "@/components/ui/DetailField";
import { cn } from "@/lib/utils";

type PurchaseOrderRow = {
    id: number;
    vendorId: number;
    vendorName?: string;
    date: string;
    validity?: string;
    instruction?: string;
    quotationId?: number;
    code?: number[];
    itemName?: string[];
    unit?: number[];
    quantity?: number[];
    rate?: number[];
    amount?: number[];
    total?: number;
    saleTaxPercent?: number;
    totalWithSaleTax?: number;
    withHoldingPercent?: number;
    withHoldingAmount?: number;
    grandTotal?: number;
    vendor?: { id: number; vendorName?: string; name?: string };
    [key: string]: unknown;
};

type QuotationOption = {
    id: number;
    vendorId: number;
    vendorName?: string;
    date?: string;
    remarks?: string;
    itemName?: string[];
    oldRate?: number[];
    proposedRate?: number[];
    approvedRate?: number[];
    itemsSummary?: string;
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

const defaultRow = () => ({
    code: "",
    itemName: "",
    unit: "",
    quantity: "",
    rate: "",
    amount: "",
});

const initialValues: PurchaseOrderFormValues = {
    id: "",
    date: new Date().toISOString().split("T")[0],
    vendorId: "",
    validity: "",
    instruction: "",
    quotationId: "",
    items: Array.from({ length: 10 }, defaultRow),
    total: "",
    saleTaxPercent: "",
    totalWithSaleTax: "",
    withHoldingPercent: "",
    withHoldingAmount: "",
    grandTotal: "",
};

export default function PurchaseOrderPage() {
    const [isNewMode, setIsNewMode] = useState(true);
    const [isEditing, setIsEditing] = useState(true);
    const [vendors, setVendors] = useState<{ label: string; value: string }[]>([]);
    const [quotationsList, setQuotationsList] = useState<QuotationOption[]>([]);
    const [pickerRowIndex, setPickerRowIndex] = useState<number | null>(null);

    // Quotation Selection Modal State
    const [isQtModalOpen, setIsQtModalOpen] = useState(false);
    const [qtSearchQuery, setQtSearchQuery] = useState("");

    const { hasPermission } = usePermissions();
    const canCreate = hasPermission("purchase_order", "create");
    const canUpdate = hasPermission("purchase_order", "update");
    const canView = hasPermission("purchase_order", "view");

    const [isIdLoading, setIsIdLoading] = useState(true);
    const [nextId, setNextId] = useState("");
    const [isOptionsLoading, setIsOptionsLoading] = useState(true);
    const [isViewAllOpen, setIsViewAllOpen] = useState(false);
    const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderRow[]>([]);
    const [hasLoadedPurchaseOrders, setHasLoadedPurchaseOrders] = useState(false);
    const [isPurchaseOrdersLoading, setIsPurchaseOrdersLoading] = useState(false);
    const [purchaseOrdersError, setPurchaseOrdersError] = useState("");
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
    } = useForm<PurchaseOrderFormValues>({ defaultValues: initialValues });
    const values = watch();

    const fetchOptions = async () => {
        setIsOptionsLoading(true);
        try {
            const [vendorRes, qtRes] = await Promise.allSettled([
                api.get(VENDORS),
                api.get(QUOTATIONS),
            ]);
            if (vendorRes.status === "fulfilled") {
                setVendors((vendorRes.value.data.data || []).map((v: any) => ({
                    label: v.vendorName || v.name,
                    value: String(v.id),
                })));
            }
            if (qtRes.status === "fulfilled") {
                const rawList = qtRes.value.data.data || [];
                setQuotationsList(
                    rawList.map((q: any) => ({
                        ...q,
                        vendorName: q.vendor?.vendorName || q.vendor?.name || `Vendor #${q.vendorId}`,
                        date: q.date ? new Date(q.date).toISOString().split("T")[0] : "",
                        itemsSummary: Array.isArray(q.itemName) ? q.itemName.filter(Boolean).join(", ") : "",
                    }))
                );
            }
        } catch (error) {
            console.error("Failed to fetch dropdown options", error);
            toast.error("Failed to load options");
        } finally {
            setIsOptionsLoading(false);
        }
    };

    const fetchNextId = async () => {
        setIsIdLoading(true);
        try {
            const { data } = await api.get(`${PURCHASE_ORDERS}/next-id`, {
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
            console.error("Failed to fetch next PO ID", error);
        } finally {
            setIsIdLoading(false);
        }
    };

    const mapPurchaseOrderToForm = (po: any): PurchaseOrderFormValues => {
        const fetchedRows = (po.itemName || []).map((name: string, i: number) => ({
            code: po.code?.[i] !== undefined && po.code?.[i] !== null ? String(po.code[i]) : "",
            itemName: name || "",
            unit: po.unit?.[i] !== undefined && po.unit?.[i] !== null ? String(po.unit[i]) : "",
            quantity: po.quantity?.[i] !== undefined && po.quantity?.[i] !== null ? String(po.quantity[i]) : "",
            rate: po.rate?.[i] !== undefined && po.rate?.[i] !== null ? String(po.rate[i]) : "",
            amount: po.amount?.[i] !== undefined && po.amount?.[i] !== null ? String(po.amount[i]) : "",
        }));

        return {
            id: String(po.id),
            date: po.date ? new Date(po.date).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
            vendorId: String(po.vendorId ?? ""),
            validity: po.validity || "",
            instruction: po.instruction || "",
            quotationId: String(po.quotationId ?? ""),
            items: padRows(fetchedRows, defaultRow),
            total: po.total !== undefined && po.total !== null ? String(po.total) : "",
            saleTaxPercent: po.saleTaxPercent !== undefined && po.saleTaxPercent !== null ? String(po.saleTaxPercent) : "",
            totalWithSaleTax: po.totalWithSaleTax !== undefined && po.totalWithSaleTax !== null ? String(po.totalWithSaleTax) : "",
            withHoldingPercent: po.withHoldingPercent !== undefined && po.withHoldingPercent !== null ? String(po.withHoldingPercent) : "",
            withHoldingAmount: po.withHoldingAmount !== undefined && po.withHoldingAmount !== null ? String(po.withHoldingAmount) : "",
            grandTotal: po.grandTotal !== undefined && po.grandTotal !== null ? String(po.grandTotal) : "",
        };
    };

    const fetchAllPurchaseOrders = async (openModal = true, force = false) => {
        if (openModal) setIsViewAllOpen(true);
        if (hasLoadedPurchaseOrders && !force) return;

        setIsPurchaseOrdersLoading(true);
        setPurchaseOrdersError("");
        try {
            const { data } = await api.get(PURCHASE_ORDERS);
            const vendorMap = new Map(
                vendors.map((vendor) => [vendor.value, vendor.label])
            );
            setPurchaseOrders(
                (data.data || []).map((item: PurchaseOrderRow) => ({
                    ...item,
                    vendorName:
                        vendorMap.get(String(item.vendorId)) ||
                        item.vendor?.vendorName ||
                        item.vendor?.name ||
                        `Vendor #${item.vendorId}`,
                    date: item.date ? new Date(item.date).toISOString().split("T")[0] : "",
                }))
            );
            setHasLoadedPurchaseOrders(true);
        } catch (error: unknown) {
            const apiError = error as ApiError;
            setPurchaseOrdersError(apiError.response?.data?.message || "Failed to fetch purchase orders");
        } finally {
            setIsPurchaseOrdersLoading(false);
        }
    };

    const addPurchaseOrderToCache = (item: PurchaseOrderRow) => {
        setPurchaseOrders((current) => {
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
        setHasLoadedPurchaseOrders(true);
    };

    useEffect(() => {
        void fetchNextId();
        void fetchOptions();
        void fetchAllPurchaseOrders(false);
    }, []);

    const onSubmit = async (data: PurchaseOrderFormValues) => {
        const validationResult = purchaseOrderSchema.safeParse(data);
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
            (r) => r.code && r.itemName && r.unit && r.quantity && r.rate && r.amount
        );

        if (validRows.length === 0) {
            toast.error("Please fill at least one complete row");
            return;
        }

        const payload = {
            date: new Date(data.date).toISOString(),
            vendorId: Number(data.vendorId),
            validity: data.validity,
            instruction: data.instruction,
            quotationId: Number(data.quotationId),

            code: validRows.map((r) => Number(r.code)),
            itemName: validRows.map((r) => r.itemName),
            unit: validRows.map((r) => Number(r.unit)),
            quantity: validRows.map((r) => Number(r.quantity)),
            rate: validRows.map((r) => Number(r.rate)),
            amount: validRows.map((r) => Number(r.amount)),

            total: Number(data.total || 0),
            saleTaxPercent: Number(data.saleTaxPercent || 0),
            totalWithSaleTax: Number(data.totalWithSaleTax || 0),
            withHoldingPercent: Number(data.withHoldingPercent || 0),
            withHoldingAmount: Number(data.withHoldingAmount || 0),
            grandTotal: Number(data.grandTotal || 0),
        };

        try {
            const response = isNewMode
                ? await api.post(PURCHASE_ORDERS, payload)
                : await api.put(`${PURCHASE_ORDERS}/${data.id}`, payload);

            toast.success(response.data.message || "Purchase Order saved successfully");
            if (hasLoadedPurchaseOrders) {
                setHasLoadedPurchaseOrders(false);
                await fetchAllPurchaseOrders(false, true);
            }
            refreshNextIdAfterSubmit.current = true;
        } catch (error: unknown) {
            const apiError = error as ApiError;
            console.error("Purchase Order save failed:", apiError.response?.data || error);
            toast.error(apiError.response?.data?.message || "Failed to save Purchase Order");
        }
    };

    useEffect(() => {
        if (!isSubmitting && refreshNextIdAfterSubmit.current) {
            refreshNextIdAfterSubmit.current = false;
            void fetchNextId();
        }
    }, [isSubmitting]);

    const debouncedId = useDebounce(values.id, 500);
    const purchaseOrderColumns: ViewAllColumn<PurchaseOrderRow>[] = [
        { key: "id", header: "PO ID" },
        { key: "vendorName", header: "Vendor" },
        { key: "date", header: "Date" },
        { key: "grandTotal", header: "Grand Total" },
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
                const cached = purchaseOrders.find((item) => String(item.id) === debouncedId);
                const po = cached || (await api.get(`${PURCHASE_ORDERS}/${debouncedId}`)).data.data;

                if (!po) {
                    toast.error("Purchase Order not found");
                    resetToNextId();
                    return;
                }

                if (!cached) addPurchaseOrderToCache(po);
                reset(mapPurchaseOrderToForm(po));
                setIsNewMode(false);
                setIsEditing(false);
                toast.success("Purchase Order found");
            } catch (error: unknown) {
                const apiError = error as ApiError;
                toast.error(
                    apiError.response?.status === 403
                        ? apiError.response?.data?.message || "Access denied. You do not have permission."
                        : "Purchase Order not found"
                );
                resetToNextId();
            } finally {
                setIsIdLoading(false);
            }
        };

        void fetchDebouncedId();
    }, [debouncedId, nextId, canView, purchaseOrders]);

    // Handle selecting a quotation from the modal
    const handleSelectQuotation = async (q: QuotationOption) => {
        setIsQtModalOpen(false);
        setValue("quotationId", String(q.id), { shouldDirty: true, shouldValidate: true });

        // Quotation rows only know the item name, link each one to its inventory item (the code) by name
        let inventoryIdByName = new Map<string, number>();
        try {
            const { data } = await api.get(INVENTORY);
            inventoryIdByName = new Map(
                (data.data || []).map((item: { id: number; itemName: string }) => [
                    item.itemName.trim().toLowerCase(),
                    item.id,
                ])
            );
        } catch (error) {
            console.error("Failed to load inventory to link quotation items", error);
        }

        const unmatched: string[] = [];
        const fetchedRows = (q.itemName || []).map((name: string, i: number) => {
            const rate = q.approvedRate?.[i] ?? q.proposedRate?.[i] ?? q.oldRate?.[i] ?? 0;
            const inventoryId = inventoryIdByName.get(String(name || "").trim().toLowerCase());
            if (!inventoryId) unmatched.push(name);
            return {
                code: inventoryId ? String(inventoryId) : "",
                itemName: name || "",
                unit: "1",
                quantity: "1",
                rate: String(rate),
                amount: String(rate * 1),
            };
        });

        setValue("vendorId", String(q.vendorId ?? ""), { shouldDirty: true, shouldValidate: true });
        setValue("items", padRows(fetchedRows, defaultRow), { shouldDirty: true, shouldValidate: true });
        if (unmatched.length > 0) {
            toast.error(`Not found in inventory: ${unmatched.join(", ")}. Click Item Name to select it.`, {
                duration: 6000,
            });
        } else {
            toast.success(`Quotation QT-${q.id} loaded (${q.vendorName || "Vendor"})`);
        }
    };

    const selectedQuotation = useMemo(() => {
        return quotationsList.find((q) => String(q.id) === String(values.quotationId));
    }, [quotationsList, values.quotationId]);

    const filteredQuotations = useMemo(() => {
        const query = qtSearchQuery.trim().toLowerCase();
        if (!query) return quotationsList;
        return quotationsList.filter((q) => {
            const idMatch = String(q.id).includes(query) || `qt-${q.id}`.includes(query);
            const vendorMatch = (q.vendorName || "").toLowerCase().includes(query);
            const itemsMatch = (q.itemsSummary || "").toLowerCase().includes(query);
            const remarksMatch = (q.remarks || "").toLowerCase().includes(query);
            return idMatch || vendorMatch || itemsMatch || remarksMatch;
        });
    }, [quotationsList, qtSearchQuery]);

    const updateItemRow = (index: number, field: keyof typeof initialValues.items[0], value: string) => {
        const currentItems = [...values.items];
        if (field === "itemName" && value === "") {
            currentItems[index] = defaultRow();
        } else {
            const newRow = { ...currentItems[index], [field]: value };
            if (field === "quantity" || field === "rate") {
                const q = Number(newRow.quantity) || 0;
                const r = Number(newRow.rate) || 0;
                newRow.amount = q > 0 && r > 0 ? String(q * r) : "";
            }
            currentItems[index] = newRow;
        }
        setValue("items", currentItems, { shouldDirty: true, shouldValidate: true });
    };

    const rowHasData = (row: (typeof values.items)[number]) =>
        !!(row.code || row.itemName || row.unit || row.quantity || row.rate);

    const removeItemRow = (index: number) => {
        const remaining = values.items.filter((_, i) => i !== index);
        setValue("items", padRows(remaining, defaultRow), { shouldDirty: true, shouldValidate: true });
    };

    const addItemRow = () => {
        setValue("items", [...values.items, defaultRow()], { shouldDirty: true });
    };

    // The item comes from the inventory: its id is the row Code
    const handleItemSelect = (item: InventoryPickItem) => {
        if (pickerRowIndex === null) return;
        const duplicateIndex = values.items.findIndex(
            (row, i) => i !== pickerRowIndex && row.code === String(item.id)
        );
        if (duplicateIndex !== -1) {
            toast.error(`"${item.itemName}" is already added in row ${duplicateIndex + 1}`);
            return;
        }
        const currentItems = [...values.items];
        currentItems[pickerRowIndex] = {
            ...currentItems[pickerRowIndex],
            code: String(item.id),
            itemName: item.itemName,
        };
        setValue("items", currentItems, { shouldDirty: true, shouldValidate: true });
        setPickerRowIndex(null);
    };

    // Auto-calculate totals
    useEffect(() => {
        const total = (values.items || []).reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
        const saleTaxPercent = Number(values.saleTaxPercent) || 0;
        const saleTaxAmount = (total * saleTaxPercent) / 100;
        const totalWithSaleTax = total + saleTaxAmount;

        const withHoldingPercent = Number(values.withHoldingPercent) || 0;
        const withHoldingAmount = (totalWithSaleTax * withHoldingPercent) / 100;
        const grandTotal = totalWithSaleTax - withHoldingAmount;

        setValue("total", total > 0 ? String(total.toFixed(2)) : "", { shouldDirty: false });
        setValue("totalWithSaleTax", totalWithSaleTax > 0 ? String(totalWithSaleTax.toFixed(2)) : "", { shouldDirty: false });
        setValue("withHoldingAmount", withHoldingAmount > 0 ? String(withHoldingAmount.toFixed(2)) : "", { shouldDirty: false });
        setValue("grandTotal", grandTotal > 0 ? String(grandTotal.toFixed(2)) : "", { shouldDirty: false });
    }, [values.items, values.saleTaxPercent, values.withHoldingPercent, setValue]);

    const saleTaxAmountComputed = (Number(values.total || 0) * (Number(values.saleTaxPercent) || 0)) / 100;

    return (
        <section className="mx-auto mt-10 w-full max-w-5xl bg-form-bg p-8 shadow-sm">
            <h1 className="mb-8 text-center text-4xl text-black tracking-wide">P.O Form</h1>

            <form onSubmit={handleSubmit(onSubmit)} noValidate>
                {/* Top Section */}
                <div className="flex flex-col md:flex-row justify-between items-start gap-10 mb-6">
                    <div className="flex-1 w-full space-y-3 max-w-[500px]">
                        <LabeledField
                            type={isIdLoading ? "text" : "number"}
                            label="Po No"
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
                        />

                        {/* Quotation Picker Field replacing Dropdown */}
                        <div className="w-full">
                            <label className="mb-1 block text-sm text-zinc-600">
                                Quotation (QT ID)
                            </label>
                            <div className="flex items-center gap-2">
                                <div className="relative flex-1">
                                    <input
                                        type="text"
                                        readOnly
                                        placeholder="Click 'Browse' to select Quotation"
                                        value={
                                            values.quotationId
                                                ? `QT-${values.quotationId}${
                                                      selectedQuotation?.vendorName
                                                          ? ` (${selectedQuotation.vendorName})`
                                                          : ""
                                                  }`
                                                : ""
                                        }
                                        onClick={() => {
                                            if (isEditing) setIsQtModalOpen(true);
                                        }}
                                        disabled={!isEditing}
                                        className={cn(
                                            "w-full rounded-md border bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition-colors cursor-pointer disabled:bg-zinc-50 disabled:text-zinc-400 font-medium",
                                            errors.quotationId ? "border-red-400" : "border-zinc-300"
                                        )}
                                    />
                                    {values.quotationId && isEditing && (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setValue("quotationId", "", {
                                                    shouldDirty: true,
                                                    shouldValidate: true,
                                                });
                                            }}
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-red-500 font-bold text-xs"
                                            title="Clear selection"
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    shape="rounded"
                                    onClick={() => setIsQtModalOpen(true)}
                                    disabled={!isEditing || isOptionsLoading}
                                    className="border border-zinc-400 bg-white px-4 py-2 text-sm hover:bg-zinc-50 shrink-0 font-medium"
                                >
                                    {isOptionsLoading ? "Loading..." : "Browse Quotations"}
                                </Button>
                            </div>
                            {errors.quotationId?.message && (
                                <p className="mt-1 text-xs text-red-500">{errors.quotationId.message}</p>
                            )}
                        </div>

                        <LabeledSelect
                            label="Vendor Name"
                            options={vendors}
                            value={values.vendorId}
                            onChange={(val) =>
                                setValue("vendorId", val, {
                                    shouldDirty: true,
                                    shouldValidate: true,
                                })
                            }
                            error={errors.vendorId?.message}
                            disabled={!isEditing || isOptionsLoading}
                            placeholder={isOptionsLoading ? "Loading vendors..." : "Select Vendor"}
                        />

                        <LabeledField
                            label="Validity"
                            value={values.validity}
                            onChange={(e) =>
                                setValue("validity", e.target.value, {
                                    shouldDirty: true,
                                    shouldValidate: true,
                                })
                            }
                            error={errors.validity?.message}
                            disabled={!isEditing}
                        />

                        <DetailField
                            label="Instruction"
                            value={values.instruction}
                            onChange={(text) =>
                                setValue("instruction", text, {
                                    shouldDirty: true,
                                    shouldValidate: true,
                                })
                            }
                            error={errors.instruction?.message}
                            disabled={!isEditing}
                            required
                            maxLength={255}
                            placeholder="Click to add instruction"
                        />
                    </div>

                    <div className="shrink-0 w-[250px]">
                        <LabeledField
                            type="date"
                            label="P.O Date"
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
                    </div>
                </div>

                {/* Table Section */}
                <div className="border border-zinc-400 bg-white mb-6 overflow-x-auto">
                    <table className="w-full border-collapse text-sm text-black">
                        <thead className="bg-white">
                            <tr className="border-b border-zinc-400">
                                <th className="border-r border-zinc-400 px-2 py-1.5 text-center font-medium w-16">
                                    Code
                                </th>
                                <th className="border-r border-zinc-400 px-2 py-1.5 text-center font-medium">
                                    Item Name
                                </th>
                                <th className="border-r border-zinc-400 px-2 py-1.5 text-center font-medium w-20">
                                    Unit
                                </th>
                                <th className="border-r border-zinc-400 px-2 py-1.5 text-center font-medium w-24">
                                    Qty
                                </th>
                                <th className="border-r border-zinc-400 px-2 py-1.5 text-center font-medium w-32">
                                    Rate
                                </th>
                                <th className="px-2 py-1.5 text-center font-medium w-32">
                                    Amount
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {values.items.map((row, index) => (
                                <tr key={index} className={deletableRowClassName}>
                                    <td className="border-r border-zinc-300 p-0">
                                        <input
                                            type="text"
                                            value={row.code}
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
                                            className="w-full cursor-pointer bg-transparent px-2 py-1.5 text-[13px] outline-none placeholder:text-zinc-400 hover:bg-primary-50 disabled:cursor-default disabled:bg-[#f3f4f6]"
                                        />
                                    </td>
                                    <td className="border-r border-zinc-300 p-0">
                                        <input
                                            type="number"
                                            value={row.unit}
                                            onChange={(e) => updateItemRow(index, "unit", e.target.value)}
                                            disabled={!isEditing}
                                            className="w-full bg-transparent px-2 py-1.5 text-center text-[13px] outline-none disabled:bg-[#f3f4f6]"
                                        />
                                    </td>
                                    <td className="border-r border-zinc-300 p-0">
                                        <input
                                            type="number"
                                            value={row.quantity}
                                            onChange={(e) => updateItemRow(index, "quantity", e.target.value)}
                                            disabled={!isEditing}
                                            className="w-full bg-transparent px-2 py-1.5 text-center text-[13px] outline-none disabled:bg-[#f3f4f6]"
                                        />
                                    </td>
                                    <td className="border-r border-zinc-300 p-0">
                                        <input
                                            type="number"
                                            value={row.rate}
                                            onChange={(e) => updateItemRow(index, "rate", e.target.value)}
                                            disabled={!isEditing}
                                            className="w-full bg-transparent px-2 py-1.5 text-center text-[13px] outline-none disabled:bg-[#f3f4f6]"
                                        />
                                    </td>
                                    <td className="relative p-0">
                                        <input
                                            type="number"
                                            value={row.amount}
                                            readOnly
                                            disabled={!isEditing}
                                            className="w-full bg-transparent px-2 py-1.5 text-center text-[13px] outline-none disabled:bg-[#f3f4f6] text-zinc-600 font-medium"
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
                <div className="-mt-4 mb-4 flex items-center justify-between gap-2">
                    <span className="text-xs text-zinc-500">
                        {isEditing ? "Tip: hover a row and click the trash icon to remove it" : ""}
                    </span>
                    <AddRowButton onClick={addItemRow} disabled={!isEditing} />
                </div>
                {errors.items && (
                    <p className="mb-4 text-xs text-red-500 text-center">{errors.items.message}</p>
                )}

                {/* Bottom Section */}
                <div className="flex flex-col md:flex-row justify-between items-end gap-6">
                    {/* Action Buttons */}
                    <div className="flex flex-wrap items-center gap-3">
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
                            onClick={() => fetchAllPurchaseOrders()}
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

                    {/* Totals Box */}
                    <div className="border border-zinc-400 text-black bg-white w-full md:w-[350px]">
                        <div className="flex border-b border-zinc-400">
                            <div className="flex-1 text-center py-1.5 text-sm flex items-center justify-center font-medium">
                                Total
                            </div>
                            <div className="w-[120px] border-l border-zinc-400 text-right px-2 py-1.5 text-sm bg-white">
                                {values.total || "0.00"}
                            </div>
                        </div>

                        <div className="flex border-b border-zinc-400">
                            <div className="flex-1 flex items-center justify-between px-2 py-1">
                                <span className="text-sm font-medium">Sale Tax</span>
                                <div className="flex items-center gap-1">
                                    <input
                                        type="number"
                                        placeholder="0"
                                        value={values.saleTaxPercent}
                                        onChange={(e) =>
                                            setValue("saleTaxPercent", e.target.value, {
                                                shouldDirty: true,
                                            })
                                        }
                                        disabled={!isEditing}
                                        className="w-12 border border-zinc-300 px-1 py-0.5 text-center text-xs outline-none"
                                    />
                                    <span className="text-xs">%</span>
                                </div>
                            </div>
                            <div className="w-[120px] border-l border-zinc-400 text-right px-2 py-1.5 text-sm bg-zinc-50">
                                {saleTaxAmountComputed > 0 ? saleTaxAmountComputed.toFixed(2) : "0.00"}
                            </div>
                        </div>

                        <div className="flex border-b border-zinc-400">
                            <div className="flex-1 text-center py-1.5 text-sm flex items-center justify-center font-medium">
                                Total With Sale Tax
                            </div>
                            <div className="w-[120px] border-l border-zinc-400 text-right px-2 py-1.5 text-sm bg-white">
                                {values.totalWithSaleTax || "0.00"}
                            </div>
                        </div>

                        <div className="flex border-b border-zinc-400">
                            <div className="flex-1 flex items-center justify-between px-2 py-1">
                                <span className="text-sm font-medium">With Holding Tax</span>
                                <div className="flex items-center gap-1">
                                    <input
                                        type="number"
                                        placeholder="0"
                                        value={values.withHoldingPercent}
                                        onChange={(e) =>
                                            setValue("withHoldingPercent", e.target.value, {
                                                shouldDirty: true,
                                            })
                                        }
                                        disabled={!isEditing}
                                        className="w-12 border border-zinc-300 px-1 py-0.5 text-center text-xs outline-none"
                                    />
                                    <span className="text-xs">%</span>
                                </div>
                            </div>
                            <div className="w-[120px] border-l border-zinc-400 text-right px-2 py-1.5 text-sm bg-zinc-50">
                                {values.withHoldingAmount || "0.00"}
                            </div>
                        </div>

                        <div className="flex">
                            <div className="flex-1 text-center py-1.5 text-sm flex items-center justify-center font-medium">
                                Grand Total
                            </div>
                            <div className="w-[120px] border-l border-zinc-400 text-right px-2 py-1.5 text-sm bg-white font-medium">
                                {values.grandTotal || "0.00"}
                            </div>
                        </div>
                    </div>
                </div>
            </form>

            {/* Quotation Selection Modal */}
            {isQtModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-lg bg-white shadow-2xl overflow-hidden">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 bg-zinc-50">
                            <div>
                                <h2 className="text-lg font-bold text-zinc-900">
                                    Select Quotation for P.O
                                </h2>
                                <p className="text-xs text-zinc-500">
                                    Choose a quotation to automatically fill vendor, items, and approved rates.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsQtModalOpen(false)}
                                className="rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 text-xl font-bold"
                            >
                                &times;
                            </button>
                        </div>

                        {/* Search Input */}
                        <div className="border-b border-zinc-200 bg-white px-6 py-3">
                            <input
                                type="text"
                                placeholder="Search by Quotation ID (e.g. 5 or QT-5), Vendor Name, Items, or Remarks..."
                                value={qtSearchQuery}
                                onChange={(e) => setQtSearchQuery(e.target.value)}
                                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500"
                                autoFocus
                            />
                        </div>

                        {/* Modal Table Body */}
                        <div className="flex-1 overflow-y-auto p-6">
                            {filteredQuotations.length === 0 ? (
                                <div className="py-12 text-center text-sm text-zinc-500">
                                    No quotations found matching your search.
                                </div>
                            ) : (
                                <div className="overflow-x-auto border border-zinc-200 rounded-md">
                                    <table className="w-full border-collapse text-left text-sm">
                                        <thead className="bg-zinc-100 text-xs font-semibold uppercase text-zinc-600">
                                            <tr>
                                                <th className="px-4 py-3 border-r border-zinc-200 w-24">QT ID</th>
                                                <th className="px-4 py-3 border-r border-zinc-200 w-28">Date</th>
                                                <th className="px-4 py-3 border-r border-zinc-200 w-44">Vendor</th>
                                                <th className="px-4 py-3 border-r border-zinc-200">Items Summary</th>
                                                <th className="px-4 py-3 border-r border-zinc-200 w-36">Remarks</th>
                                                <th className="px-4 py-3 text-center w-24">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-200 text-zinc-800">
                                            {filteredQuotations.map((q) => {
                                                const isSelected = String(q.id) === String(values.quotationId);
                                                return (
                                                    <tr
                                                        key={q.id}
                                                        onClick={() => void handleSelectQuotation(q)}
                                                        className={cn(
                                                            "cursor-pointer hover:bg-blue-50/70 transition-colors",
                                                            isSelected ? "bg-blue-50 font-medium" : ""
                                                        )}
                                                    >
                                                        <td className="px-4 py-3 font-bold text-blue-600 border-r border-zinc-200">
                                                            QT-{q.id}
                                                        </td>
                                                        <td className="px-4 py-3 whitespace-nowrap text-xs border-r border-zinc-200">
                                                            {q.date ? new Date(q.date).toISOString().split("T")[0] : "-"}
                                                        </td>
                                                        <td className="px-4 py-3 font-medium border-r border-zinc-200">
                                                            {q.vendorName || `Vendor #${q.vendorId}`}
                                                        </td>
                                                        <td
                                                            className="px-4 py-3 max-w-xs truncate text-xs text-zinc-600 border-r border-zinc-200"
                                                            title={q.itemsSummary}
                                                        >
                                                            {q.itemsSummary || "-"}
                                                        </td>
                                                        <td className="px-4 py-3 max-w-xs truncate text-xs text-zinc-500 border-r border-zinc-200">
                                                            {q.remarks || "-"}
                                                        </td>
                                                        <td className="px-4 py-3 text-center">
                                                            <Button
                                                                type="button"
                                                                variant="secondary"
                                                                shape="rounded"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    void handleSelectQuotation(q);
                                                                }}
                                                                className={cn(
                                                                    "px-3 py-1 text-xs border",
                                                                    isSelected
                                                                        ? "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700"
                                                                        : "bg-white border-zinc-300 hover:bg-zinc-100"
                                                                )}
                                                            >
                                                                {isSelected ? "Selected ✓" : "Select"}
                                                            </Button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="flex items-center justify-between border-t border-zinc-200 px-6 py-3 bg-zinc-50 text-xs text-zinc-500">
                            <span>
                                Showing {filteredQuotations.length} of {quotationsList.length} quotations
                            </span>
                            <Button
                                type="button"
                                variant="secondary"
                                shape="rounded"
                                onClick={() => setIsQtModalOpen(false)}
                                className="border border-zinc-300 bg-white px-4 py-1.5 text-xs hover:bg-zinc-100"
                            >
                                Close
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            <InventoryPickerModal
                isOpen={pickerRowIndex !== null}
                title={`Select Item${pickerRowIndex !== null ? ` (Row ${pickerRowIndex + 1})` : ""}`}
                onClose={() => setPickerRowIndex(null)}
                onSelect={handleItemSelect}
            />

            <ViewAllModal
                key={isViewAllOpen ? "open" : "closed"}
                isOpen={isViewAllOpen}
                title="All Purchase Orders"
                rows={purchaseOrders}
                columns={purchaseOrderColumns}
                searchKeys={["id", "vendorName", "date", "grandTotal"]}
                isLoading={isPurchaseOrdersLoading}
                error={purchaseOrdersError}
                onClose={() => setIsViewAllOpen(false)}
                onRowSelect={(item) => {
                    reset(mapPurchaseOrderToForm(item));
                    setIsNewMode(false);
                    setIsEditing(false);
                    setIsViewAllOpen(false);
                }}
                onDelete={() => undefined}
            />
        </section>
    );
}
