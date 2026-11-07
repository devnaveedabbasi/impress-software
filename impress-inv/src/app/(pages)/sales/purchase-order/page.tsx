"use client";

import { useEffect, useRef, useState } from "react";
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

type ApiError = {
    response?: {
        status?: number;
        data?: { message?: string };
    };
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
    const [quotations, setQuotations] = useState<{ label: string; value: string }[]>([]);
    const [inventoryItems, setInventoryItems] = useState<{ label: string; value: string }[]>([]);

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
            const [vendorRes, qtRes, invRes] = await Promise.allSettled([
                api.get(VENDORS),
                api.get(QUOTATIONS),
                api.get(INVENTORY),
            ]);
            if (vendorRes.status === "fulfilled") {
                setVendors((vendorRes.value.data.data || []).map((v: any) => ({
                    label: v.vendorName || v.name,
                    value: String(v.id),
                })));
            }
            if (qtRes.status === "fulfilled") {
                setQuotations((qtRes.value.data.data || []).map((q: any) => ({
                    label: `QT-${q.id}`,
                    value: String(q.id),
                })));
            }
            if (invRes.status === "fulfilled") {
                setInventoryItems((invRes.value.data.data || []).map((i: any) => ({
                    label: i.itemName,
                    value: i.itemName,
                })));
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

        while (fetchedRows.length < 10) fetchedRows.push(defaultRow());
        if (fetchedRows.length > 10) fetchedRows.length = 10;

        return {
            id: String(po.id),
            date: po.date ? new Date(po.date).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
            vendorId: String(po.vendorId ?? ""),
            validity: po.validity || "",
            instruction: po.instruction || "",
            quotationId: String(po.quotationId ?? ""),
            items: fetchedRows,
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

    const handleQuotationChange = async (val: string) => {
        setValue("quotationId", val, { shouldDirty: true, shouldValidate: true });
        if (!val) return;
        try {
            const { data } = await api.get(`${QUOTATIONS}/${val}`);
            if (data.data) {
                const q = data.data;
                const fetchedRows = (q.itemName || []).map((name: string, i: number) => {
                    const rate = q.approvedRate?.[i] ?? q.proposedRate?.[i] ?? q.oldRate?.[i] ?? 0;
                    return {
                        code: "",
                        itemName: name || "",
                        unit: "1",
                        quantity: "1",
                        rate: String(rate),
                        amount: String(rate * 1),
                    };
                });

                while (fetchedRows.length < 10) fetchedRows.push(defaultRow());
                if (fetchedRows.length > 10) fetchedRows.length = 10;

                setValue("vendorId", String(q.vendorId ?? ""), { shouldDirty: true, shouldValidate: true });
                setValue("items", fetchedRows, { shouldDirty: true, shouldValidate: true });
                toast.success("Quotation items loaded");
            }
        } catch (error) {
            console.error("Failed to load quotation details", error);
            toast.error("Failed to load quotation details");
        }
    };

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
                    <div className="flex-1 w-full space-y-1.5 max-w-[500px]">
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
                        <LabeledField
                            label="Instruction"
                            value={values.instruction}
                            onChange={(e) =>
                                setValue("instruction", e.target.value, {
                                    shouldDirty: true,
                                    shouldValidate: true,
                                })
                            }
                            error={errors.instruction?.message}
                            disabled={!isEditing}
                        />
                        <LabeledSelect
                            label="QT ID"
                            options={quotations}
                            value={values.quotationId}
                            onChange={(val) => handleQuotationChange(String(val))}
                            error={errors.quotationId?.message}
                            disabled={!isEditing || isOptionsLoading}
                            placeholder={isOptionsLoading ? "Loading quotations..." : "Select Quotation"}
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
                                <tr key={index} className="border-b border-zinc-300 last:border-b-0">
                                    <td className="border-r border-zinc-300 p-0">
                                        <input
                                            type="number"
                                            value={row.code}
                                            onChange={(e) => updateItemRow(index, "code", e.target.value)}
                                            disabled={!isEditing}
                                            className="w-full bg-transparent px-2 py-1.5 text-center text-[13px] outline-none disabled:bg-[#f3f4f6]"
                                        />
                                    </td>
                                    <td className="border-r border-zinc-300 p-0">
                                        <select
                                            value={row.itemName}
                                            onChange={(e) => updateItemRow(index, "itemName", e.target.value)}
                                            disabled={!isEditing}
                                            className="w-full bg-transparent px-2 py-1.5 text-[13px] outline-none disabled:bg-[#f3f4f6]"
                                        >
                                            <option value="">Select Item</option>
                                            {inventoryItems.map((item) => (
                                                <option key={item.value} value={item.value}>
                                                    {item.label}
                                                </option>
                                            ))}
                                        </select>
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
                                    <td className="p-0">
                                        <input
                                            type="number"
                                            value={row.amount}
                                            readOnly
                                            disabled={!isEditing}
                                            className="w-full bg-transparent px-2 py-1.5 text-center text-[13px] outline-none disabled:bg-[#f3f4f6] text-zinc-600"
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
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
