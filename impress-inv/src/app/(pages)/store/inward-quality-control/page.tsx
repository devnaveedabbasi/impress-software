"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { inwardSchema, type InwardFormValues } from "@/lib/validations/master";
import { INWARDS, PURCHASE_ORDERS, VENDORS, INVENTORY } from "@/utlis/apiRoutes";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import useDebounce from "@/hooks/useDebounce";
import { usePermissions } from "@/hooks/usePermissions";
import { ViewAllModal, type ViewAllColumn } from "@/components/ui/ViewAllModal";
import { Button } from "@/components/ui/Button";
import { Icon } from "@iconify/react";

type InwardRow = {
    id: number;
    date: string;
    Type: "againstSimple" | "againstPO" | "againstDealarRejection";
    purchaseOrderId?: number | null;
    quotationId?: number | null;
    GRIRNo: number;
    DCNo: number;
    billNO?: number | null;
    detail: string;
    name?: string;
    items?: InwardItemRow[];
    purchaseOrder?: { vendor?: { vendorName?: string; name?: string } };
    quotation?: { vendor?: { vendorName?: string; name?: string } };
    [key: string]: unknown;
};

// One item row of an inward, linked to an Inventory item
type InwardItemRow = {
    id: number;
    inventoryId: number;
    inventory?: { id: number; itemName: string } | null;
    poBalQty: number;
    recQty: number;
    rejQty: number;
    okQty: number;
    packingDetail: string;
};

type ApiError = {
    response?: {
        status?: number;
        data?: { message?: string };
    };
};

type InventoryPickRow = {
    id: number;
    itemName: string;
    categoryName: string;
    stock: number;
    [key: string]: unknown;
};

const MIN_ROWS = 10;

const padRows = <T,>(rows: T[], makeRow: () => T): T[] => {
    const padded = [...rows];
    while (padded.length < MIN_ROWS) padded.push(makeRow());
    return padded;
};

const normalizeName = (name: string | undefined | null) => String(name || "").trim().toLowerCase();

const defaultRow = () => ({
    inventoryId: "",
    itemName: "",
    poBalQty: "",
    recQty: "",
    rejQty: "",
    okQty: "",
    packingDetail: "",
});

const initialValues: InwardFormValues = {
    id: "",
    date: new Date().toISOString().split("T")[0],
    Type: "againstPO",
    purchaseOrderId: "",
    quotationId: "",
    GRIRNo: "",
    DCNo: "",
    billNO: "",
    detail: "",
    name: "",
    items: Array.from({ length: 10 }, defaultRow),
};

