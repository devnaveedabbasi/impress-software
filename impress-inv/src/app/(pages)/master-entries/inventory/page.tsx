"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { LabeledField } from "@/components/ui/LabeledField";
import { LabeledSelect } from "@/components/ui/LabeledSelect";
import { Button } from "@/components/ui/Button";
import useDebounce from "@/hooks/useDebounce";
import { inventorySchema, type InventoryFormValues } from "@/lib/validations/master";
import { INVENTORY, CATEGORIES, DEPARTMENTS, STATIONS, COLORS } from "@/utlis/apiRoutes";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { ViewAllModal, type ViewAllColumn } from "@/components/ui/ViewAllModal";

// One stock row of an inventory item, linked to a Station and a Color
type StockRow = {
    id: number;
    stationId: number;
    colorId: number;
    qty: number;
};

type InventoryRow = {
    id: number;
    itemName: string;
    categoryId: number;
    departmentId: number;
    pack: number;
    rate: number;
    unitPerBike: number;
    stocks?: StockRow[];
    categoryName?: string;
    departmentName?: string;
    category?: { name: string };
    department?: { name: string };
};

type ApiError = {
    response?: {
        status?: number;
        data?: { message?: string };
    };
};

const MIN_ROWS = 4;

const defaultRow = () => ({ stationId: "", colorId: "", qty: "" });

// Convert saved stock rows into form rows (at least MIN_ROWS rows are always shown)
const stocksToFormRows = (stocks: StockRow[] = []) => {
    const rows = stocks.map((stock) => ({
        stationId: String(stock.stationId),
        colorId: String(stock.colorId),
        qty: String(stock.qty ?? ""),
    }));
    while (rows.length < MIN_ROWS) rows.push(defaultRow());
    return rows;
};

const initialValues: InventoryFormValues = {
    id: "",
    itemName: "",
    categoryId: "",
    departmentId: "",
    pack: "",
    rate: "",
    unitPerBike: "",
    colorRows: [defaultRow(), defaultRow(), defaultRow(), defaultRow()],
};

const QTY_LIST = Array.from({ length: 50 }, (_, i) => ({
    label: String(i + 1),
    value: String(i + 1),
}));

