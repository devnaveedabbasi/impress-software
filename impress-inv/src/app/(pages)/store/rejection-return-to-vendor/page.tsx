"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LabeledField } from "@/components/ui/LabeledField";
import { LabeledSelect } from "@/components/ui/LabeledSelect";
import { Button } from "@/components/ui/Button";
import { useForm } from "@/hooks/useForm";
import useDebounce from "@/hooks/useDebounce";
import { rejectionReturnToVendorSchema, type RejectionReturnToVendorFormValues } from "@/lib/validations/master";
import { REJECTION_RETURN_TO_VENDOR, VENDORS } from "@/utlis/apiRoutes";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { ViewAllResource, type ViewAllColumn } from "@/components/ui/ViewAllModal";

type ViewAllRow = { id: number; [key: string]: unknown };

const defaultRow = () => ({ itemName: "", rej: "", report: "" });
const initialValues: RejectionReturnToVendorFormValues = {
    id: "",
        date: new Date().toISOString().split('T')[0],
    vendorName: "",
    address: "",
    contactNo: "",
    saleTaxNo: "",
    transport: "",
    builtyNo: "",
    bookNo: "",
    receivedBy: "",
    items: Array.from({ length: 10 }, defaultRow),
};

export default function RejectionReturnToVendorPage() {
    const router = useRouter();
    const [isNewMode, setIsNewMode] = useState(true);
    const [isEditing, setIsEditing] = useState(true);

    const { hasPermission } = usePermissions();
    const canCreate = hasPermission("rejection-return", "create") || true; 
    const canUpdate = hasPermission("rejection-return", "update") || true;
    const canView = hasPermission("rejection-return", "view") || true;
    const rejectionColumns: ViewAllColumn<ViewAllRow>[] = [
        { key: "id", header: "Return ID" },
        { key: "date", header: "Date" },
        { key: "vendorName", header: "Vendor" },
        { key: "builtyNo", header: "Builty No" },
    ];
    const [isIdLoading, setIsIdLoading] = useState(true);
    const [nextId, setNextId] = useState<string>("");

    const [vendors, setVendors] = useState<{ id: number; name: string }[]>([]);

    useEffect(() => {
        api.get(VENDORS).then((res) => {
            setVendors(res.data?.data || []);
        }).catch(err => console.error("Failed to fetch vendors", err));
    }, []);

    const fetchNextId = async () => {
        setIsIdLoading(true);
        try {
            const { data } = await api.get(`${REJECTION_RETURN_TO_VENDOR}/next-id`);
            const fetchedNextId = String(data.data.nextId);
            setNextId(fetchedNextId);
            setValues({ ...initialValues, id: fetchedNextId });
            setIsNewMode(true);
            setIsEditing(true);
        } catch (error) {
            console.error("Failed to fetch next ID", error);
        } finally {
            setIsIdLoading(false);
        }
    };

    useEffect(() => {
        fetchNextId();
    }, []);

    const {
        values,
        errors,
        isLoading: isSubmitting,
        handleInputChange,
        handleSubmit,
        setValues,
    } = useForm({
        initialValues,
        validationSchema: rejectionReturnToVendorSchema,
        onSubmit: async (data) => {
            const validRows = data.items.filter(r => r.itemName || r.rej || r.report);
            if (validRows.length === 0) {
                toast.error("Please fill at least one complete row");
                return;
            }

            const payload = {
                claimNoteId: isNewMode ? Number(nextId) : Number(data.id),
                date: new Date(data.date).toISOString(),
                vendorName: data.vendorName,
                address: data.address,
                contactNo: data.contactNo,
                saleTaxNo: data.saleTaxNo,
                transport: data.transport,
                builtyNo: data.builtyNo,
                bookNo: data.bookNo,
                receivedBy: data.receivedBy,
                itemName: validRows.map(r => r.itemName),
                rej: validRows.map(r => Number(r.rej)),
                report: validRows.map(r => r.report),
            };

            try {
                if (isNewMode) {
                    const response = await api.post(REJECTION_RETURN_TO_VENDOR, payload);
                    toast.success(response.data.message || "Rejection Return created successfully");
                } else {
                    const response = await api.put(`${REJECTION_RETURN_TO_VENDOR}/${data.id}`, payload);
                    toast.success(response.data.message || "Rejection Return updated successfully");
                }
                fetchNextId();
            } catch (error: any) {
                toast.error(error.response?.data?.message || "Failed to save Rejection Return");
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
                const { data } = await api.get(`${REJECTION_RETURN_TO_VENDOR}/${debouncedId}`);
                if (data.data) {
                    const s = data.data;
                    const fetchedRows = (s.itemName || []).map((name: string, i: number) => ({
                        itemName: name,
                        rej: String(s.rej?.[i] ?? ""),
                        report: s.report?.[i] || "",
                    }));

                    while (fetchedRows.length < 10) fetchedRows.push(defaultRow());
                    if (fetchedRows.length > 10) fetchedRows.length = 10;

                    setValues({
                        id: String(s.id),
                        date: new Date(s.date).toISOString().split('T')[0],
                        vendorName: s.vendorName,
                        address: s.address,
                        contactNo: s.contactNo,
                        saleTaxNo: s.saleTaxNo,
                        transport: s.transport,
                        builtyNo: s.builtyNo,
                        bookNo: s.bookNo,
                        receivedBy: s.receivedBy,
                        items: fetchedRows,
                    });
                    setIsNewMode(false);
                    setIsEditing(false);
                    toast.success("Rejection Return found");
                } else {
                    toast.error("Rejection Return not found");
                    setValues({ ...initialValues, id: nextId });
                    setIsNewMode(true);
                }
            } catch (error: any) {
                if (error.response?.status === 403) {
                    toast.error(error.response?.data?.message || "Access denied. You do not have permission.");
                } else {
                    toast.error("Rejection Return not found");
                }
                setValues({ ...initialValues, id: nextId });
                setIsNewMode(true);
            } finally {
                setIsIdLoading(false);
            }
        }
        fetchDebouncedId();
    }, [debouncedId]);

    const updateItemRow = (index: number, field: keyof typeof initialValues.items[0], value: string) => {
        setValues((prev) => {
            const newItems = prev.items.map((row, i) => {
                if (i === index) {
                    return { ...row, [field]: value };
                }
                return row;
            });
            return { ...prev, items: newItems };
        });
    };

    const isRowDisabled = (index: number) => {
        if (!isEditing) return true;
        if (index === 0) return false;
        const prevRow = values.items[index - 1];
        return !(prevRow.itemName && prevRow.rej && prevRow.report);
    };

    const addRow = () => {
        setValues((prev) => ({
            ...prev,
            items: [...prev.items, defaultRow()],
        }));
    };

    const canAddRow = values.items.length > 0 && values.items.every(r => r.itemName && r.rej && r.report);

    return (
        <section className="mx-auto mt-10 w-full max-w-5xl bg-form-bg p-8 shadow-sm">
            <h1 className="mb-10 text-center text-4xl font-medium text-black tracking-wide">Rejection Return To Vendor</h1>

            <form onSubmit={handleSubmit} noValidate className="space-y-6">
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    <LabeledField
                        type={isIdLoading ? "text" : "number"}
                        label="Claim Note No"
                        value={isIdLoading ? "Loading..." : values.id || ""}
                        onChange={handleInputChange("id")}
                        error={errors.id}
                        disabled={isIdLoading}
                        min={1}
                        max={Number(nextId) || 1}
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
                        label="Vendor Name"
                        value={values.vendorName}
                        onChange={(val) => setValues(prev => ({ ...prev, vendorName: val }))}
                        error={errors.vendorName}
                        disabled={!isEditing}
                        options={vendors.map((v: any) => ({ label: v.vendorName, value: v.vendorName }))}
                    />
                    <LabeledField
                        label="Address"
                        value={values.address}
                        onChange={handleInputChange("address")}
                        error={errors.address}
                        disabled={!isEditing}
                        wrapperClassName="lg:col-span-2"
                    />
                    <LabeledField
                        label="Contact No"
                        value={values.contactNo}
                        onChange={handleInputChange("contactNo")}
                        error={errors.contactNo}
                        disabled={!isEditing}
                    />
                    <LabeledField
                        label="Sale Tax No"
                        value={values.saleTaxNo}
                        onChange={handleInputChange("saleTaxNo")}
                        error={errors.saleTaxNo}
                        disabled={!isEditing}
                    />
                    <LabeledField
                        label="Transport"
                        value={values.transport}
                        onChange={handleInputChange("transport")}
                        error={errors.transport}
                        disabled={!isEditing}
                    />
                    <LabeledField
                        label="Builty No"
                        value={values.builtyNo}
                        onChange={handleInputChange("builtyNo")}
                        error={errors.builtyNo}
                        disabled={!isEditing}
                    />
                    <LabeledField
                        label="Book No"
                        value={values.bookNo}
                        onChange={handleInputChange("bookNo")}
                        error={errors.bookNo}
                        disabled={!isEditing}
                    />
                    <LabeledField
                        label="Received By"
                        value={values.receivedBy}
                        onChange={handleInputChange("receivedBy")}
                        error={errors.receivedBy}
                        disabled={!isEditing}
                    />
                </div>

                <div className="max-h-[400px] overflow-y-auto border border-zinc-400 bg-white">
                    <table className="w-full border-collapse text-sm text-black relative bg-white">
                        <thead className="sticky top-0 z-10 bg-white">
                            <tr className="border-b border-zinc-400">
                                <th className="border-r border-zinc-400 px-2 py-1.5 text-center font-medium w-2/5">Item Name</th>
                                <th className="border-r border-zinc-400 px-2 py-1.5 text-center font-medium w-1/5">Rej Qty</th>
                                <th className="px-2 py-1.5 text-center font-medium w-2/5">Report</th>
                            </tr>
                        </thead>
                        <tbody>
                            {values.items.map((row, index) => (
                                <tr key={index} className="border-b border-zinc-300 last:border-b-0">
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
                                            value={row.rej}
                                            onChange={(e) => updateItemRow(index, "rej", e.target.value)}
                                            disabled={isRowDisabled(index)}
                                            min={1}
                                            className="w-full bg-transparent px-2 py-1.5 text-center text-[13px] outline-none disabled:bg-[#f3f4f6] disabled:text-zinc-500"
                                        />
                                    </td>
                                    <td className="p-0">
                                        <input
                                            type="text"
                                            value={row.report}
                                            onChange={(e) => updateItemRow(index, "report", e.target.value)}
                                            disabled={isRowDisabled(index)}
                                            className="w-full bg-transparent px-2 py-1.5 text-[13px] outline-none disabled:bg-[#f3f4f6] disabled:text-zinc-500"
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
                        endpoint={REJECTION_RETURN_TO_VENDOR}
                        title="All Rejection Returns"
                        columns={rejectionColumns}
                        searchKeys={["id", "date", "vendorName", "builtyNo"]}
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
