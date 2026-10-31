"use client";

import { useEffect, useState } from "react";
import { Icon } from "@iconify/react";
import { LabeledField } from "@/components/ui/LabeledField";
import { LabeledSelect } from "@/components/ui/LabeledSelect";
import { Button } from "@/components/ui/Button";
import { useForm } from "@/hooks/useForm";
import { quotationSchema, type QuotationFormValues } from "@/lib/validations/master";
import { QUOTATIONS, VENDORS, INVENTORY } from "@/utlis/apiRoutes";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { ViewAllResource, type ViewAllColumn } from "@/components/ui/ViewAllModal";

type ViewAllRow = { id: number; [key: string]: unknown };

const defaultRow = () => ({ itemName: "", oldRate: "", proposedRate: "", approvedRate: "" });
const initialValues: QuotationFormValues = {
    id: "",
    date: new Date().toISOString().split('T')[0],
    vendorId: "",
    remarks: "",
    items: Array.from({ length: 10 }, defaultRow),
};

export default function QuotationPage() {
    const [isNewMode, setIsNewMode] = useState(true);
    const [isEditing, setIsEditing] = useState(true);
    const [vendors, setVendors] = useState<{ label: string; value: string }[]>([]);
    const [inventoryItems, setInventoryItems] = useState<{ label: string; value: string }[]>([]);

    const fetchOptions = async () => {
        try {
            const [vendorRes, invRes] = await Promise.all([
                api.get(VENDORS),
                api.get(INVENTORY),
            ]);
            setVendors((vendorRes.data.data || []).map((v: any) => ({ label: v.vendorName || v.name, value: String(v.id) })));
            setInventoryItems((invRes.data.data || []).map((i: any) => ({ label: i.itemName, value: i.itemName })));
        } catch (error) {
            console.error("Failed to fetch dropdown options", error);
        }
    };
    const { hasPermission } = usePermissions();
    const canCreate = hasPermission("quotation", "create");
    const canUpdate = hasPermission("quotation", "update");
    const canView = hasPermission("quotation", "view");
    const quotationColumns: ViewAllColumn<ViewAllRow>[] = [
        { key: "id", header: "Quotation ID" },
        { key: "vendorId", header: "Vendor ID" },
        { key: "date", header: "Date" },
        { key: "remarks", header: "Remarks" },
    ];


    const fetchNextId = async () => {
        try {
            const { data } = await api.get(`${QUOTATIONS}/next-id`);
            setValues({ ...initialValues, id: String(data.data.nextId) });
            setIsNewMode(true);
            setIsEditing(true);
        } catch (error) {
            console.error("Failed to fetch next quotation ID", error);
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
        validationSchema: quotationSchema,
        onSubmit: async (data) => {
            const validRows = data.items.filter(r => r.itemName && r.oldRate && r.proposedRate && r.approvedRate);
            if (validRows.length === 0) {
                toast.error("Please fill at least one complete row");
                return;
            }

            const payload = {
                date: new Date(data.date).toISOString(),
                vendorId: Number(data.vendorId),
                remarks: data.remarks || "",
                itemName: validRows.map(r => r.itemName),
                oldRate: validRows.map(r => Number(r.oldRate)),
                proposedRate: validRows.map(r => Number(r.proposedRate)),
                approvedRate: validRows.map(r => Number(r.approvedRate)),
            };

            try {
                if (isNewMode) {
                    const response = await api.post(QUOTATIONS, payload);
                    toast.success(response.data.message || "Quotation created successfully");
                } else {
                    const response = await api.put(`${QUOTATIONS}/${data.id}`, payload);
                    toast.success(response.data.message || "Quotation updated successfully");
                }
                fetchNextId();
            } catch (error: any) {
                toast.error(error.response?.data?.message || "Failed to save quotation");
                throw error;
            }
        },
    });

    const handleIdBlur = async () => {
        if (!values.id) return;

        if (!canView) {
            toast.error("You do not have permission to view or search for this record.");
            setValues({ ...initialValues, id: values.id });
            setIsNewMode(true);
            setIsEditing(true);
            return;
        }

        try {
            const { data } = await api.get(`${QUOTATIONS}/${values.id}`);
            if (data.data) {
                const q = data.data;
                const fetchedRows = (q.itemName || []).map((name: string, i: number) => ({
                    itemName: name,
                    oldRate: String(q.oldRate?.[i] ?? ""),
                    proposedRate: String(q.proposedRate?.[i] ?? ""),
                    approvedRate: String(q.approvedRate?.[i] ?? ""),
                }));

                while (fetchedRows.length < 10) fetchedRows.push(defaultRow());
                if (fetchedRows.length > 10) fetchedRows.length = 10;

                setValues({
                    id: String(q.id),
                    date: new Date(q.date).toISOString().split('T')[0],
                    vendorId: String(q.vendorId),
                    remarks: q.remarks || "",
                    items: fetchedRows,
                });
                setIsNewMode(false);
                setIsEditing(false);
                toast.success("Quotation found");
            } else {
                toast.error("Quotation not found");
                setValues({ ...initialValues, id: values.id });
                setIsNewMode(true);
            }
        } catch (error: any) {
            if (error.response?.status === 403) {
                toast.error(error.response?.data?.message || "Access denied. You do not have permission.");
            } else {
                toast.error("Quotation not found");
            }
            setValues({ ...initialValues, id: values.id });
            setIsNewMode(true);
        }
    };

    const updateItemRow = (index: number, field: keyof typeof initialValues.items[0], value: string) => {
        setValues((prev) => {
            const newItems = prev.items.map((row, i) => {
                if (i === index) {
                    if (field === "itemName" && value === "") {
                        return { itemName: "", oldRate: "", proposedRate: "", approvedRate: "" };
                    }
                    return { ...row, [field]: value };
                }
                return row;
            });
            return { ...prev, items: newItems };
        });
    };

    return (
        <section className="mx-auto mt-10 w-full max-w-5xl bg-form-bg p-8 shadow-sm">
            <h1 className="mb-10 text-center text-4xl font-medium text-black tracking-wide">Quotation Entry</h1>

            <form onSubmit={handleSubmit} noValidate className="space-y-6">
                <div className="grid gap-3 md:grid-cols-2">
                    <LabeledField
                        type="number"
                        label="Quotation ID"
                        value={values.id || ""}
                        onChange={handleInputChange("id")}
                        onBlur={handleIdBlur}
                        error={errors.id}
                        wrapperClassName="w-32"
                    />
                    <LabeledField
                        type="date"
                        label="Date"
                        value={values.date}
                        onChange={handleInputChange("date")}
                        error={errors.date}
                        disabled={!isEditing}
                    />

                    <LabeledSelect
                        label="Vendor"
                        options={vendors}
                        value={values.vendorId}
                        onChange={handleSelectChange("vendorId")}
                        error={errors.vendorId}
                        disabled={!isEditing}
                        placeholder="Select Vendor"
                    />

                    <LabeledField
                        label="Remarks"
                        value={values.remarks}
                        onChange={handleInputChange("remarks")}
                        error={errors.remarks}
                        disabled={!isEditing}
                        wrapperClassName="md:col-span-2"
                    />
                </div>

                <div className="max-h-[400px] overflow-y-auto border border-zinc-400 bg-white">
                    <table className="w-full border-collapse text-sm text-black relative">
                        <thead className="sticky top-0 z-10 bg-white">
                            <tr className="border-b border-zinc-400">
                                <th className="border-r border-zinc-400 px-2 py-1.5 text-center font-medium w-1/2">Item Name</th>
                                <th className="border-r border-zinc-400 px-2 py-1.5 text-center font-medium w-1/6">Old Rate</th>
                                <th className="border-r border-zinc-400 px-2 py-1.5 text-center font-medium w-1/6">Proposed Rate</th>
                                <th className="px-2 py-1.5 text-center font-medium w-1/6">Approved Rate</th>
                            </tr>
                        </thead>
                        <tbody>
                            {values.items.map((row, index) => (
                                <tr key={index} className="border-b border-zinc-300 last:border-b-0">
                                    <td className="border-r border-zinc-300 p-0">
                                        <select
                                            value={row.itemName}
                                            onChange={(e) => updateItemRow(index, "itemName", e.target.value)}
                                            disabled={!isEditing}
                                            className="w-full bg-transparent px-2 py-1.5 text-[13px] outline-none disabled:bg-[#f3f4f6] disabled:text-zinc-500"
                                        >
                                            <option value="">Select Item</option>
                                            {inventoryItems.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
                                        </select>
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
                                    <td className="p-0">
                                        <input
                                            type="number"
                                            value={row.approvedRate}
                                            onChange={(e) => updateItemRow(index, "approvedRate", e.target.value)}
                                            disabled={!isEditing}
                                            min={0}
                                            className="w-full bg-transparent px-2 py-1.5 text-center text-[13px] outline-none disabled:bg-[#f3f4f6] disabled:text-zinc-500"
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {errors.items && <p className="mt-1.5 text-xs text-red-500">{errors.items}</p>}

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
                        endpoint={QUOTATIONS}
                        title="All Quotations"
                        columns={quotationColumns}
                        searchKeys={["id", "vendorId", "date", "remarks"]}
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
                </div>
            </form>
        </section>
    );
}

