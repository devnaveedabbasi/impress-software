"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { inwardSchema, type InwardFormValues } from "@/lib/validations/master";
import { INWARDS, PURCHASE_ORDERS, INVENTORY } from "@/utlis/apiRoutes";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import useDebounce from "@/hooks/useDebounce";
import { usePermissions } from "@/hooks/usePermissions";
import { ViewAllModal, type ViewAllColumn } from "@/components/ui/ViewAllModal";
import { Button } from "@/components/ui/Button";
import { AddRowButton } from "@/components/ui/AddRowButton";
import { Icon } from "@iconify/react";
import { TextDetailModal } from "@/components/ui/TextDetailModal";
import { previewText } from "@/lib/text";

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

    const [inventoryRows, setInventoryRows] = useState<InventoryPickRow[]>([]);
    const [isInventoryLoading, setIsInventoryLoading] = useState(true);
    const [pickerRowIndex, setPickerRowIndex] = useState<number | null>(null);
    const [isPoLoading, setIsPoLoading] = useState(false);
    const poRequestRef = useRef(0);

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
            const [poRes, inventoryRes] = await Promise.allSettled([
                api.get(PURCHASE_ORDERS),
                api.get(INVENTORY),
            ]);
            if (poRes.status === "fulfilled") {
                setPurchaseOrders((poRes.value.data.data || []).map((po: any) => ({
                    label: `PO-${po.id}`,
                    value: String(po.id),
                })));
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

    const refreshPurchaseOrders = async () => {
        try {
            const { data } = await api.get(PURCHASE_ORDERS);
            setPurchaseOrders(
                (data.data || []).map((po: { id: number }) => ({
                    label: `PO-${po.id}`,
                    value: String(po.id),
                }))
            );
        } catch (error) {
            console.error("Failed to refresh purchase orders", error);
        }
    };

    const handlePOChange = async (val: string) => {
        const poId = val.trim();
        setValue("purchaseOrderId", poId, { shouldDirty: true, shouldValidate: true });
        if (!poId) return;

        // Only the latest request may update the form (user can click Find Po / change PO quickly)
        const requestId = ++poRequestRef.current;
        setIsPoLoading(true);
        try {
            // Load the PO and the latest inwards together, the received qty must not come from a stale cache
            const [poResult, inwardsResult] = await Promise.allSettled([
                api.get(`${PURCHASE_ORDERS}/${poId}`),
                api.get(INWARDS),
            ]);
            if (requestId !== poRequestRef.current) return;

            if (poResult.status === "rejected") {
                const apiError = poResult.reason as ApiError;
                if (apiError.response?.status === 404) {
                    toast.error(`PO #${poId} not found`);
                    setValue("purchaseOrderId", "", { shouldDirty: true });
                    void refreshPurchaseOrders();
                } else if (apiError.response?.status === 403) {
                    toast.error(apiError.response?.data?.message || "You do not have permission to view this PO");
                } else {
                    toast.error(apiError.response?.data?.message || "Failed to load PO details");
                }
                return;
            }

            const data = poResult.value.data;
            const inwardList: InwardRow[] =
                inwardsResult.status === "fulfilled" ? inwardsResult.value.data.data || [] : inwards;

            if (data.data) {
                const po = data.data;

                // Qty already received against this PO per inventory item in earlier inwards
                // (the inward being edited is excluded, its own rows are loaded again)
                const receivedByInventory = new Map<number, number>();
                for (const inv of inwardList) {
                    if (String(inv.purchaseOrderId) !== poId) continue;
                    if (!isNewMode && String(inv.id) === String(values.id)) continue;
                    for (const item of inv.items || []) {
                        receivedByInventory.set(
                            item.inventoryId,
                            (receivedByInventory.get(item.inventoryId) || 0) + (Number(item.recQty) || 0)
                        );
                    }
                }

                // A PO stores the item name (and a code), and can list the same item on several rows.
                // Link every PO row to its inventory item and add up the ordered qty per inventory item.
                const unmatched: string[] = [];
                const groups = new Map<string, { inventoryId: string; itemName: string; ordered: number }>();
                (po.itemName || []).forEach((name: string, i: number) => {
                    const ordered = Number(po.quantity?.[i]) || 0;
                    const candidates = inventoryRows.filter(
                        (inventory) => normalizeName(inventory.itemName) === normalizeName(name)
                    );
                    const code = Number(po.code?.[i]);
                    const inventoryItem = candidates.find((inventory) => inventory.id === code) ?? candidates[0];

                    if (!inventoryItem) {
                        unmatched.push(name);
                        groups.set(`raw:${i}`, { inventoryId: "", itemName: name, ordered });
                        return;
                    }
                    const key = `inv:${inventoryItem.id}`;
                    const existing = groups.get(key);
                    if (existing) existing.ordered += ordered;
                    else groups.set(key, { inventoryId: String(inventoryItem.id), itemName: inventoryItem.itemName, ordered });
                });

                const fetchedRows = [...groups.values()].map((group) => {
                    const received = group.inventoryId ? receivedByInventory.get(Number(group.inventoryId)) || 0 : 0;
                    return {
                        inventoryId: group.inventoryId,
                        itemName: group.itemName,
                        poBalQty: String(Math.max(group.ordered - received, 0)),
                        recQty: "",
                        rejQty: "",
                        okQty: "",
                        packingDetail: "",
                    };
                });

                setValue("name", po.vendor?.vendorName || po.vendor?.name || "", { shouldDirty: true });
                setValue("quotationId", String(po.quotationId || ""), { shouldDirty: true });
                setValue("Type", "againstPO", { shouldDirty: true });
                setValue("items", padRows(fetchedRows, defaultRow), { shouldDirty: true, shouldValidate: true });

                if (fetchedRows.length === 0) {
                    toast.error(`PO #${poId} has no items`);
                } else if (fetchedRows.every((row: { poBalQty: string }) => Number(row.poBalQty) === 0)) {
                    toast.error(`PO #${poId} is fully received, nothing is left to receive`, { duration: 5000 });
                } else if (unmatched.length > 0) {
                    toast.error(
                        `Not found in inventory: ${[...new Set(unmatched)].join(", ")}. Click Item Name to select the correct item.`,
                        { duration: 6000 }
                    );
                } else {
                    toast.success(`PO #${poId} loaded (${fetchedRows.length} item${fetchedRows.length === 1 ? "" : "s"})`);
                }
            }
        } catch (error) {
            console.error("Failed to load PO details", error);
            if (requestId === poRequestRef.current) toast.error("Failed to load PO details");
        } finally {
            if (requestId === poRequestRef.current) setIsPoLoading(false);
        }
    };

    const updateItemRow = (index: number, field: keyof typeof initialValues.items[0], value: string) => {
        const currentItems = [...values.items];
        if (field === "itemName" && value === "") {
            currentItems[index] = defaultRow();
        } else {
            const isQtyField = field === "recQty" || field === "rejQty" || field === "poBalQty";

            if (isQtyField) {
                // Quantities only make sense for a row that is linked to an inventory item
                if (!currentItems[index].inventoryId) {
                    toast.error(`Row ${index + 1}: Select Item Name first`, { id: `qty-limit-${index}` });
                    return;
                }
                if (field === "rejQty" && !currentItems[index].recQty) {
                    toast.error(`Row ${index + 1}: Enter Rec Qty first`, { id: `qty-limit-${index}` });
                    return;
                }
            }

            // Qty fields accept whole positive numbers only
            const cleanValue = isQtyField ? value.replace(/\D/g, "").replace(/^0+(?=\d)/, "") : value;
            const newRow = { ...currentItems[index], [field]: cleanValue };

            if (field === "recQty" || field === "rejQty" || field === "poBalQty") {
                const poBal = Number(newRow.poBalQty) || 0;
                let rec = Number(newRow.recQty) || 0;
                let rej = Number(newRow.rejQty) || 0;

                // Rec Qty cannot be more than the PO balance. For a row loaded from a PO the limit also
                // applies when the balance is 0 (already fully received); otherwise only when a balance is set.
                const hasPoLimit = newRow.poBalQty !== "" && (isPoBalLocked || poBal > 0);
                if (hasPoLimit && rec > poBal) {
                    rec = poBal;
                    newRow.recQty = poBal > 0 ? String(poBal) : "";
                    toast.error(
                        poBal === 0
                            ? `Row ${index + 1}: PO Bal Qty is 0, nothing is left to receive for this item`
                            : field === "poBalQty"
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
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const openPackingModal = (index: number) => setPackingRowIndex(index);

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

    // Print the currently opened (saved) entry as a slip. Filters/reports live on the Report page.
    const handlePrint = () => {
        if (isNewMode || !values.id) {
            toast.error("Open a saved entry first (enter its Q.C No or use View All) to print it");
            return;
        }
        window.open(`/print/inward-quality-control-slip?id=${values.id}`, "_blank");
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
                            disabled={!isEditing || isPoLoading}
                            className="border border-zinc-300 px-2 py-1 outline-none w-24 bg-white"
                        >
                            <option value="">Select</option>
                            {/* Keep the loaded PO selectable even if the list was fetched before it was created */}
                            {values.purchaseOrderId &&
                                !purchaseOrders.some((po) => po.value === values.purchaseOrderId) && (
                                    <option value={values.purchaseOrderId}>{values.purchaseOrderId}</option>
                                )}
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
                            onClick={() => {
                                if (!values.purchaseOrderId) {
                                    toast.error("Select a PO# first");
                                    return;
                                }
                                void handlePOChange(values.purchaseOrderId);
                            }}
                            disabled={!isEditing || isPoLoading}
                            className="flex min-w-24 items-center justify-center gap-2 bg-white border border-zinc-300 px-4 py-1 text-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isPoLoading && (
                                <span
                                    aria-hidden
                                    className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
                                />
                            )}
                            {isPoLoading ? "Finding..." : "Find Po"}
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
                    {/* Shows the first few words only, a click opens the full text in a modal */}
                    <button
                        type="button"
                        onClick={() => (isEditing || values.detail) && setIsDetailOpen(true)}
                        title={values.detail || (isEditing ? "Click to add details" : undefined)}
                        className={`border px-2 py-1 outline-none flex-1 bg-white text-left truncate min-h-[30px] ${
                            errors.detail ? "border-red-400" : "border-zinc-300"
                        } ${values.detail ? "text-black" : "text-zinc-400"} ${
                            isEditing ? "cursor-pointer hover:bg-primary-50" : "cursor-default bg-[#f3f4f6]"
                        }`}
                    >
                        {previewText(values.detail ?? "", 6, 50) || (isEditing ? "Click to add details" : " ")}
                    </button>
                </div>

                {/* Table Section */}
                <div className="relative bg-white mb-6 overflow-x-auto border border-zinc-300" aria-busy={isPoLoading}>
                    {isPoLoading && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70">
                            <span className="flex items-center gap-2 text-sm text-zinc-700">
                                <span
                                    aria-hidden
                                    className="h-4 w-4 animate-spin rounded-full border-2 border-primary-500 border-t-transparent"
                                />
                                Loading PO items...
                            </span>
                        </div>
                    )}
                    <table className="w-full table-fixed border-collapse text-[13px] text-black">
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
                                    <td className="relative border-r border-zinc-200 p-0">
                                        <input
                                            type="text"
                                            value={row.inventoryId}
                                            readOnly
                                            tabIndex={-1}
                                            title={
                                                row.itemName && !row.inventoryId
                                                    ? "Not linked to inventory, click Item Name to select it"
                                                    : "Inventory item code (set by selecting Item Name)"
                                            }
                                            disabled={!isEditing}
                                            className="w-full bg-transparent px-2 py-1 text-center outline-none disabled:bg-[#f3f4f6]"
                                        />
                                        {row.itemName && !row.inventoryId && (
                                            <Icon
                                                icon="mdi:alert-circle-outline"
                                                className="pointer-events-none absolute right-1 top-1/2 h-4 w-4 -translate-y-1/2 text-red-500"
                                            />
                                        )}
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
                                            disabled={!isEditing}
                                            className="w-full bg-transparent px-2 py-1 text-center outline-none disabled:bg-[#f3f4f6]"
                                        />
                                    </td>
                                    <td className="border-r border-zinc-200 p-0">
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            value={row.recQty}
                                            onChange={(e) => updateItemRow(index, "recQty", e.target.value)}
                                            disabled={!isEditing}
                                            title={
                                                !row.inventoryId
                                                    ? "Select Item Name first"
                                                    : row.poBalQty !== "" && (isPoBalLocked || Number(row.poBalQty) > 0)
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
                                            disabled={!isEditing}
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
                                            {previewText(row.packingDetail ?? "") || (isEditing ? "Click to add" :" ")}
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
                    <AddRowButton onClick={addItemRow} disabled={!isEditing} />
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
                        onClick={handlePrint}
                        disabled={isSubmitting || isNewMode || !canView}
                        title={isNewMode ? "Open a saved entry to print it" : "Print this entry"}
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

            {/* Packing Detail modal (optional text, max 255 characters) */}
            <TextDetailModal
                isOpen={packingRowIndex !== null}
                title="Packing Detail"
                subtitle={
                    packingRowIndex !== null
                        ? `Row ${packingRowIndex + 1}${values.items[packingRowIndex]?.itemName ? ` · ${values.items[packingRowIndex].itemName}` : ""}`
                        : undefined
                }
                value={packingRowIndex !== null ? values.items[packingRowIndex]?.packingDetail ?? "" : ""}
                readOnly={!isEditing}
                maxLength={255}
                placeholder="e.g. 5 cartons x 10 pcs, sealed, no damage"
                onSave={(text) => {
                    if (packingRowIndex !== null) updateItemRow(packingRowIndex, "packingDetail", text);
                    setPackingRowIndex(null);
                }}
                onClose={() => setPackingRowIndex(null)}
            />

            {/* Details modal (required, 3-255 characters) */}
            <TextDetailModal
                isOpen={isDetailOpen}
                title="Details"
                value={values.detail ?? ""}
                readOnly={!isEditing}
                required
                minLength={3}
                maxLength={255}
                placeholder="Write the details of this inward entry"
                onSave={(text) => {
                    setValue("detail", text, { shouldDirty: true, shouldValidate: true });
                    setIsDetailOpen(false);
                }}
                onClose={() => setIsDetailOpen(false)}
            />
        </section>
    );
}
