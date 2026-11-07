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
    code?: number[];
    itemName?: string[];
    poBalQty?: number[];
    recQty?: number[];
    rejQty?: number[];
    okQty?: number[];
    packingDetail?: string[];
    purchaseOrder?: { vendor?: { vendorName?: string; name?: string } };
    quotation?: { vendor?: { vendorName?: string; name?: string } };
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
                const names: string[] = Array.from(
                    new Set((inventoryRes.value.data.data || []).map((item: any) => item.itemName))
                );
                setItemOptions([
                    { label: "All Items", value: "" },
                    ...names.map((name) => ({ label: name, value: name })),
                ]);
            }
        } catch (error) {
            console.error("Failed to fetch dropdown options", error);
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
        const fetchedRows = (inv.itemName || []).map((name: string, i: number) => ({
            code: inv.code?.[i] !== undefined && inv.code?.[i] !== null ? String(inv.code[i]) : "",
            itemName: name || "",
            poBalQty: inv.poBalQty?.[i] !== undefined && inv.poBalQty?.[i] !== null ? String(inv.poBalQty[i]) : "",
            recQty: inv.recQty?.[i] !== undefined && inv.recQty?.[i] !== null ? String(inv.recQty[i]) : "",
            rejQty: inv.rejQty?.[i] !== undefined && inv.rejQty?.[i] !== null ? String(inv.rejQty[i]) : "",
            okQty: inv.okQty?.[i] !== undefined && inv.okQty?.[i] !== null ? String(inv.okQty[i]) : "",
            packingDetail: inv.packingDetail?.[i] || "",
        }));

        while (fetchedRows.length < 10) fetchedRows.push(defaultRow());
        if (fetchedRows.length > 10) fetchedRows.length = 10;

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
            items: fetchedRows,
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

        const validRows = data.items.filter((r) => r.code && r.itemName);
        if (validRows.length === 0) {
            toast.error("Please fill at least one complete row");
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

            code: validRows.map((r) => Number(r.code) || 0),
            itemName: validRows.map((r) => r.itemName),
            poBalQty: validRows.map((r) => Number(r.poBalQty) || 0),
            recQty: validRows.map((r) => Number(r.recQty) || 0),
            rejQty: validRows.map((r) => Number(r.rejQty) || 0),
            okQty: validRows.map((r) => Number(r.okQty) || 0),
            packingDetail: validRows.map((r) => r.packingDetail || ""),
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
                toast.success("Inward record found");
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
                const fetchedRows = (po.itemName || []).map((name: string, i: number) => ({
                    code: String(po.code?.[i] ?? ""),
                    itemName: name,
                    poBalQty: String(po.quantity?.[i] ?? "0"),
                    recQty: "",
                    rejQty: "",
                    okQty: "",
                    packingDetail: "",
                }));

                while (fetchedRows.length < 10) fetchedRows.push(defaultRow());
                if (fetchedRows.length > 10) fetchedRows.length = 10;

                setValue("name", po.vendor?.vendorName || po.vendor?.name || "", { shouldDirty: true });
                setValue("quotationId", String(po.quotationId || ""), { shouldDirty: true });
                setValue("items", fetchedRows, { shouldDirty: true, shouldValidate: true });
                toast.success("PO details loaded");
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
            const newRow = { ...currentItems[index], [field]: value };
            if (field === "recQty" || field === "rejQty") {
                const rec = Number(newRow.recQty) || 0;
                const rej = Number(newRow.rejQty) || 0;
                const ok = rec - rej;
                newRow.okQty = String(ok > 0 ? ok : 0);

                if (rej > 0 && ok <= 0) {
                    newRow.code = "5000"; // Fully rejected
                } else if (ok > 0) {
                    newRow.code = "2000"; // Approved (or partially approved)
                } else if (rec > 0) {
                    newRow.code = "2000"; // Has received qty
                } else {
                    newRow.code = "";
                }
            }
            currentItems[index] = newRow;
        }
        setValue("items", currentItems, { shouldDirty: true, shouldValidate: true });
    };

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

            <form onSubmit={handleSubmit(onSubmit)} noValidate>
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

                <div className="flex flex-wrap gap-4 mb-4">
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
                                    Pol Bal Qty
                                </th>
                                <th className="border-r border-zinc-300 px-2 py-1 font-medium w-24">
                                    Rec Qty
                                </th>
                                <th className="border-r border-zinc-300 px-2 py-1 font-medium w-20">
                                    REJ
                                </th>
                                <th className="border-r border-zinc-300 px-2 py-1 font-medium w-20">
                                    Ok
                                </th>
                                <th className="px-2 py-1 font-medium w-48">Paking Detail</th>
                            </tr>
                        </thead>
                        <tbody>
                            {values.items.map((row, index) => (
                                <tr key={index} className="border-b border-zinc-200 last:border-b-0">
                                    <td className="border-r border-zinc-200 p-0">
                                        <input
                                            type="number"
                                            value={row.code}
                                            onChange={(e) => updateItemRow(index, "code", e.target.value)}
                                            disabled={!isEditing}
                                            className="w-full bg-transparent px-2 py-1 text-center outline-none disabled:bg-[#f3f4f6]"
                                        />
                                    </td>
                                    <td className="border-r border-zinc-200 p-0">
                                        <input
                                            type="text"
                                            value={row.itemName}
                                            onChange={(e) => updateItemRow(index, "itemName", e.target.value)}
                                            disabled={!isEditing}
                                            className="w-full bg-transparent px-2 py-1 outline-none disabled:bg-[#f3f4f6]"
                                        />
                                    </td>
                                    <td className="border-r border-zinc-200 p-0">
                                        <input
                                            type="number"
                                            value={row.poBalQty}
                                            onChange={(e) => updateItemRow(index, "poBalQty", e.target.value)}
                                            disabled={!isEditing}
                                            className="w-full bg-transparent px-2 py-1 text-center outline-none disabled:bg-[#f3f4f6]"
                                        />
                                    </td>
                                    <td className="border-r border-zinc-200 p-0">
                                        <input
                                            type="number"
                                            value={row.recQty}
                                            onChange={(e) => updateItemRow(index, "recQty", e.target.value)}
                                            disabled={!isEditing}
                                            className="w-full bg-transparent px-2 py-1 text-center outline-none disabled:bg-[#f3f4f6]"
                                        />
                                    </td>
                                    <td className="border-r border-zinc-200 p-0">
                                        <input
                                            type="number"
                                            value={row.rejQty}
                                            onChange={(e) => updateItemRow(index, "rejQty", e.target.value)}
                                            disabled={!isEditing}
                                            className="w-full bg-transparent px-2 py-1 text-center outline-none disabled:bg-[#f3f4f6]"
                                        />
                                    </td>
                                    <td className="border-r border-zinc-200 p-0">
                                        <input
                                            type="number"
                                            value={row.okQty}
                                            onChange={(e) => updateItemRow(index, "okQty", e.target.value)}
                                            disabled={!isEditing}
                                            className="w-full bg-transparent px-2 py-1 text-center outline-none disabled:bg-[#f3f4f6] text-black font-medium"
                                        />
                                    </td>
                                    <td className="p-0">
                                        <input
                                            type="text"
                                            value={row.packingDetail}
                                            onChange={(e) => updateItemRow(index, "packingDetail", e.target.value)}
                                            disabled={!isEditing}
                                            className="w-full bg-transparent px-2 py-1 outline-none disabled:bg-[#f3f4f6]"
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
                        disabled={isNewMode || isEditing || !canUpdate}
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
                            <button
                                type="button"
                                onClick={() => openPrint("/reports/inward", true)}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 text-sm font-medium rounded"
                            >
                                Open Inward Quality Control Report
                            </button>
                            <button
                                type="button"
                                onClick={() => openPrint("/reports/purchase-order-balance", false)}
                                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2 text-sm font-medium rounded"
                            >
                                Open Purchase Order Balance Report
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowPrintModal(false)}
                                className="w-full border border-zinc-300 hover:bg-zinc-100 py-1.5 text-sm rounded mt-1"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