export default function InventoryPage() {
    const [isNewMode, setIsNewMode] = useState(true);
    const [isEditing, setIsEditing] = useState(true);
    const [categories, setCategories] = useState<{ label: string; value: string }[]>([]);
    const [departments, setDepartments] = useState<{ label: string; value: string }[]>([]);
    const [stations, setStations] = useState<{ label: string; value: string }[]>([]);
    const [colorOptions, setColorOptions] = useState<{ label: string; value: string }[]>([]);
    const [isOptionsLoading, setIsOptionsLoading] = useState(true);

    const { hasPermission } = usePermissions();
    const canCreate = hasPermission("inventory", "create");
    const canUpdate = hasPermission("inventory", "update");
    const canView = hasPermission("inventory", "view");

    const [isIdLoading, setIsIdLoading] = useState(true);
    const [nextId, setNextId] = useState("");
    const [isViewAllOpen, setIsViewAllOpen] = useState(false);
    const [inventories, setInventories] = useState<InventoryRow[]>([]);
    const [hasLoadedInventories, setHasLoadedInventories] = useState(false);
    const [isInventoriesLoading, setIsInventoriesLoading] = useState(false);
    const [inventoriesError, setInventoriesError] = useState("");
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
    } = useForm<InventoryFormValues>({ defaultValues: initialValues });
    const values = watch();

    const fetchOptions = async () => {
        try {
            const [catRes, deptRes, stationRes, colorRes] = await Promise.all([
                api.get(CATEGORIES),
                api.get(DEPARTMENTS),
                api.get(STATIONS),
                api.get(COLORS),
            ]);
            setColorOptions(
                (colorRes.data.data || []).map((c: { id: number; name: string }) => ({
                    label: c.name,
                    value: String(c.id),
                }))
            );
            setCategories(
                (catRes.data.data || []).map((c: { id: number; name: string }) => ({
                    label: c.name,
                    value: String(c.id),
                }))
            );
            setDepartments(
                (deptRes.data.data || []).map((d: { id: number; name: string }) => ({
                    label: d.name,
                    value: String(d.id),
                }))
            );
            setStations(
                (stationRes.data.data || []).map((s: { id: number; name: string }) => ({
                    label: s.name,
                    value: String(s.id),
                }))
            );
        } catch (error) {
            console.error("Failed to fetch dropdown options", error);
        } finally {
            setIsOptionsLoading(false);
        }
    };

    const fetchNextId = async () => {
        setIsIdLoading(true);
        try {
            const { data } = await api.get(`${INVENTORY}/next-id`, {
                params: { _ts: Date.now() },
            });
            const fetchedNextId = String(data.data.nextId);
            setNextId(fetchedNextId);
            skipNextIdLookup.current = true;
            reset({ ...initialValues, id: fetchedNextId });
            setIsNewMode(true);
            setIsEditing(true);
        } catch (error) {
            console.error("Failed to fetch next inventory ID", error);
        } finally {
            setIsIdLoading(false);
        }
    };

    const fetchAllInventories = async (openModal = true, force = false) => {
        if (openModal) setIsViewAllOpen(true);
        if (hasLoadedInventories && !force) return;

        setIsInventoriesLoading(true);
        setInventoriesError("");
        try {
            const { data } = await api.get(INVENTORY);
            const list: InventoryRow[] = (data.data || []).map((inv: InventoryRow) => ({
                ...inv,
                categoryName: inv.category?.name || `Category #${inv.categoryId}`,
                departmentName: inv.department?.name || `Dept #${inv.departmentId}`,
            }));
            setInventories(list);
            setHasLoadedInventories(true);
        } catch (error: unknown) {
            const apiError = error as ApiError;
            setInventoriesError(apiError.response?.data?.message || "Failed to fetch inventories");
        } finally {
            setIsInventoriesLoading(false);
        }
    };

    const addInventoryToCache = (inv: InventoryRow) => {
        setInventories((current) => {
            const categoryName = inv.category?.name || inv.categoryName || `Category #${inv.categoryId}`;
            const departmentName = inv.department?.name || inv.departmentName || `Dept #${inv.departmentId}`;
            const cached: InventoryRow = { ...inv, categoryName, departmentName };
            const existingIndex = current.findIndex(
                (item) => String(item.id) === String(inv.id)
            );
            if (existingIndex === -1) return [...current, cached];
            return current.map((item, index) =>
                index === existingIndex ? cached : item
            );
        });
        setHasLoadedInventories(true);
    };

    useEffect(() => {
        void fetchNextId();
        void fetchOptions();
        void fetchAllInventories(false);
    }, []);

    const updateColorRow = (
        index: number,
        field: "stationId" | "colorId" | "qty",
        value: string
    ) => {
        const currentRows = [...values.colorRows];
        currentRows[index] = { ...currentRows[index], [field]: value };
        setValue("colorRows", currentRows, { shouldDirty: true, shouldValidate: true });
    };

    const isRowDisabled = (index: number) => {
        if (!isEditing || isOptionsLoading) return true;
        if (index === 0) return false;
        const prevRow = values.colorRows[index - 1];
        return !(prevRow?.stationId && prevRow?.colorId && prevRow?.qty);
    };

    const onSubmit = async (data: InventoryFormValues) => {
        const validationResult = inventorySchema.safeParse(data);
        if (!validationResult.success) {
            clearErrors();
            validationResult.error.issues.forEach((issue) => {
                const field = issue.path[0];
                if (typeof field === "string") {
                    setError(field as keyof InventoryFormValues, {
                        type: "manual",
                        message: issue.message,
                    });
                }
            });
            return;
        }

        const validRows = data.colorRows.filter(
            (r) => r.stationId && r.colorId && r.qty
        );
        if (validRows.length === 0) {
            toast.error("Please fill at least one complete row (Station, Color, Qty)");
            return;
        }

        const payload = {
            itemName: validationResult.data.itemName.trim(),
            categoryId: Number(validationResult.data.categoryId),
            departmentId: Number(validationResult.data.departmentId),
            pack: Number(validationResult.data.pack),
            rate: Number(validationResult.data.rate),
            unitPerBike: Number(validationResult.data.unitPerBike),
            stocks: validRows.map((r) => ({
                stationId: Number(r.stationId),
                colorId: Number(r.colorId),
                qty: Number(r.qty),
            })),
        };

        try {
            const response = isNewMode
                ? await api.post(INVENTORY, payload)
                : await api.put(`${INVENTORY}/${validationResult.data.id}`, payload);

            toast.success(response.data.message || "Inventory saved successfully");
            if (hasLoadedInventories) {
                setHasLoadedInventories(false);
                await fetchAllInventories(false, true);
            }
            refreshNextIdAfterSubmit.current = true;
        } catch (error: unknown) {
            const apiError = error as ApiError;
            console.error("Inventory save failed:", apiError.response?.data || error);
            toast.error(apiError.response?.data?.message || "Failed to save inventory");
        }
    };

    useEffect(() => {
        if (!isSubmitting && refreshNextIdAfterSubmit.current) {
            refreshNextIdAfterSubmit.current = false;
            void fetchNextId();
        }
    }, [isSubmitting]);

    const debouncedId = useDebounce(values.id, 500);
    const inventoryColumns: ViewAllColumn<InventoryRow>[] = [
        { key: "id", header: "Inventory ID" },
        { key: "itemName", header: "Item Name" },
        { key: "categoryName", header: "Category" },
        { key: "departmentName", header: "Department" },
        { key: "rate", header: "Rate" },
    ];

    useEffect(() => {
        const fetchDebouncedId = async () => {
            if (!debouncedId) return;
            if (skipNextIdLookup.current) {
                skipNextIdLookup.current = false;
                return;
            }

            const resetToNextId = () => {
                reset({ ...initialValues, id: nextId });
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
                const cached = inventories.find((inv) => String(inv.id) === debouncedId);
                const inv: InventoryRow = cached || (await api.get(`${INVENTORY}/${debouncedId}`)).data.data;

                if (!inv) {
                    toast.error("Inventory item not found");
                    resetToNextId();
                    return;
                }

                if (!cached) addInventoryToCache(inv);

                reset({
                    id: String(inv.id),
                    itemName: inv.itemName || "",
                    categoryId: String(inv.categoryId),
                    departmentId: String(inv.departmentId),
                    pack: String(inv.pack ?? ""),
                    rate: String(inv.rate ?? ""),
                    unitPerBike: String(inv.unitPerBike ?? ""),
                    colorRows: stocksToFormRows(inv.stocks),
                });
                setIsNewMode(false);
                setIsEditing(false);
            } catch (error: unknown) {
                const apiError = error as ApiError;
                toast.error(
                    apiError.response?.status === 403
                        ? apiError.response?.data?.message || "Access denied. You do not have permission."
                        : "Invalid Inventory ID"
                );
                resetToNextId();
            } finally {
                setIsIdLoading(false);
            }
        };

        void fetchDebouncedId();
    }, [debouncedId, nextId, canView, inventories]);

    return (
        <section className="mx-auto mt-10 w-full max-w-4xl bg-form-bg p-8 shadow-sm">
            <h1 className="mb-10 text-center text-4xl text-black tracking-wide">
                Inventory Entry
            </h1>

            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                    <LabeledField
                        type={isIdLoading ? "text" : "number"}
                        label="Inventory ID"
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
                        wrapperClassName="w-32"
                        disabled={isIdLoading}
                        min={1}
                        max={Number(nextId) || 1}
                    />
                    <LabeledField
                        label="Item Name"
                        value={values.itemName}
                        onChange={(event) =>
                            setValue("itemName", event.target.value, {
                                shouldDirty: true,
                                shouldValidate: true,
                            })
                        }
                        error={errors.itemName?.message}
                        disabled={!isEditing || isOptionsLoading}
                        maxLength={200}
                    />

                    <LabeledSelect
                        label="Category"
                        options={categories}
                        value={values.categoryId}
                        onChange={(val) =>
                            setValue("categoryId", val, {
                                shouldDirty: true,
                                shouldValidate: true,
                            })
                        }
                        error={errors.categoryId?.message}
                        disabled={!isEditing || isOptionsLoading}
                        placeholder={isOptionsLoading ? "Loading Category..." : "Select Category"}
                    />
                    <LabeledSelect
                        label="Department"
                        options={departments}
                        value={values.departmentId}
                        onChange={(val) =>
                            setValue("departmentId", val, {
                                shouldDirty: true,
                                shouldValidate: true,
                            })
                        }
                        error={errors.departmentId?.message}
                        disabled={!isEditing || isOptionsLoading}
                        placeholder={isOptionsLoading ? "Loading Department..." : "Select Department"}
                    />

                    <LabeledField
                        type="number"
                        label="Unit Per Bike"
                        value={values.unitPerBike}
                        onChange={(event) =>
                            setValue("unitPerBike", event.target.value, {
                                shouldDirty: true,
                                shouldValidate: true,
                            })
                        }
                        error={errors.unitPerBike?.message}
                        disabled={!isEditing || isOptionsLoading}
                        min={0}
                    />

                    <LabeledField
                        type="number"
                        label="Pack"
                        value={values.pack}
                        onChange={(event) =>
                            setValue("pack", event.target.value, {
                                shouldDirty: true,
                                shouldValidate: true,
                            })
                        }
                        error={errors.pack?.message}
                        disabled={!isEditing || isOptionsLoading}
                        min={1}
                    />
                    <LabeledField
                        type="number"
                        label="Rate"
                        value={values.rate}
                        onChange={(event) =>
                            setValue("rate", event.target.value, {
                                shouldDirty: true,
                                shouldValidate: true,
                            })
                        }
                        error={errors.rate?.message}
                        disabled={!isEditing || isOptionsLoading}
                        min={0}
                        wrapperClassName="md:col-span-2"
                    />
                </div>

                <div className="max-h-[400px] overflow-y-auto border border-zinc-400 bg-white">
                    <table className="w-full border-collapse text-sm text-black relative bg-white">
                        <thead className="sticky top-0 z-10 bg-white">
                            <tr className="border-b border-zinc-400">
                                <th className="border-r border-zinc-400 px-2 py-1.5 text-center font-medium w-1/2">
                                    Station
                                </th>
                                <th className="border-r border-zinc-400 px-2 py-1.5 text-center font-medium w-1/4">
                                    Color
                                </th>
                                <th className="px-2 py-1.5 text-center font-medium w-1/4">
                                    Qty
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {values.colorRows.map((row, index) => (
                                <tr key={index} className="border-b border-zinc-300 last:border-b-0">
                                    <td className="border-r border-zinc-300 p-0">
                                        <select
                                            value={row.stationId}
                                            onChange={(e) =>
                                                updateColorRow(index, "stationId", e.target.value)
                                            }
                                            disabled={isRowDisabled(index)}
                                            className="w-full bg-transparent px-2 py-1.5 text-[13px] text-black font-medium outline-none disabled:bg-[#f3f4f6] disabled:text-zinc-500"
                                        >
                                            <option value="" disabled hidden></option>
                                            {stations.map((s) => (
                                                <option key={s.value} value={s.value}>
                                                    {s.label}
                                                </option>
                                            ))}
                                        </select>
                                    </td>
                                    <td className="border-r border-zinc-300 p-0">
                                        <select
                                            value={row.colorId}
                                            onChange={(e) =>
                                                updateColorRow(index, "colorId", e.target.value)
                                            }
                                            disabled={isRowDisabled(index)}
                                            className="w-full bg-transparent px-2 py-1.5 text-[13px] text-black font-medium outline-none disabled:bg-[#f3f4f6] disabled:text-zinc-500"
                                        >
                                            <option value="" disabled hidden></option>
                                            {colorOptions.map((c) => (
                                                <option key={c.value} value={c.value}>
                                                    {c.label}
                                                </option>
                                            ))}
                                        </select>
                                    </td>
                                    <td className="p-0">
                                        <select
                                            value={row.qty}
                                            onChange={(e) =>
                                                updateColorRow(index, "qty", e.target.value)
                                            }
                                            disabled={isRowDisabled(index)}
                                            className="w-full bg-transparent px-2 py-1.5 text-[13px] text-black font-medium outline-none disabled:bg-[#f3f4f6] disabled:text-zinc-500"
                                        >
                                            <option value="" disabled hidden></option>
                                            {QTY_LIST.map((q) => (
                                                <option key={q.value} value={q.value}>
                                                    {q.label}
                                                </option>
                                            ))}
                                        </select>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {errors.colorRows && (
                    <p className="text-center text-xs text-red-500">{errors.colorRows.message}</p>
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
                        onClick={() => fetchAllInventories()}
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
                        onClick={() => window.open("/print/inventory", "_blank")}
                        className="border border-zinc-400 bg-white px-6 hover:bg-zinc-50"
                    >
                        Print
                    </Button>
                </div>
            </form>

            <ViewAllModal
                key={isViewAllOpen ? "open" : "closed"}
                isOpen={isViewAllOpen}
                title="All Inventory"
                rows={inventories}
                columns={inventoryColumns}
                searchKeys={["id", "itemName", "categoryName", "departmentName"]}
                isLoading={isInventoriesLoading}
                error={inventoriesError}
                onClose={() => setIsViewAllOpen(false)}
                onRowSelect={(inv) => {
                    reset({
                        id: String(inv.id),
                        itemName: inv.itemName || "",
                        categoryId: String(inv.categoryId),
                        departmentId: String(inv.departmentId),
                        pack: String(inv.pack ?? ""),
                        rate: String(inv.rate ?? ""),
                        unitPerBike: String(inv.unitPerBike ?? ""),
                        colorRows: stocksToFormRows(inv.stocks),
                    });
                    setIsNewMode(false);
                    setIsEditing(false);
                    setIsViewAllOpen(false);
                }}
                onDelete={() => undefined}
            />
        </section>
    );
}
