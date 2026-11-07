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

type SaleGatePassRow = {
    id: number;
    date: string;
    accountName: string;
    billNO: number;
    throughBy: string;
    remarks?: string;
    vehicleNo: string;
    code?: number[];
    itemName?: string[];
    unit?: number[];
    stockInHand?: number[];
    qty?: number[];
    [key: string]: unknown;
};

type ApiError = {
    response?: {
        status?: number;
        data?: { message?: string };
    };
};

const defaultRow = () => ({ code: "", itemName: "", unit: "", stockInHand: "", qty: "" });
const initialValues: SaleGatePassFormValues = {
    id: "",
    date: new Date().toISOString().split("T")[0],
    accountName: "",
    billNO: "",
    throughBy: "",
    remarks: "",
    vehicleNo: "",
    items: Array.from({ length: 10 }, defaultRow),
};

export default function SaleGatePassPage() {
    const [isNewMode, setIsNewMode] = useState(true);
    const [isEditing, setIsEditing] = useState(true);

    const { hasPermission } = usePermissions();
    const canCreate = hasPermission("sale-gate-pass", "create") || true;
    const canUpdate = hasPermission("sale-gate-pass", "update") || true;
    const canView = hasPermission("sale-gate-pass", "view") || true;

    const [isIdLoading, setIsIdLoading] = useState(true);
    const [nextId, setNextId] = useState<string>("");
    const [isViewAllOpen, setIsViewAllOpen] = useState(false);
    const [gatePasses, setGatePasses] = useState<SaleGatePassRow[]>([]);
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

    const fetchNextId = async () => {
        setIsIdLoading(true);
        try {
            const { data } = await api.get(`${SALE_GATE_PASSES}/next-id`, {
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
            console.error("Failed to fetch next ID", error);
        } finally {
            setIsIdLoading(false);
        }
    };

    const mapGatePassToForm = (s: any): SaleGatePassFormValues => {
        const fetchedRows = (s.code || []).map((c: number, i: number) => ({
            code: c !== undefined && c !== null ? String(c) : "",
            itemName: s.itemName?.[i] || "",
            unit: s.unit?.[i] !== undefined && s.unit?.[i] !== null ? String(s.unit[i]) : "",
            stockInHand: s.stockInHand?.[i] !== undefined && s.stockInHand?.[i] !== null ? String(s.stockInHand[i]) : "",
            qty: s.qty?.[i] !== undefined && s.qty?.[i] !== null ? String(s.qty[i]) : "",
        }));

        while (fetchedRows.length < 10) fetchedRows.push(defaultRow());

        return {
            id: String(s.id),
            date: s.date ? new Date(s.date).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
            accountName: s.accountName || "",
            billNO: s.billNO !== undefined && s.billNO !== null ? String(s.billNO) : "",
            throughBy: s.throughBy || "",
            remarks: s.remarks || "",
            vehicleNo: s.vehicleNo || "",
            items: fetchedRows,
        };
    };

    const fetchAllGatePasses = async (openModal = true, force = false) => {
        if (openModal) setIsViewAllOpen(true);
        if (hasLoadedGatePasses && !force) return;

        setIsGatePassesLoading(true);
        setGatePassesError("");
        try {
            const { data } = await api.get(SALE_GATE_PASSES);
            setGatePasses(
                (data.data || []).map((item: SaleGatePassRow) => ({
                    ...item,
                    date: item.date ? new Date(item.date).toISOString().split("T")[0] : "",
                }))
            );
            setHasLoadedGatePasses(true);
        } catch (error: unknown) {
            const apiError = error as ApiError;
            setGatePassesError(apiError.response?.data?.message || "Failed to fetch Sale Gate Passes");
        } finally {
            setIsGatePassesLoading(false);
        }
    };

    const addGatePassToCache = (item: SaleGatePassRow) => {
        setGatePasses((current) => {
            const cachedItem = {
                ...item,
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
        setHasLoadedGatePasses(true);
    };

    useEffect(() => {
        void fetchNextId();
        void fetchAllGatePasses(false);
    }, []);

    const onSubmit = async (data: SaleGatePassFormValues) => {
        const validationResult = saleGatePassSchema.safeParse(data);
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
            (r) => r.code || r.itemName || r.unit || r.stockInHand || r.qty
        );

        if (validRows.length === 0) {
            toast.error("Please fill at least one complete row");
            return;
        }

        const payload = {
            date: new Date(data.date).toISOString(),
            accountName: data.accountName,
            billNO: Number(data.billNO),
            throughBy: data.throughBy,
            remarks: data.remarks || "",
            vehicleNo: data.vehicleNo,
            code: validRows.map((r) => Number(r.code)),
            itemName: validRows.map((r) => r.itemName),
            unit: validRows.map((r) => Number(r.unit)),
            stockInHand: validRows.map((r) => Number(r.stockInHand)),
            qty: validRows.map((r) => Number(r.qty)),
        };

        try {
            const response = isNewMode
                ? await api.post(SALE_GATE_PASSES, payload)
                : await api.put(`${SALE_GATE_PASSES}/${data.id}`, payload);

            toast.success(response.data.message || "Sale Gate Pass saved successfully");
            if (hasLoadedGatePasses) {
                setHasLoadedGatePasses(false);
                await fetchAllGatePasses(false, true);
            }
            refreshNextIdAfterSubmit.current = true;
        } catch (error: unknown) {
            const apiError = error as ApiError;
            console.error("Sale Gate Pass save failed:", apiError.response?.data || error);
            toast.error(apiError.response?.data?.message || "Failed to save Sale Gate Pass");
        }
    };

    useEffect(() => {
        if (!isSubmitting && refreshNextIdAfterSubmit.current) {
            refreshNextIdAfterSubmit.current = false;
            void fetchNextId();
        }
    }, [isSubmitting]);

    const debouncedId = useDebounce(values.id, 500);
    const saleGatePassColumns: ViewAllColumn<SaleGatePassRow>[] = [
        { key: "id", header: "Gate Pass ID" },
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
                const cached = gatePasses.find((item) => String(item.id) === debouncedId);
                const s = cached || (await api.get(`${SALE_GATE_PASSES}/${debouncedId}`)).data.data;

                if (!s) {
                    toast.error("Sale Gate Pass not found");
                    resetToNextId();
                    return;
                }

                if (!cached) addGatePassToCache(s);
                reset(mapGatePassToForm(s));
                setIsNewMode(false);
                setIsEditing(false);
                toast.success("Sale Gate Pass found");
            } catch (error: unknown) {
                const apiError = error as ApiError;
                toast.error(
                    apiError.response?.status === 403
                        ? apiError.response?.data?.message || "Access denied. You do not have permission."
                        : "Sale Gate Pass not found"
                );
                resetToNextId();
            } finally {
                setIsIdLoading(false);
            }
        };

        void fetchDebouncedId();
    }, [debouncedId, nextId, canView, gatePasses]);

    const updateItemRow = (index: number, field: keyof typeof initialValues.items[0], value: string) => {
        const currentItems = [...values.items];
        currentItems[index] = { ...currentItems[index], [field]: value };
        setValue("items", currentItems, { shouldDirty: true, shouldValidate: true });
    };

    const isRowDisabled = (index: number) => {
        if (!isEditing) return true;
        if (index === 0) return false;
        const prevRow = values.items[index - 1];
        return !(prevRow?.code && prevRow?.itemName && prevRow?.unit && prevRow?.stockInHand && prevRow?.qty);
    };

    const addRow = () => {
        setValue("items", [...values.items, defaultRow()], { shouldDirty: true, shouldValidate: true });
    };

    const canAddRow =
        values.items.length > 0 &&
        values.items.every(
            (r) => r.code && r.itemName && r.unit && r.stockInHand && r.qty
        );

    return (
        <section className="mx-auto mt-10 w-full max-w-5xl bg-form-bg p-8 shadow-sm">
            <h1 className="mb-10 text-center text-4xl font-medium text-black tracking-wide">
                Part Sale Gate Pass
            </h1>

            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    <LabeledField
                        type={isIdLoading ? "text" : "number"}
                        label="Gate Pass ID"
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
                    <LabeledField
                        label="Account Name"
                        value={values.accountName}
                        onChange={(e) =>
                            setValue("accountName", e.target.value, {
                                shouldDirty: true,
                                shouldValidate: true,
                            })
                        }
                        error={errors.accountName?.message}
                        disabled={!isEditing}
                    />
                    <LabeledField
                        type="number"
                        label="Bill No"
                        value={values.billNO}
                        onChange={(e) =>
                            setValue("billNO", e.target.value, {
                                shouldDirty: true,
                                shouldValidate: true,
                            })
                        }
                        error={errors.billNO?.message}
                        disabled={!isEditing}
                        min={1}
                    />
                    <LabeledField
                        label="Through By"
                        value={values.throughBy}
                        onChange={(e) =>
                            setValue("throughBy", e.target.value, {
                                shouldDirty: true,
                                shouldValidate: true,
                            })
                        }
                        error={errors.throughBy?.message}
                        disabled={!isEditing}
                    />
                    <LabeledField
                        label="Vehicle No"
                        value={values.vehicleNo}
                        onChange={(e) =>
                            setValue("vehicleNo", e.target.value, {
                                shouldDirty: true,
                                shouldValidate: true,
                            })
                        }
                        error={errors.vehicleNo?.message}
                        disabled={!isEditing}
                    />
                    <LabeledField
                        label="Remarks"
                        value={values.remarks}
                        onChange={(e) =>
                            setValue("remarks", e.target.value, {
                                shouldDirty: true,
                                shouldValidate: true,
                            })
                        }
                        error={errors.remarks?.message}
                        disabled={!isEditing}
                        wrapperClassName="lg:col-span-3"
                    />
                </div>

                <div className="max-h-[400px] overflow-y-auto border border-zinc-400 bg-white">
                    <table className="w-full border-collapse text-sm text-black relative bg-white">
                        <thead className="sticky top-0 z-10 bg-white">
                            <tr className="border-b border-zinc-400">
                                <th className="border-r border-zinc-400 px-2 py-1.5 text-center font-medium w-1/6">
                                    Code
                                </th>
                                <th className="border-r border-zinc-400 px-2 py-1.5 text-center font-medium w-2/6">
                                    Item Name
                                </th>
                                <th className="border-r border-zinc-400 px-2 py-1.5 text-center font-medium w-1/6">
                                    Unit
                                </th>
                                <th className="border-r border-zinc-400 px-2 py-1.5 text-center font-medium w-1/6">
                                    Stock in Hand
                                </th>
                                <th className="px-2 py-1.5 text-center font-medium w-1/6">
                                    Qty
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
                                            disabled={isRowDisabled(index)}
                                            min={1}
                                            className="w-full bg-transparent px-2 py-1.5 text-center text-[13px] outline-none disabled:bg-[#f3f4f6] disabled:text-zinc-500"
                                        />
                                    </td>
                                    <td className="border-r border-zinc-300 p-0">
                                        <input
                                            type="text"
                                            value={row.itemName}
                                            onChange={(e) => updateItemRow(index, "itemName", e.target.value)}
                                            disabled={isRowDisabled(index)}
                                            className="w-full bg-transparent px-2 py-1.5 text-[13px] outline-none disabled:bg-[#f3f4f6] disabled:text-zinc-500"
                                        />
                                    </td>
                                    <td className="border-r border-zinc-300 p-0">
                                        <input
                                            type="number"
                                            value={row.unit}
                                            onChange={(e) => updateItemRow(index, "unit", e.target.value)}
                                            disabled={isRowDisabled(index)}
                                            min={0}
                                            className="w-full bg-transparent px-2 py-1.5 text-center text-[13px] outline-none disabled:bg-[#f3f4f6] disabled:text-zinc-500"
                                        />
                                    </td>
                                    <td className="border-r border-zinc-300 p-0">
                                        <input
                                            type="number"
                                            value={row.stockInHand}
                                            onChange={(e) => updateItemRow(index, "stockInHand", e.target.value)}
                                            disabled={isRowDisabled(index)}
                                            min={0}
                                            className="w-full bg-transparent px-2 py-1.5 text-center text-[13px] outline-none disabled:bg-[#f3f4f6] disabled:text-zinc-500"
                                        />
                                    </td>
                                    <td className="p-0">
                                        <input
                                            type="number"
                                            value={row.qty}
                                            onChange={(e) => updateItemRow(index, "qty", e.target.value)}
                                            disabled={isRowDisabled(index)}
                                            min={1}
                                            className="w-full bg-transparent px-2 py-1.5 text-center text-[13px] outline-none disabled:bg-[#f3f4f6] disabled:text-zinc-500"
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {canAddRow && isEditing && (
                    <div className="flex justify-end mt-2">
                        <Button
                            type="button"
                            variant="secondary"
                            shape="rounded"
                            onClick={addRow}
                            className="border border-zinc-400 bg-white px-4 py-1.5 text-sm hover:bg-zinc-50"
                        >
                            + Add More
                        </Button>
                    </div>
                )}
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
                </div>
            </form>

            <ViewAllModal
                key={isViewAllOpen ? "open" : "closed"}
                isOpen={isViewAllOpen}
                title="All Sale Gate Passes"
                rows={gatePasses}
                columns={saleGatePassColumns}
                searchKeys={["id", "date", "accountName", "vehicleNo"]}
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
