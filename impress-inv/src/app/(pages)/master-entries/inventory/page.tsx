"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { LabeledField } from "@/components/ui/LabeledField";
import { LabeledSelect } from "@/components/ui/LabeledSelect";
import { PriceField } from "@/components/ui/PriceField";
import { RowDeleteButton, deletableRowClassName } from "@/components/ui/RowDeleteButton";
import { AddRowButton } from "@/components/ui/AddRowButton";
import { Button } from "@/components/ui/Button";
import useDebounce from "@/hooks/useDebounce";
import { inventorySchema, type InventoryFormValues } from "@/lib/validations/master";
import { INVENTORY, CATEGORIES, DEPARTMENTS, STATIONS, COLORS } from "@/utlis/apiRoutes";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import { usePermissions } from "@/hooks/usePermissions";
import type { ViewAllColumn } from "@/components/ui/ViewAllModal";
import { InfiniteViewAllModal, useRefreshMasterList } from "@/components/ui/InfiniteViewAllModal";
import { EntryActions } from "@/components/ui/EntryActions";
import { useMasterRecord } from "@/hooks/useMasterRecord";
import { PrintOptionsModal } from "@/components/print/PrintOptionsModal";

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

export default function InventoryPage() {
    const [isNewMode, setIsNewMode] = useState(true);
    const [isPrintOpen, setIsPrintOpen] = useState(false);
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
    const refreshList = useRefreshMasterList("inventory");
    const { fetchOne, prefetchNear } = useMasterRecord("inventory", INVENTORY);
    const [inventories, setInventories] = useState<InventoryRow[]>([]);
    const skipNextIdLookup = useRef(false);

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

    // An error goes away as soon as the user changes that field, it does not stay red until the next Save
    useEffect(() => {
        const subscription = watch((_, { name }) => {
            if (name) clearErrors(name.split(".")[0] as keyof InventoryFormValues);
        });
        return () => subscription.unsubscribe();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [watch, clearErrors]);

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
    };

    useEffect(() => {
        void fetchNextId();
        void fetchOptions();
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

    // Remove a row of the table (it is gone from the item when Save is pressed); the table keeps at least 4 rows
    const removeColorRow = (index: number) => {
        const remaining = values.colorRows.filter((_, i) => i !== index);
        while (remaining.length < 4) remaining.push(defaultRow());
        setValue("colorRows", remaining, { shouldDirty: true, shouldValidate: true });
    };

    const addColorRow = () => {
        setValue("colorRows", [...values.colorRows, defaultRow()], { shouldDirty: true });
    };

    const rowHasData = (row: { stationId?: string; colorId?: string; qty?: string }) =>
        Boolean(row.stationId || row.colorId || row.qty);

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
            setInventories([]); // the looked-up copies are old now
            void refreshList();
            // This page has a Print button: after Save the record stays on the screen (it does not jump to the next new
            // record). Only the next number is read again, quietly, so a new record still gets the right number.
            setIsNewMode(false);
            setIsEditing(false);
            skipNextIdLookup.current = true;
            void api
                .get(`${INVENTORY}/next-id`, { params: { _ts: Date.now() } })
                .then(({ data }) => setNextId(String(data.data.nextId)))
                .catch(() => { skipNextIdLookup.current = false; });
        } catch (error: unknown) {
            const apiError = error as ApiError;
            console.error("Inventory save failed:", apiError.response?.data || error);
            toast.error(apiError.response?.data?.message || "Failed to save inventory");
        }
    };

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
                const inv: InventoryRow = cached || (await fetchOne(debouncedId));
                prefetchNear(debouncedId, Number(nextId));

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

            <form
                onSubmit={(event) => {
                    // Clear stale manual errors, otherwise handleSubmit blocks onSubmit forever
                    clearErrors();
                    void handleSubmit(onSubmit)(event);
                }}
                noValidate
                className="space-y-4"
            >
                <div className="grid gap-3 md:grid-cols-2">
                    <LabeledField
                        type="number"
                        label="Inventory ID"
                        value={values.id || ""}
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
                    <PriceField
                        label="Rate"
                        value={values.rate}
                        onValueChange={(digits) =>
                            setValue("rate", digits, {
                                shouldDirty: true,
                                shouldValidate: true,
                            })
                        }
                        error={errors.rate?.message}
                        disabled={!isEditing || isOptionsLoading}
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
                                <tr key={index} className={deletableRowClassName}>
                                    <td className="border-r border-zinc-300 p-0">
                                        <LabeledSelect
                                            variant="cell"
                                            label="Station"
                                            options={stations}
                                            value={row.stationId}
                                            onChange={(val) => updateColorRow(index, "stationId", val)}
                                            disabled={isRowDisabled(index)}
                                            searchThreshold={0}
                                            placeholder=" "
                                        />
                                    </td>
                                    <td className="border-r border-zinc-300 p-0">
                                        <LabeledSelect
                                            variant="cell"
                                            label="Color"
                                            options={colorOptions}
                                            value={row.colorId}
                                            onChange={(val) => updateColorRow(index, "colorId", val)}
                                            disabled={isRowDisabled(index)}
                                            searchThreshold={0}
                                            placeholder=" "
                                        />
                                    </td>
                                    <td className="relative p-0">
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            aria-label="Qty"
                                            autoComplete="off"
                                            value={row.qty}
                                            onChange={(e) =>
                                                updateColorRow(index, "qty", e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 7))
                                            }
                                            disabled={isRowDisabled(index)}
                                            className="w-full bg-transparent px-2 py-1.5 pr-8 text-[13px] text-black font-medium outline-none focus:bg-primary-50 disabled:bg-[#f3f4f6] disabled:text-zinc-500"
                                        />
                                        {isEditing && rowHasData(row) && (
                                            <RowDeleteButton rowNumber={index + 1} onClick={() => removeColorRow(index)} />
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
                    <AddRowButton onClick={addColorRow} disabled={!isEditing || isOptionsLoading} />
                </div>

                {errors.colorRows && (
                    <p className="text-center text-xs text-red-500">{errors.colorRows.message}</p>
                )}

                <EntryActions
                    onNew={fetchNextId}
                    newDisabled={isSubmitting || !canCreate}
                    onViewAll={() => setIsViewAllOpen(true)}
                    viewAllDisabled={isSubmitting || !canView}
                    onEdit={() => setIsEditing(true)}
                    editDisabled={isSubmitting || isNewMode || isEditing || !canUpdate}
                    saveLoading={isSubmitting}
                    saveDisabled={!isEditing || (isNewMode ? !canCreate : !canUpdate)}
                    onPrint={() => setIsPrintOpen(true)}
                />
            </form>

            <PrintOptionsModal
                isOpen={isPrintOpen}
                onClose={() => setIsPrintOpen(false)}
                entityName="Inventory"
                printPath="/print/inventory"
                recordId={isNewMode ? null : values.id || null}
                maxCode={Number(nextId) > 1 ? Number(nextId) - 1 : undefined}
            />

            <InfiniteViewAllModal
                isOpen={isViewAllOpen}
                title="All Inventory"
                endpoint={INVENTORY}
                name="inventory"
                mapRow={(row) => ({ ...row, categoryName: row.category?.name || `Category #${row.categoryId}`, departmentName: row.department?.name || `Dept #${row.departmentId}` })}
                columns={inventoryColumns}
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
            />
        </section>
    );
}
