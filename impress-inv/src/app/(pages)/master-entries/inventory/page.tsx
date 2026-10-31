"use client";

import { useEffect, useState } from "react";
import { Icon } from "@iconify/react";
import { LabeledField } from "@/components/ui/LabeledField";
import { LabeledSelect } from "@/components/ui/LabeledSelect";
import { Button } from "@/components/ui/Button";
import { useForm } from "@/hooks/useForm";
import useDebounce from "@/hooks/useDebounce";
import { inventorySchema, type InventoryFormValues } from "@/lib/validations/master";
import { INVENTORY, CATEGORIES, DEPARTMENTS, STATIONS } from "@/utlis/apiRoutes";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { ViewAllResource, type ViewAllColumn } from "@/components/ui/ViewAllModal";

type ViewAllRow = { id: number; [key: string]: unknown };

const defaultRow = () => ({ stationId: "", color: "", qty: "" });
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

const COLORS_LIST = [
    { label: "Red", value: "Red" },
    { label: "Black", value: "Black" },
    { label: "Blue", value: "Blue" },
    { label: "Silver", value: "Silver" },
    { label: "Grey", value: "Grey" },
    { label: "White", value: "White" },
];

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

    const fetchOptions = async () => {
        try {
            const [catRes, deptRes, stationRes] = await Promise.all([
                api.get(CATEGORIES),
                api.get(DEPARTMENTS),
                api.get(STATIONS),
            ]);
            setCategories((catRes.data.data || []).map((c: any) => ({ label: c.name, value: String(c.id) })));
            setDepartments((deptRes.data.data || []).map((d: any) => ({ label: d.name, value: String(d.id) })));
            setStations((stationRes.data.data || []).map((s: any) => ({ label: s.name, value: String(s.id) })));
        } catch (error) {
            console.error("Failed to fetch dropdown options", error);
        } finally {
            setIsOptionsLoading(false);
        }
    };
    const { hasPermission } = usePermissions();
    const canCreate = hasPermission("inventory", "create");
    const canUpdate = hasPermission("inventory", "update");
    const canView = hasPermission("inventory", "view");
    const inventoryColumns: ViewAllColumn<ViewAllRow>[] = [
        { key: "id", header: "Inventory ID" },
        { key: "itemName", header: "Item Name" },
        { key: "categoryId", header: "Category ID" },
        { key: "departmentId", header: "Department ID" },
        { key: "rate", header: "Rate" },
    ];
    const [isIdLoading, setIsIdLoading] = useState(true);
    const [nextId, setNextId] = useState<string>("");
    const [isOptionsLoading, setIsOptionsLoading] = useState(true);


    const fetchNextId = async () => {
        setIsIdLoading(true);
        try {
            const { data } = await api.get(`${INVENTORY}/next-id`);
            const fetchedNextId = String(data.data.nextId);
            setNextId(fetchedNextId);
            setValues({ ...initialValues, id: fetchedNextId });
            setIsNewMode(true);
            setIsEditing(true);
        } catch (error) {
            console.error("Failed to fetch next inventory ID", error);
        } finally {
            setIsIdLoading(false);
        }
    };

    useEffect(() => {
        fetchNextId();
        fetchOptions();
    }, []);

    const {
        values,
        errors,
        isLoading: isSubmitting,
        handleInputChange,
        handleSelectChange,
        handleSubmit,
        setValues,
    } = useForm({
        initialValues,
        validationSchema: inventorySchema,
        onSubmit: async (data) => {
            const validRows = data.colorRows.filter(r => r.stationId && r.color && r.qty);
            if (validRows.length === 0) {
                toast.error("Please fill at least one complete row (Station, Color, Qty)");
                return;
            }

            const payload = {
                itemName: data.itemName,
                categoryId: Number(data.categoryId),
                departmentId: Number(data.departmentId),
                pack: Number(data.pack),
                rate: Number(data.rate),
                unitPerBike: Number(data.unitPerBike),
                stationIds: validRows.map(r => Number(r.stationId)),
                color: validRows.map(r => r.color),
                qty: validRows.map(r => Number(r.qty)),
            };

            try {
                if (isNewMode) {
                    const response = await api.post(INVENTORY, payload);
                    toast.success(response.data.message || "Inventory created successfully");
                } else {
                    const response = await api.put(`${INVENTORY}/${data.id}`, payload);
                    toast.success(response.data.message || "Inventory updated successfully");
                }
                fetchNextId();
            } catch (error: any) {
                toast.error(error.response?.data?.message || "Failed to save inventory");
                throw error;
            }
        },
    });

    
    const debouncedId = useDebounce(values?.id, 500);

    useEffect(() => {
        const fetchDebouncedId = async () => {
        if (!debouncedId) return;

        if (debouncedId === String(nextId)) {
            setValues({ ...initialValues, id: nextId });
            setIsNewMode(true);
            setIsEditing(true);
            return;
        }

        if (!canView) {
            toast.error("You do not have permission to view or search for this record.");
            setValues({ ...initialValues, id: nextId });
            setIsNewMode(true);
            setIsEditing(true);
            return;
        }

        setIsIdLoading(true);
        try {
            const { data } = await api.get(`${INVENTORY}/${debouncedId}`);
            if (data.data) {
                const inv = data.data;
                const fetchedRows = (inv.color || []).map((c: string, i: number) => ({
                    stationId: String(inv.stationIds?.[i] || ""),
                    color: c,
                    qty: String(inv.qty?.[i] || ""),
                }));

                // Ensure exactly 4 rows are shown for UI consistency
                while (fetchedRows.length < 4) fetchedRows.push(defaultRow());
                if (fetchedRows.length > 4) fetchedRows.length = 4; // Truncate if somehow more than 4

                setValues({
                    id: String(inv.id),
                    itemName: inv.itemName,
                    categoryId: String(inv.categoryId),
                    departmentId: String(inv.departmentId),
                    pack: String(inv.pack),
                    rate: String(inv.rate),
                    unitPerBike: String(inv.unitPerBike),
                    colorRows: fetchedRows,
                });
                setIsNewMode(false);
                setIsEditing(false);
                toast.success("Inventory item found");
            } else {
                toast.error("Inventory item not found");
                setValues({ ...initialValues, id: nextId });
                setIsNewMode(true);
            }
        } catch (error: any) {
            if (error.response?.status === 403) {
                toast.error(error.response?.data?.message || "Access denied. You do not have permission.");
            } else {
                toast.error("Inventory item not found");
            }
            setValues({ ...initialValues, id: nextId });
            setIsNewMode(true);
        } finally {
            setIsIdLoading(false);
        }
    }
        fetchDebouncedId();
    }, [debouncedId]);; 

    const isRowDisabled = (index: number) => {
        if (!isEditing || isOptionsLoading) return true;
        if (index === 0) return false;
        const prevRow = values.colorRows[index - 1];
        return !(prevRow.stationId && prevRow.color && prevRow.qty);
    };

    const addRow = () => {
        setValues((prev) => ({
            ...prev,
            colorRows: [...prev.colorRows, defaultRow()],
        }));
    };

    const canAddRow = values.colorRows.length > 0 && values.colorRows.every(r => r.stationId && r.color && r.qty);

    const updateColorRow = (index: number, field: "stationId" | "color" | "qty", value: string) => {
        setValues((prev) => ({
            ...prev,
            colorRows: prev.colorRows.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
        }));
    };

    return (
        <section className="mx-auto mt-10 w-full max-w-4xl bg-form-bg p-8 shadow-sm">
            <h1 className="mb-10 text-center text-4xl text-black tracking-wide">Inventory Entry</h1>

            <form onSubmit={handleSubmit} noValidate className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                    <LabeledField
                    type={isIdLoading ? "text" : "number"}
                    label="Inventory ID"
                    value={isIdLoading ? "Loading..." : values.id || ""}
                        onChange={handleInputChange("id")}
                        error={errors.id}
                        wrapperClassName="w-32"
                    min={1}
                    max={Number(nextId) || 1}
                />
                    <LabeledField
                        label="Item Name"
                        value={values.itemName}
                        onChange={handleInputChange("itemName")}
                        error={errors.itemName}
                        disabled={!isEditing || isOptionsLoading}
                        maxLength={200}
                    />

                    <LabeledSelect
                        label="Category"
                        options={categories}
                        value={values.categoryId}
                        onChange={handleSelectChange("categoryId")}
                        error={errors.categoryId}
                        disabled={!isEditing || isOptionsLoading}
                        placeholder={isOptionsLoading ? "Loading Category..." : "Select Category"}
                    />
                    <LabeledSelect
                        label="Department"
                        options={departments}
                        value={values.departmentId}
                        onChange={handleSelectChange("departmentId")}
                        error={errors.departmentId}
                        disabled={!isEditing || isOptionsLoading}
                        placeholder={isOptionsLoading ? "Loading Department..." : "Select Department"}
                    />

                    <LabeledField
                        type="number"
                        label="Unit Per Bike"
                        value={values.unitPerBike}
                        onChange={handleInputChange("unitPerBike")}
                        error={errors.unitPerBike}
                        disabled={!isEditing || isOptionsLoading}
                        min={0}
                    />

                    <LabeledField
                        type="number"
                        label="Pack"
                        value={values.pack}
                        onChange={handleInputChange("pack")}
                        error={errors.pack}
                        disabled={!isEditing || isOptionsLoading}
                        min={1}
                    />
                    <LabeledField
                        type="number"
                        label="Rate"
                        value={values.rate}
                        onChange={handleInputChange("rate")}
                        error={errors.rate}
                        disabled={!isEditing || isOptionsLoading}
                        min={0}
                        wrapperClassName="md:col-span-2"
                    />
                </div>

                <div className="max-h-[400px] overflow-y-auto border border-zinc-400 bg-white">
                    <table className="w-full border-collapse text-sm text-black relative bg-white">
                        <thead className="sticky top-0 z-10 bg-white">
                            <tr className="border-b border-zinc-400">
                                <th className="border-r border-zinc-400 px-2 py-1.5 text-center font-medium w-1/2">Station</th>
                                <th className="border-r border-zinc-400 px-2 py-1.5 text-center font-medium w-1/4">Color</th>
                                <th className="px-2 py-1.5 text-center font-medium w-1/4">Qty</th>
                            </tr>
                        </thead>
                        <tbody>
                            {values.colorRows.map((row, index) => (
                                <tr key={index} className="border-b border-zinc-300 last:border-b-0">
                                    <td className="border-r border-zinc-300 p-0">
                                        <select
                                            value={row.stationId}
                                            onChange={(e) => updateColorRow(index, "stationId", e.target.value)}
                                            disabled={isRowDisabled(index)}
                                            className="w-full bg-transparent px-2 py-1.5 text-[13px] text-black font-medium outline-none disabled:bg-[#f3f4f6] disabled:text-zinc-500"
                                        >
                                            <option value="" disabled hidden></option>
                                            {stations.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                        </select>
                                    </td>
                                    <td className="border-r border-zinc-300 p-0">
                                        <select
                                            value={row.color}
                                            onChange={(e) => updateColorRow(index, "color", e.target.value)}
                                            disabled={isRowDisabled(index)}
                                            className="w-full bg-transparent px-2 py-1.5 text-[13px] text-black font-medium outline-none disabled:bg-[#f3f4f6] disabled:text-zinc-500"
                                        >
                                            <option value="" disabled hidden></option>
                                            {COLORS_LIST.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                                        </select>
                                    </td>
                                    <td className="p-0">
                                        <select
                                            value={row.qty}
                                            onChange={(e) => updateColorRow(index, "qty", e.target.value)}
                                            disabled={isRowDisabled(index)}
                                            className="w-full bg-transparent px-2 py-1.5 text-[13px] text-black font-medium outline-none disabled:bg-[#f3f4f6] disabled:text-zinc-500"
                                        >
                                            <option value="" disabled hidden></option>
                                            {QTY_LIST.map(q => <option key={q.value} value={q.value}>{q.label}</option>)}
                                        </select>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {errors.colorRows && <p className="mt-1.5 text-xs text-red-500">{errors.colorRows}</p>}

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
                    <ViewAllResource
                        endpoint={INVENTORY}
                        title="All Inventory"
                        columns={inventoryColumns}
                        searchKeys={["id", "itemName", "categoryId", "departmentId"]}
                        canView={canView}
                        onSelectId={(id) => setValues((prev) => ({ ...prev, id: String(id) }))}
                    />
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
        </section>
    );
}