export default function InwardQualityControlPage() {
    const [isNewMode, setIsNewMode] = useState(true);
    const [isEditing, setIsEditing] = useState(true);
    const [purchaseOrders, setPurchaseOrders] = useState<{ label: string; value: string }[]>([]);

    // Print Modal State
    const [showPrintModal, setShowPrintModal] = useState(false);
    const [vendors, setVendors] = useState<{ label: string; value: string }[]>([]);
    const [itemOptions, setItemOptions] = useState<{ label: string; value: string }[]>([]);
    const [inventoryRows, setInventoryRows] = useState<InventoryPickRow[]>([]);
    const [isInventoryLoading, setIsInventoryLoading] = useState(true);
    const [pickerRowIndex, setPickerRowIndex] = useState<number | null>(null);
    const [printVendorId, setPrintVendorId] = useState("");
    const [printFromDate, setPrintFromDate] = useState("");
    const [printToDate, setPrintToDate] = useState("");
    const [printItemName, setPrintItemName] = useState("");
    const [printStatus, setPrintStatus] = useState("");

    const { hasPermission } = usePermissions();
    const canCreate = hasPermission("inward_quality_control", "create");
    const canUpdate = hasPermission("inward_quality_control", "update");
    const canView = hasPermission("inward_quality_control", "view");

    const [isIdLoading, setIsIdLoading] = useState(true);
    const [nextId, setNextId] = useState("");
    const [isViewAllOpen, setIsViewAllOpen] = useState(false);
    const [inwards, setInwards] = useState<InwardRow[]>([]);
    const [hasLoadedInwards, setHasLoadedInwards] = useState(false);
    const [isInwardsLoading, setIsInwardsLoading] = useState(false);
    const [inwardsError, setInwardsError] = useState("");
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
    } = useForm<InwardFormValues>({ defaultValues: initialValues });
    const values = watch();

    const fetchOptions = async () => {
        try {
            const [poRes, vendorRes, inventoryRes] = await Promise.allSettled([
                api.get(PURCHASE_ORDERS),
                api.get(VENDORS),
                api.get(INVENTORY),
            ]);
            if (poRes.status === "fulfilled") {
                setPurchaseOrders((poRes.value.data.data || []).map((po: any) => ({
                    label: `PO-${po.id}`,
                    value: String(po.id),
                })));
            }
            if (vendorRes.status === "fulfilled") {
                setVendors([
                    { label: "All Vendors", value: "" },
                    ...(vendorRes.value.data.data || []).map((v: any) => ({
                        label: v.vendorName || v.name,
                        value: String(v.id),
                    })),
                ]);
            }
            if (inventoryRes.status === "fulfilled") {
                const inventoryList = inventoryRes.value.data.data || [];
                setInventoryRows(
                    inventoryList.map((item: any) => ({
                        id: item.id,
                        itemName: item.itemName,
                        categoryName: item.category?.name || "-",
                        stock: Array.isArray(item.stocks)
                            ? item.stocks.reduce(
                                  (sum: number, row: { qty: number }) => sum + (Number(row.qty) || 0),
                                  0
                              )
                            : 0,
                    }))
                );
                const names: string[] = Array.from(
                    new Set(inventoryList.map((item: any) => item.itemName))
                );
                setItemOptions([
                    { label: "All Items", value: "" },
                    ...names.map((name) => ({ label: name, value: name })),
                ]);
            }
        } catch (error) {
            console.error("Failed to fetch dropdown options", error);
        } finally {
            setIsInventoryLoading(false);
        }
    };

    const fetchNextId = async () => {
        setIsIdLoading(true);
        try {
            const { data } = await api.get(`${INWARDS}/next-id`, {
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
            console.error("Failed to fetch next Inward ID", error);
        } finally {
            setIsIdLoading(false);
        }
    };

    const mapInwardToForm = (inv: any): InwardFormValues => {
        const fetchedRows = ((inv.items || []) as InwardItemRow[]).map((item) => ({
            inventoryId: String(item.inventoryId),
            itemName: item.inventory?.itemName || `Item #${item.inventoryId}`,
            poBalQty: String(item.poBalQty ?? 0),
            recQty: String(item.recQty ?? 0),
            rejQty: String(item.rejQty ?? 0),
            okQty: String(item.okQty ?? 0),
            packingDetail: item.packingDetail || "",
        }));

        return {
            id: String(inv.id),
            date: inv.date ? new Date(inv.date).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
            Type: inv.Type || "againstPO",
            purchaseOrderId: inv.purchaseOrderId ? String(inv.purchaseOrderId) : "",
            quotationId: inv.quotationId ? String(inv.quotationId) : "",
            GRIRNo: inv.GRIRNo !== undefined && inv.GRIRNo !== null ? String(inv.GRIRNo) : "",
            DCNo: inv.DCNo !== undefined && inv.DCNo !== null ? String(inv.DCNo) : "",
            billNO: inv.billNO !== undefined && inv.billNO !== null ? String(inv.billNO) : "",
            detail: inv.detail || "",
            name: inv.purchaseOrder?.vendor?.vendorName || inv.purchaseOrder?.vendor?.name || inv.quotation?.vendor?.vendorName || "",
            items: padRows(fetchedRows, defaultRow),
        };
    };

    const fetchAllInwards = async (openModal = true, force = false) => {
        if (openModal) setIsViewAllOpen(true);
        if (hasLoadedInwards && !force) return;

        setIsInwardsLoading(true);
        setInwardsError("");
        try {
            const { data } = await api.get(INWARDS);
            setInwards(
                (data.data || []).map((item: InwardRow) => ({
                    ...item,
                    date: item.date ? new Date(item.date).toISOString().split("T")[0] : "",
                }))
            );
            setHasLoadedInwards(true);
        } catch (error: unknown) {
            const apiError = error as ApiError;
            setInwardsError(apiError.response?.data?.message || "Failed to fetch inwards");
        } finally {
            setIsInwardsLoading(false);
        }
    };

    const addInwardToCache = (item: InwardRow) => {
        setInwards((current) => {
            const cachedItem = {
                ...item,
                date: item.date ? new Date(item.date).toISOString().split("T")[0] : "",
            };
            const existingIndex = current.findIndex(
                (c) => String(c.id) === String(item.id)
            );
            if (existingIndex === -1) return [...current, cachedItem];
            return current.map((c, index) => (index === existingIndex ? cachedItem : c));
        });
        setHasLoadedInwards(true);
    };

    useEffect(() => {
        void fetchNextId();
        void fetchOptions();
        void fetchAllInwards(false);
    }, []);

    const onSubmit = async (data: InwardFormValues) => {
        const validationResult = inwardSchema.safeParse(data);
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

        clearErrors();
        const validRows = data.items.filter((r) => r.inventoryId && r.recQty);
        if (validRows.length === 0) {
            toast.error("Please add at least one item");
            return;
        }

        const payload = {
            date: new Date(data.date).toISOString(),
            Type: data.Type,
            purchaseOrderId: data.purchaseOrderId ? Number(data.purchaseOrderId) : null,
            quotationId: data.quotationId ? Number(data.quotationId) : null,
            GRIRNo: Number(data.GRIRNo),
            DCNo: Number(data.DCNo),
            billNO: data.billNO ? Number(data.billNO) : null,
            detail: data.detail,

            items: validRows.map((r) => ({
                inventoryId: Number(r.inventoryId),
                poBalQty: Number(r.poBalQty) || 0,
                recQty: Number(r.recQty) || 0,
                rejQty: Number(r.rejQty) || 0,
                packingDetail: r.packingDetail || "",
            })),
        };

        try {
            const response = isNewMode
                ? await api.post(INWARDS, payload)
                : await api.put(`${INWARDS}/${data.id}`, payload);

            toast.success(response.data.message || "Inward saved successfully");
            if (hasLoadedInwards) {
                setHasLoadedInwards(false);
                await fetchAllInwards(false, true);
            }
            refreshNextIdAfterSubmit.current = true;
        } catch (error: unknown) {
            const apiError = error as ApiError;
            console.error("Inward save failed:", apiError.response?.data || error);
            toast.error(apiError.response?.data?.message || "Failed to save Inward");
        }
    };

    useEffect(() => {
        if (!isSubmitting && refreshNextIdAfterSubmit.current) {
            refreshNextIdAfterSubmit.current = false;
            void fetchNextId();
        }
    }, [isSubmitting]);

    const debouncedId = useDebounce(values.id, 500);
    const inwardColumns: ViewAllColumn<InwardRow>[] = [
        { key: "id", header: "Inward ID" },
        { key: "date", header: "Date" },
        { key: "GRIRNo", header: "GRIR No" },
        { key: "DCNo", header: "DC No" },
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
                const cached = inwards.find((item) => String(item.id) === debouncedId);
                const inv = cached || (await api.get(`${INWARDS}/${debouncedId}`)).data.data;

                if (!inv) {
                    toast.error("Inward record not found");
                    resetToNextId();
                    return;
                }

                if (!cached) addInwardToCache(inv);
                reset(mapInwardToForm(inv));
                setIsNewMode(false);
                setIsEditing(false);
            } catch (error: unknown) {
                const apiError = error as ApiError;
                toast.error(
                    apiError.response?.status === 403
                        ? apiError.response?.data?.message || "Access denied. You do not have permission."
                        : "Inward record not found"
                );
                resetToNextId();
            } finally {
                setIsIdLoading(false);
            }
        };

        void fetchDebouncedId();
    }, [debouncedId, nextId, canView, inwards]);

    const handlePOChange = async (val: string) => {
        setValue("purchaseOrderId", val, { shouldDirty: true, shouldValidate: true });
        if (!val) return;
        try {
            const { data } = await api.get(`${PURCHASE_ORDERS}/${val}`);
            if (data.data) {
                const po = data.data;

                // Qty already received against this PO in earlier inwards (excluding the record being edited)
                const receivedByItem: Record<string, number> = {};
                for (const inv of inwards) {
                    if (String(inv.purchaseOrderId) !== String(val)) continue;
                    if (!isNewMode && String(inv.id) === String(values.id)) continue;
                    for (const item of inv.items || []) {
                        const key = normalizeName(item.inventory?.itemName);
                        receivedByItem[key] = (receivedByItem[key] || 0) + (Number(item.recQty) || 0);
                    }
                }

                // PO items are stored by name — link each one to its Inventory item by name
                const unmatched: string[] = [];
                const fetchedRows = (po.itemName || []).map((name: string, i: number) => {
                    const ordered = Number(po.quantity?.[i]) || 0;
                    const balance = Math.max(ordered - (receivedByItem[normalizeName(name)] || 0), 0);
                    const inventoryItem = inventoryRows.find(
                        (inventory) => normalizeName(inventory.itemName) === normalizeName(name)
                    );
                    if (!inventoryItem) unmatched.push(name);
                    return {
                        inventoryId: inventoryItem ? String(inventoryItem.id) : "",
                        itemName: inventoryItem?.itemName || name,
                        poBalQty: String(balance),
                        recQty: "",
                        rejQty: "",
                        okQty: "",
                        packingDetail: "",
                    };
                });

                setValue("name", po.vendor?.vendorName || po.vendor?.name || "", { shouldDirty: true });
                setValue("quotationId", String(po.quotationId || ""), { shouldDirty: true });
                setValue("items", padRows(fetchedRows, defaultRow), { shouldDirty: true, shouldValidate: true });
                if (unmatched.length > 0) {
                    toast.error(
                        `Not found in inventory: ${unmatched.join(", ")}. Click Item Name to select the correct item.`,
                        { duration: 6000 }
                    );
                } else {
                    toast.success("PO details loaded");
                }
            }
        } catch (error) {
            console.error("Failed to load PO details", error);
            toast.error("Failed to load PO details");
        }
    };

    const updateItemRow = (index: number, field: keyof typeof initialValues.items[0], value: string) => {
        const currentItems = [...values.items];
        if (field === "itemName" && value === "") {
            currentItems[index] = defaultRow();
        } else {
            const isQtyField = field === "recQty" || field === "rejQty" || field === "poBalQty";
            // Qty fields accept whole positive numbers only
            const cleanValue = isQtyField ? value.replace(/\D/g, "").replace(/^0+(?=\d)/, "") : value;
            const newRow = { ...currentItems[index], [field]: cleanValue };

            if (field === "recQty" || field === "rejQty" || field === "poBalQty") {
                const poBal = Number(newRow.poBalQty) || 0;
                let rec = Number(newRow.recQty) || 0;
                let rej = Number(newRow.rejQty) || 0;

                // Rec Qty cannot be more than the PO balance (when the row came from a PO)
                if (poBal > 0 && rec > poBal) {
                    rec = poBal;
                    newRow.recQty = String(poBal);
                    toast.error(
                        field === "poBalQty"
                            ? `Row ${index + 1}: Rec Qty reduced to ${poBal} to match PO Bal Qty`
                            : `Row ${index + 1}: Rec Qty cannot be more than PO Bal Qty (${poBal})`,
                        { id: `qty-limit-${index}` }
                    );
                }

                // REJ Qty cannot be more than Rec Qty
                if (rej > rec) {
                    rej = rec;
                    newRow.rejQty = newRow.recQty === "" ? "" : String(rec);
                    if (field === "rejQty") {
                        toast.error(
                            rec > 0
                                ? `Row ${index + 1}: REJ Qty cannot be more than Rec Qty (${rec})`
                                : `Row ${index + 1}: Enter Rec Qty first`,
                            { id: `qty-limit-${index}` }
                        );
                    }
                }

                newRow.okQty = newRow.recQty === "" && newRow.rejQty === "" ? "" : String(Math.max(rec - rej, 0));
            }
            currentItems[index] = newRow;
        }
        setValue("items", currentItems, { shouldDirty: true, shouldValidate: true });
    };

    // Packing Detail modal
    const [packingRowIndex, setPackingRowIndex] = useState<number | null>(null);
    const [packingDraft, setPackingDraft] = useState("");

    const openPackingModal = (index: number) => {
        setPackingDraft(values.items[index]?.packingDetail || "");
        setPackingRowIndex(index);
    };

    const savePackingDetail = () => {
        if (packingRowIndex === null) return;
        updateItemRow(packingRowIndex, "packingDetail", packingDraft.trim());
        setPackingRowIndex(null);
    };

    // PO Bal Qty comes from the PO when an "Against PO" inward has a PO selected; otherwise the user enters it
    const isPoBalLocked = values.Type === "againstPO" && !!values.purchaseOrderId;

    const rowHasData = (row: (typeof values.items)[number]) =>
        !!(row.inventoryId || row.itemName || row.recQty || row.rejQty || row.packingDetail);

    const removeItemRow = (index: number) => {
        const remaining = values.items.filter((_, i) => i !== index);
        setValue("items", padRows(remaining, defaultRow), { shouldDirty: true });
    };

    const addItemRow = () => {
        setValue("items", [...values.items, defaultRow()], { shouldDirty: true });
    };

    const handleInventorySelect = (item: InventoryPickRow) => {
        if (pickerRowIndex === null) return;
        const duplicateIndex = values.items.findIndex(
            (row, i) => i !== pickerRowIndex && row.inventoryId === String(item.id)
        );
        if (duplicateIndex !== -1) {
            toast.error(`"${item.itemName}" is already added in row ${duplicateIndex + 1}`);
            return;
        }

        const currentItems = [...values.items];
        const existing = currentItems[pickerRowIndex];
        // Keep the PO balance when linking a PO row to its matching inventory item
        const sameItem = normalizeName(existing.itemName) === normalizeName(item.itemName);
        currentItems[pickerRowIndex] = {
            ...existing,
            inventoryId: String(item.id),
            itemName: item.itemName,
            // A PO balance only applies to the item that came from the PO
            poBalQty: sameItem ? existing.poBalQty : "",
        };
        setValue("items", currentItems, { shouldDirty: true });
        setPickerRowIndex(null);
    };

    const inventoryColumns: ViewAllColumn<InventoryPickRow>[] = [
        { key: "id", header: "Code" },
        { key: "itemName", header: "Item Name" },
        { key: "categoryName", header: "Category" },
        { key: "stock", header: "Stock Qty" },
    ];

    const buildPrintParams = (includeStatus = true) => {
        const params = new URLSearchParams();
        if (printVendorId) params.set("vendorId", printVendorId);
        if (printFromDate) params.set("fromDate", printFromDate);
        if (printToDate) params.set("toDate", printToDate);
        if (printItemName) params.set("itemName", printItemName);
        if (includeStatus && printStatus) params.set("status", printStatus);
        return params;
    };

    const openPrint = (path: string, includeStatus = true) => {
        window.open(`${path}?${buildPrintParams(includeStatus).toString()}`, "_blank");
        setShowPrintModal(false);
    };

    return (
        <section className="mx-auto mt-10 w-full max-w-6xl bg-[#f0f0f0] p-8 shadow-sm text-black">
            <h1 className="mb-8 text-center text-4xl text-black tracking-wide">
                Inward / Quality Control
            </h1>

            <form
                onSubmit={(event) => {
                    // Clear stale manual errors, otherwise handleSubmit blocks onSubmit forever
                    clearErrors();
                    void handleSubmit(onSubmit)(event);
                }}
                noValidate
            >
                {/* Top Section */}
                <div className="flex flex-wrap gap-4 mb-4">
                    <div className="flex items-center gap-2">
                        <label className="text-sm font-medium w-16">Q.C No</label>
                        <input
                            type={isIdLoading ? "text" : "number"}
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
                            disabled={isIdLoading}
                            min={1}
                            max={Number(nextId) || 1}
                            className="border border-zinc-300 px-2 py-1 outline-none w-24 bg-white"
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <label className="text-sm font-medium w-12 text-right">Date</label>
                        <input
                            type="date"
                            value={values.date}
                            onChange={(e) =>
                                setValue("date", e.target.value, {
                                    shouldDirty: true,
                                    shouldValidate: true,
                                })
                            }
                            disabled={!isEditing}
                            className="border border-zinc-300 px-2 py-1 outline-none w-36 bg-white"
                        />
                        {errors.date && <span className="text-xs text-red-500">{errors.date.message}</span>}
                    </div>

                    <div className="flex items-center gap-2">
                        <label className="text-sm font-medium w-10 text-right">Type</label>
                        <select
                            value={values.Type}
                            onChange={(e) =>
                                setValue("Type", e.target.value as any, {
                                    shouldDirty: true,
                                    shouldValidate: true,
                                })
                            }
                            disabled={!isEditing}
                            className="border border-zinc-300 px-2 py-1 outline-none w-40 bg-white"
                        >
                            <option value="againstPO">Against PO</option>
                            <option value="againstSimple">Against Simple</option>
                            <option value="againstDealarRejection">Against Dealer Rejection</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-2">
                        <label className="text-sm font-medium w-10 text-right">PO#</label>
                        <select
                            value={values.purchaseOrderId}
                            onChange={(e) => handlePOChange(e.target.value)}
                            disabled={!isEditing}
                            className="border border-zinc-300 px-2 py-1 outline-none w-24 bg-white"
                        >
                            <option value="">Select</option>
                            {purchaseOrders.map((po) => (
                                <option key={po.value} value={po.value}>
                                    {po.value}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex items-center">
                        <button
                            type="button"
                            onClick={() => handlePOChange(values.purchaseOrderId ?? "")}
                            disabled={!isEditing}
                            className="bg-white border border-zinc-300 px-4 py-1 text-sm hover:bg-zinc-50 disabled:opacity-50"
                        >
                            Find Po
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-2 mb-4">
                    <label className="text-sm font-medium w-16">Name</label>
                    <input
                        type="text"
                        value={values.name}
                        readOnly
                        className="border border-zinc-300 px-2 py-1 outline-none flex-1 bg-white text-black font-medium"
                    />
                </div>

                <div className="flex flex-wrap gap-4 mb-1">
                    <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                        <label className="text-sm font-medium w-20">G.R.LR No</label>
                        <input
                            type="number"
                            value={values.GRIRNo}
                            onChange={(e) =>
                                setValue("GRIRNo", e.target.value, {
                                    shouldDirty: true,
                                    shouldValidate: true,
                                })
                            }
                            disabled={!isEditing}
                            className="border border-zinc-300 px-2 py-1 outline-none w-full bg-white"
                        />
                    </div>

                    <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                        <label className="text-sm font-medium w-16 text-right">Dc No</label>
                        <input
                            type="number"
                            value={values.DCNo}
                            onChange={(e) =>
                                setValue("DCNo", e.target.value, {
                                    shouldDirty: true,
                                    shouldValidate: true,
                                })
                            }
                            disabled={!isEditing}
                            className="border border-zinc-300 px-2 py-1 outline-none w-full bg-white"
                        />
                    </div>

                    <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                        <label className="text-sm font-medium w-16 text-right">Bill No</label>
                        <input
                            type="number"
                            value={values.billNO}
                            onChange={(e) =>
                                setValue("billNO", e.target.value, {
                                    shouldDirty: true,
                                })
                            }
                            disabled={!isEditing}
                            className="border border-zinc-300 px-2 py-1 outline-none w-full bg-white"
                        />
                    </div>
                </div>
                <div className="flex flex-wrap gap-4 mb-4 min-h-4 text-xs text-red-500">
                    {errors.GRIRNo && <span>{errors.GRIRNo.message}</span>}
                    {errors.DCNo && <span>{errors.DCNo.message}</span>}
                </div>

                {errors.detail && (
                    <p className="mb-1 ml-18 text-xs text-red-500">{errors.detail.message}</p>
                )}
                <div className="flex items-center gap-2 mb-6">
                    <label className="text-sm font-medium w-16">Details</label>
                    <input
                        type="text"
                        value={values.detail}
                        onChange={(e) =>
                            setValue("detail", e.target.value, {
                                shouldDirty: true,
                                shouldValidate: true,
                            })
                        }
                        disabled={!isEditing}
                        className="border border-zinc-300 px-2 py-1 outline-none flex-1 bg-white"
                    />
                </div>

                {/* Table Section */}
                <div className="bg-white mb-6 overflow-x-auto border border-zinc-300">
                    <table className="w-full border-collapse text-[13px] text-black">
                        <thead>
                            <tr className="border-b border-zinc-300">
                                <th className="border-r border-zinc-300 px-2 py-1 font-medium w-20">
                                    Code
                                </th>
                                <th className="border-r border-zinc-300 px-2 py-1 font-medium">
                                    Item Name
                                </th>
                                <th className="border-r border-zinc-300 px-2 py-1 font-medium w-24">
                                    PO Bal Qty
                                </th>
                                <th className="border-r border-zinc-300 px-2 py-1 font-medium w-24">
                                    Rec Qty
                                </th>
                                <th className="border-r border-zinc-300 px-2 py-1 font-medium w-20">
                                    REJ Qty
                                </th>
                                <th className="border-r border-zinc-300 px-2 py-1 font-medium w-20">
                                    OK Qty
                                </th>
                                <th className="px-2 py-1 font-medium w-56">Packing Detail</th>
                            </tr>
                        </thead>
                        <tbody>
                            {values.items.map((row, index) => (
                                <tr
                                    key={index}
                                    className="group border-b border-zinc-200 last:border-b-0 hover:bg-zinc-50 has-[.row-delete:hover]:bg-red-50 has-[.row-delete:focus-visible]:bg-red-50"
                                >
                                    <td className="border-r border-zinc-200 p-0">
                                        <input
                                            type="text"
                                            value={row.inventoryId}
                                            readOnly
                                            tabIndex={-1}
                                            title="Inventory item code (set by selecting Item Name)"
                                            disabled={!isEditing}
                                            className={`w-full bg-transparent px-2 py-1 text-center outline-none disabled:bg-[#f3f4f6] ${
                                                row.itemName && !row.inventoryId ? "bg-red-50" : ""
                                            }`}
                                        />
                                    </td>
                                    <td className="border-r border-zinc-200 p-0">
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
                                            className="w-full cursor-pointer bg-transparent px-2 py-1 outline-none placeholder:text-zinc-400 hover:bg-primary-50 disabled:cursor-default disabled:bg-[#f3f4f6]"
                                        />
                                    </td>
                                    <td className="border-r border-zinc-200 p-0">
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            value={row.poBalQty}
                                            onChange={(e) => updateItemRow(index, "poBalQty", e.target.value)}
                                            readOnly={isPoBalLocked}
                                            tabIndex={isPoBalLocked ? -1 : undefined}
                                            title={
                                                isPoBalLocked
                                                    ? "Loaded from the selected PO (remaining quantity)"
                                                    : "Enter the expected / balance quantity"
                                            }
                                            disabled={!isEditing || !row.inventoryId}
                                            className={`w-full bg-transparent px-2 py-1 text-center outline-none disabled:bg-[#f3f4f6] ${
                                                isPoBalLocked ? "text-zinc-600" : ""
                                            }`}
                                        />
                                    </td>
                                    <td className="border-r border-zinc-200 p-0">
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            value={row.recQty}
                                            onChange={(e) => updateItemRow(index, "recQty", e.target.value)}
                                            disabled={!isEditing || !row.inventoryId}
                                            title={
                                                !row.inventoryId
                                                    ? "Select Item Name first"
                                                    : Number(row.poBalQty) > 0
                                                    ? `Max ${row.poBalQty} (PO Bal Qty)`
                                                    : undefined
                                            }
                                            className="w-full bg-transparent px-2 py-1 text-center outline-none disabled:bg-[#f3f4f6]"
                                        />
                                    </td>
                                    <td className="border-r border-zinc-200 p-0">
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            value={row.rejQty}
                                            onChange={(e) => updateItemRow(index, "rejQty", e.target.value)}
                                            disabled={!isEditing || !row.recQty}
                                            title={row.recQty ? `Max ${row.recQty} (Rec Qty)` : "Enter Rec Qty first"}
                                            className="w-full bg-transparent px-2 py-1 text-center outline-none disabled:bg-[#f3f4f6]"
                                        />
                                    </td>
                                    <td className="border-r border-zinc-200 p-0">
                                        <input
                                            type="number"
                                            value={row.okQty}
                                            readOnly
                                            tabIndex={-1}
                                            title="Auto calculated: Rec Qty - REJ Qty"
                                            disabled={!isEditing}
                                            className="w-full bg-transparent px-2 py-1 text-center outline-none disabled:bg-[#f3f4f6] text-black font-medium"
                                        />
                                    </td>
                                    <td className="relative p-0">
                                        {/* Packing detail: click to view / write in a modal */}
                                        <button
                                            type="button"
                                            onClick={() => openPackingModal(index)}
                                            disabled={!isEditing && !row.packingDetail}
                                            title={row.packingDetail || (isEditing ? "Click to add packing detail" : undefined)}
                                            className={`block w-full truncate px-2 py-1 text-left outline-none disabled:cursor-default ${
                                                isEditing && rowHasData(row) ? "pr-8" : ""
                                            } ${row.packingDetail ? "text-black" : "text-zinc-400"} ${
                                                isEditing ? "hover:bg-primary-50 focus-visible:bg-primary-50" : "bg-[#f3f4f6]"
                                            }`}
                                        >
                                            {row.packingDetail || (isEditing ? "Click to add" : " ")}
                                        </button>

                                        {/* Remove row: appears on row hover */}
                                        {isEditing && rowHasData(row) && (
                                            <button
                                                type="button"
                                                onClick={() => removeItemRow(index)}
                                                title="Remove this row"
                                                aria-label={`Remove row ${index + 1}`}
                                                className="row-delete absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-red-500 opacity-0 transition-opacity hover:bg-red-100 hover:text-red-700 focus-visible:opacity-100 group-hover:opacity-100"
                                            >
                                                <Icon icon="mdi:trash-can-outline" className="h-4 w-4" />
                                            </button>
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
                    <button
                        type="button"
                        onClick={addItemRow}
                        disabled={!isEditing}
                        className="border border-zinc-300 bg-white px-3 py-1 text-xs hover:bg-zinc-50 disabled:opacity-50"
                    >
                        + Add Row
                    </button>
                </div>
                {errors.items && (
                    <p className="mb-4 text-xs text-red-500 text-center">{errors.items.message}</p>
                )}

                {/* Bottom Buttons */}
                <div className="flex flex-wrap items-center justify-center gap-3">
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
                        onClick={() => fetchAllInwards()}
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
                        onClick={() => setShowPrintModal(true)}
                        className="border border-zinc-400 bg-white px-6 hover:bg-zinc-50"
                    >
                        Print
                    </Button>
                </div>
            </form>

            <ViewAllModal
                key={isViewAllOpen ? "open" : "closed"}
                isOpen={isViewAllOpen}
                title="All Inward Quality Records"
                rows={inwards}
                columns={inwardColumns}
                searchKeys={["id", "date", "GRIRNo", "DCNo"]}
                isLoading={isInwardsLoading}
                error={inwardsError}
                onClose={() => setIsViewAllOpen(false)}
                onRowSelect={(item) => {
                    reset(mapInwardToForm(item));
                    setIsNewMode(false);
                    setIsEditing(false);
                    setIsViewAllOpen(false);
                }}
                onDelete={() => undefined}
            />

            <ViewAllModal
                key={pickerRowIndex !== null ? "picker-open" : "picker-closed"}
                isOpen={pickerRowIndex !== null}
                title={`Select Inventory Item${pickerRowIndex !== null ? ` (Row ${pickerRowIndex + 1})` : ""}`}
                rows={inventoryRows}
                columns={inventoryColumns}
                searchKeys={["id", "itemName", "categoryName"]}
                isLoading={isInventoryLoading}
                error={!isInventoryLoading && inventoryRows.length === 0 ? "No inventory items found. Add items in Master Entries > Inventory." : ""}
                onClose={() => setPickerRowIndex(null)}
                onRowSelect={handleInventorySelect}
            />

            {/* Packing Detail Modal */}
            {packingRowIndex !== null && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="packing-modal-title"
                    onMouseDown={(e) => {
                        if (e.target === e.currentTarget) setPackingRowIndex(null);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === "Escape") setPackingRowIndex(null);
                        if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && isEditing) savePackingDetail();
                    }}
                >
                    <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
                        <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-5 py-4">
                            <div>
                                <h2 id="packing-modal-title" className="text-lg font-semibold text-zinc-900">
                                    Packing Detail
                                </h2>
                                <p className="text-xs text-zinc-500">
                                    Row {packingRowIndex + 1}
                                    {values.items[packingRowIndex]?.itemName
                                        ? ` · ${values.items[packingRowIndex].itemName}`
                                        : ""}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setPackingRowIndex(null)}
                                aria-label="Close"
                                className="text-2xl leading-none text-zinc-500 hover:text-zinc-900"
                            >
                                ×
                            </button>
                        </div>

                        <div className="p-4">
                            <textarea
                                value={packingDraft}
                                onChange={(e) => setPackingDraft(e.target.value.slice(0, 255))}
                                readOnly={!isEditing}
                                autoFocus
                                rows={7}
                                maxLength={255}
                                placeholder="e.g. 5 cartons x 10 pcs, sealed, no damage"
                                className="w-full resize-y rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-primary-400 read-only:bg-zinc-50"
                            />
                            <div className="mt-1 text-right text-xs text-zinc-500">{packingDraft.length}/255</div>
                        </div>

                        <div className="flex justify-end gap-2 border-t border-zinc-200 px-4 py-3">
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                shape="rounded"
                                onClick={() => setPackingRowIndex(null)}
                            >
                                {isEditing ? "Cancel" : "Close"}
                            </Button>
                            {isEditing && (
                                <Button type="button" size="sm" shape="rounded" onClick={savePackingDetail}>
                                    Done
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Print Modal */}
            {showPrintModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="w-full max-w-lg rounded border border-zinc-300 bg-white p-6 shadow-xl text-black">
                        <div className="flex items-center justify-between border-b pb-2 mb-4">
                            <h2 className="text-lg font-semibold">Print Inward QC Reports</h2>
                            <button
                                type="button"
                                onClick={() => setShowPrintModal(false)}
                                className="text-zinc-500 hover:text-black font-bold text-lg"
                            >
                                &times;
                            </button>
                        </div>

                        <div className="space-y-3 text-sm">
                            <div>
                                <label className="block text-xs font-medium text-zinc-600 mb-1">
                                    Filter by Vendor
                                </label>
                                <select
                                    value={printVendorId}
                                    onChange={(e) => setPrintVendorId(e.target.value)}
                                    className="w-full border border-zinc-300 p-1.5 outline-none bg-white rounded"
                                >
                                    {vendors.map((v) => (
                                        <option key={v.value} value={v.value}>
                                            {v.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="block text-xs font-medium text-zinc-600 mb-1">
                                        From Date
                                    </label>
                                    <input
                                        type="date"
                                        value={printFromDate}
                                        onChange={(e) => setPrintFromDate(e.target.value)}
                                        className="w-full border border-zinc-300 p-1.5 outline-none bg-white rounded"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-zinc-600 mb-1">
                                        To Date
                                    </label>
                                    <input
                                        type="date"
                                        value={printToDate}
                                        onChange={(e) => setPrintToDate(e.target.value)}
                                        className="w-full border border-zinc-300 p-1.5 outline-none bg-white rounded"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-zinc-600 mb-1">
                                    Filter by Item
                                </label>
                                <select
                                    value={printItemName}
                                    onChange={(e) => setPrintItemName(e.target.value)}
                                    className="w-full border border-zinc-300 p-1.5 outline-none bg-white rounded"
                                >
                                    {itemOptions.map((opt) => (
                                        <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-zinc-600 mb-1">
                                    Row Status Filter
                                </label>
                                <select
                                    value={printStatus}
                                    onChange={(e) => setPrintStatus(e.target.value)}
                                    className="w-full border border-zinc-300 p-1.5 outline-none bg-white rounded"
                                >
                                    <option value="">All Rows (Rejected + OK)</option>
                                    <option value="rejected">Only Rejected Rows</option>
                                    <option value="ok">Only OK Rows</option>
                                </select>
                            </div>
                        </div>

                        <div className="mt-6 flex flex-col gap-2">
                            <Button
                                type="button"
                                shape="rounded"
                                onClick={() => openPrint("/reports/inward", true)}
                                className="w-full"
                            >
                                Open Inward Quality Control Report
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                shape="rounded"
                                onClick={() => openPrint("/reports/purchase-order-balance", false)}
                                className="w-full"
                            >
                                Open Purchase Order Balance Report
                            </Button>
                            <Button
                                type="button"
                                variant="secondary"
                                shape="rounded"
                                onClick={() => setShowPrintModal(false)}
                                className="mt-1 w-full"
                            >
                                Cancel
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
