"use client";

import { useEffect, useState, useMemo } from "react";
import { LabeledField } from "@/components/ui/LabeledField";
import { LabeledSelect } from "@/components/ui/LabeledSelect";
import { Button } from "@/components/ui/Button";
import { useForm } from "@/hooks/useForm";
import { purchaseOrderSchema, type PurchaseOrderFormValues } from "@/lib/validations/master";
import { PURCHASE_ORDERS, VENDORS, QUOTATIONS, INVENTORY } from "@/utlis/apiRoutes";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { ViewAllResource, type ViewAllColumn } from "@/components/ui/ViewAllModal";

type ViewAllRow = { id: number; [key: string]: unknown };

const defaultRow = () => ({ code: "", itemName: "", unit: "", quantity: "", rate: "", amount: "" });
const initialValues: PurchaseOrderFormValues = {
    id: "",
    date: new Date().toISOString().split('T')[0],
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

    const fetchOptions = async () => {
        try {
            const [vendorRes, qtRes, invRes] = await Promise.allSettled([
                api.get(VENDORS),
                api.get(QUOTATIONS),
                api.get(INVENTORY),
            ]);
            if (vendorRes.status === "fulfilled") {
                setVendors((vendorRes.value.data.data || []).map((v: any) => ({ label: v.vendorName || v.name, value: String(v.id) })));
            }
            if (qtRes.status === "fulfilled") {
                setQuotations((qtRes.value.data.data || []).map((q: any) => ({ label: `QT-${q.id}`, value: String(q.id) })));
            }
            if (invRes.status === "fulfilled") {
                setInventoryItems((invRes.value.data.data || []).map((i: any) => ({ label: i.itemName, value: i.itemName })));
            }
        } catch (error) {
            console.error("Failed to fetch dropdown options", error);
        }
    };
    const { hasPermission } = usePermissions();
    const canCreate = hasPermission("purchase_order", "create");
    const canUpdate = hasPermission("purchase_order", "update");
    const canView = hasPermission("purchase_order", "view");
    const purchaseOrderColumns: ViewAllColumn<ViewAllRow>[] = [
        { key: "id", header: "PO ID" },
        { key: "vendorId", header: "Vendor ID" },
        { key: "date", header: "Date" },
        { key: "grandTotal", header: "Grand Total" },
    ];


    const fetchNextId = async () => {
        try {
            const { data } = await api.get(`${PURCHASE_ORDERS}/next-id`);
            setValues({ ...initialValues, id: String(data.data.nextId) });
            setIsNewMode(true);
            setIsEditing(true);
        } catch (error) {
            console.error("Failed to fetch next PO ID", error);
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
        validationSchema: purchaseOrderSchema,
        onSubmit: async (data) => {
            const validRows = data.items.filter(r => r.code && r.itemName && r.unit && r.quantity && r.rate && r.amount);
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

                code: validRows.map(r => Number(r.code)),
                itemName: validRows.map(r => r.itemName),
                unit: validRows.map(r => Number(r.unit)),
                quantity: validRows.map(r => Number(r.quantity)),
                rate: validRows.map(r => Number(r.rate)),
                amount: validRows.map(r => Number(r.amount)),

                total: Number(data.total || 0),
                saleTaxPercent: Number(data.saleTaxPercent || 0),
                totalWithSaleTax: Number(data.totalWithSaleTax || 0),
                withHoldingPercent: Number(data.withHoldingPercent || 0),
                withHoldingAmount: Number(data.withHoldingAmount || 0),
                grandTotal: Number(data.grandTotal || 0),
            };

            try {
                if (isNewMode) {
                    const response = await api.post(PURCHASE_ORDERS, payload);
                    toast.success(response.data.message || "Purchase Order created successfully");
                } else {
                    const response = await api.put(`${PURCHASE_ORDERS}/${data.id}`, payload);
                    toast.success(response.data.message || "Purchase Order updated successfully");
                }
                fetchNextId();
            } catch (error: any) {
                toast.error(error.response?.data?.message || "Failed to save Purchase Order");
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
            const { data } = await api.get(`${PURCHASE_ORDERS}/${values.id}`);
            if (data.data) {
                const po = data.data;
                const fetchedRows = (po.itemName || []).map((name: string, i: number) => ({
                    code: String(po.code?.[i] ?? ""),
                    itemName: name,
                    unit: String(po.unit?.[i] ?? ""),
                    quantity: String(po.quantity?.[i] ?? ""),
                    rate: String(po.rate?.[i] ?? ""),
                    amount: String(po.amount?.[i] ?? ""),
                }));

                while (fetchedRows.length < 10) fetchedRows.push(defaultRow());
                if (fetchedRows.length > 10) fetchedRows.length = 10;

                setValues({
                    id: String(po.id),
                    date: new Date(po.date).toISOString().split('T')[0],
                    vendorId: String(po.vendorId),
                    validity: po.validity || "",
                    instruction: po.instruction || "",
                    quotationId: String(po.quotationId || ""),
                    items: fetchedRows,
                    total: String(po.total || ""),
                    saleTaxPercent: String(po.saleTaxPercent || ""),
                    totalWithSaleTax: String(po.totalWithSaleTax || ""),
                    withHoldingPercent: String(po.withHoldingPercent || ""),
                    withHoldingAmount: String(po.withHoldingAmount || ""),
                    grandTotal: String(po.grandTotal || ""),
                });
                setIsNewMode(false);
                setIsEditing(false);
                toast.success("Purchase Order found");
            } else {
                toast.error("Purchase Order not found");
                setValues({ ...initialValues, id: values.id });
                setIsNewMode(true);
            }
        } catch (error: any) {
            if (error.response?.status === 403) {
                toast.error(error.response?.data?.message || "Access denied. You do not have permission.");
            } else {
                toast.error("Purchase Order not found");
            }
            setValues({ ...initialValues, id: values.id });
            setIsNewMode(true);
        }
    };

    const handleQuotationChange = async (val: string) => {
        handleSelectChange("quotationId")(val);
        if (!val) return;
        try {
            const { data } = await api.get(`${QUOTATIONS}/${val}`);
            if (data.data) {
                const q = data.data;
                const fetchedRows = (q.itemName || []).map((name: string, i: number) => {
                    const rate = q.approvedRate?.[i] ?? q.proposedRate?.[i] ?? q.oldRate?.[i] ?? 0;
                    return {
                        code: "", // Code might not be in quotation, leave empty for user to fill
                        itemName: name,
                        unit: "1", // Default unit
                        quantity: "1", // Default qty
                        rate: String(rate),
                        amount: String(rate * 1), // Default qty * rate
                    };
                });

                while (fetchedRows.length < 10) fetchedRows.push(defaultRow());
                if (fetchedRows.length > 10) fetchedRows.length = 10;

                setValues(prev => ({
                    ...prev,
                    vendorId: String(q.vendorId),
                    items: fetchedRows
                }));
                toast.success("Quotation items loaded");
            }
        } catch (error) {
            console.error("Failed to load quotation details", error);
            toast.error("Failed to load quotation details");
        }
    };

    const updateItemRow = (index: number, field: keyof typeof initialValues.items[0], value: string) => {
        setValues((prev) => {
            const newItems = prev.items.map((row, i) => {
                if (i === index) {
                    if (field === "itemName" && value === "") {
                        return defaultRow();
                    }
                    const newRow = { ...row, [field]: value };
                    // Auto-calculate amount
                    if (field === "quantity" || field === "rate") {
                        const q = Number(newRow.quantity) || 0;
                        const r = Number(newRow.rate) || 0;
                        newRow.amount = q > 0 && r > 0 ? String(q * r) : "";
                    }
                    return newRow;
                }
                return row;
            });
            return { ...prev, items: newItems };
        });
    };

    // Auto-calculate totals
    useEffect(() => {
        const total = values.items.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
        const saleTaxPercent = Number(values.saleTaxPercent) || 0;
        const saleTaxAmount = (total * saleTaxPercent) / 100;
        const totalWithSaleTax = total + saleTaxAmount;

        const withHoldingPercent = Number(values.withHoldingPercent) || 0;
        const withHoldingAmount = (totalWithSaleTax * withHoldingPercent) / 100;
        const grandTotal = totalWithSaleTax - withHoldingAmount;

        setValues(prev => ({
            ...prev,
            total: total > 0 ? String(total.toFixed(2)) : "",
            totalWithSaleTax: totalWithSaleTax > 0 ? String(totalWithSaleTax.toFixed(2)) : "",
            withHoldingAmount: withHoldingAmount > 0 ? String(withHoldingAmount.toFixed(2)) : "",
            grandTotal: grandTotal > 0 ? String(grandTotal.toFixed(2)) : "",
        }));
    }, [values.items, values.saleTaxPercent, values.withHoldingPercent]);

    // Button classes matched with design reference
    const btnClass = "bg-white border border-zinc-400 px-6 py-1.5 text-[15px] text-black hover:bg-zinc-50 active:bg-zinc-100 min-w-[85px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center";

    const saleTaxAmountComputed = (Number(values.total) * (Number(values.saleTaxPercent) || 0)) / 100;

    return (
        <section className="mx-auto mt-10 w-full max-w-5xl bg-form-bg p-8 shadow-sm">
            <h1 className="mb-8 text-center text-4xl text-black tracking-wide">P.O From</h1>

            <form onSubmit={handleSubmit} noValidate>
                {/* Top Section */}
                <div className="flex flex-col md:flex-row justify-between items-start gap-10 mb-6">
                    <div className="flex-1 w-full space-y-1.5 max-w-[500px]">
                        <LabeledField
                            type="number"
                            label="Po No"
                            value={values.id || ""}
                            onChange={handleInputChange("id")}
                            onBlur={handleIdBlur}
                            error={errors.id}
                        />
                        <LabeledSelect
                            label="Vendor Name"
                            options={vendors}
                            value={values.vendorId}
                            onChange={handleSelectChange("vendorId")}
                            error={errors.vendorId}
                            disabled={!isEditing}
                            placeholder="Select Vendor"
                        />
                        <LabeledField
                            label="Validity"
                            value={values.validity}
                            onChange={handleInputChange("validity")}
                            error={errors.validity}
                            disabled={!isEditing}
                        />
                        <LabeledField
                            label="Instruction"
                            value={values.instruction}
                            onChange={handleInputChange("instruction")}
                            error={errors.instruction}
                            disabled={!isEditing}
                        />
                        <LabeledSelect
                            label="QT ID"
                            options={quotations}
                            value={values.quotationId}
                            onChange={(val) => handleQuotationChange(String(val))}
                            error={errors.quotationId}
                            disabled={!isEditing}
                            placeholder="Select Quotation"
                        />
                    </div>

                    <div className="shrink-0 w-[250px]">
                        <LabeledField
                            type="date"
                            label="P.O Date"
                            value={values.date}
                            onChange={handleInputChange("date")}
                            error={errors.date}
                            disabled={!isEditing}
                        />
                    </div>
                </div>

                {/* Table Section */}
                <div className="border border-zinc-400 bg-white mb-6 overflow-x-auto">
                    <table className="w-full border-collapse text-sm text-black">
                        <thead className="bg-white">
                            <tr className="border-b border-zinc-400">
                                <th className="border-r border-zinc-400 px-2 py-1.5 text-center font-medium w-16">Code</th>
                                <th className="border-r border-zinc-400 px-2 py-1.5 text-center font-medium">Item Name</th>
                                <th className="border-r border-zinc-400 px-2 py-1.5 text-center font-medium w-20">Unit</th>
                                <th className="border-r border-zinc-400 px-2 py-1.5 text-center font-medium w-24">Qty</th>
                                <th className="border-r border-zinc-400 px-2 py-1.5 text-center font-medium w-32">Rate</th>
                                <th className="px-2 py-1.5 text-center font-medium w-32">Amount</th>
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
                                            {inventoryItems.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
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
                {errors.items && <p className="mb-4 text-xs text-red-500 text-center">{errors.items}</p>}

                {/* Bottom Section */}
                <div className="flex flex-col md:flex-row justify-between items-end gap-6">
                    {/* Action Buttons */}
                    <div className="flex gap-2">
                        <button type="button" onClick={fetchNextId} className={btnClass} disabled={isSubmitting || !canCreate}>New</button>
                        <ViewAllResource
                            endpoint={PURCHASE_ORDERS}
                            title="All Purchase Orders"
                            columns={purchaseOrderColumns}
                            searchKeys={["id", "vendorId", "date", "grandTotal"]}
                            canView={canView}
                            onSelectId={(id) => setValues((prev) => ({ ...prev, id: String(id) }))}
                        />
                        <button type="submit" className={btnClass} disabled={!isEditing || isSubmitting}>Save</button>
                        <button type="button" onClick={() => setIsEditing(true)} className={btnClass} disabled={isEditing || isNewMode}>Edit</button>

                    </div>

                    {/* Totals Box */}
                    <div className="border border-zinc-400 text-black bg-white w-full md:w-[350px]">
                        <div className="flex border-b border-zinc-400">
                            <div className="flex-1 text-center py-1.5 text-sm flex items-center justify-center font-medium">Total</div>
                            <div className="w-[120px] border-l border-zinc-400 text-right px-2 py-1.5 text-sm bg-white">{values.total || "0.00"}</div>
                        </div>
                        <div className="flex border-b border-zinc-400">
                            <div className="flex-1 flex text-sm">
                                <div className="flex-1 text-center py-1.5 flex items-center justify-center font-medium">Sale Tax %</div>
                                <div className="w-10 border-l border-zinc-400 flex items-center justify-center p-0">
                                    <input
                                        type="number"
                                        placeholder="Is"
                                        value={values.saleTaxPercent}
                                        onChange={handleInputChange("saleTaxPercent")}
                                        disabled={!isEditing}
                                        className="w-full h-full text-center text-sm outline-none bg-transparent"
                                    />
                                </div>
                            </div>
                            <div className="w-[120px] border-l border-zinc-400 text-right px-2 py-1.5 text-sm bg-white">
                                {saleTaxAmountComputed > 0 ? saleTaxAmountComputed.toFixed(2) : ""}
                            </div>
                        </div>
                        <div className="flex border-b border-zinc-400">
                            <div className="flex-1 text-center py-1.5 text-sm flex items-center justify-center font-medium">TOTAL With S.Tax:</div>
                            <div className="w-[120px] border-l border-zinc-400 text-right px-2 py-1.5 text-sm bg-white">{values.totalWithSaleTax || "0.00"}</div>
                        </div>
                        <div className="flex border-b border-zinc-400">
                            <div className="flex-1 flex text-sm">
                                <div className="flex-1 text-center py-1.5 flex items-center justify-center font-medium">W.Holding%</div>
                                <div className="w-10 border-l border-zinc-400 flex items-center justify-center p-0">
                                    <input
                                        type="number"
                                        value={values.withHoldingPercent}
                                        onChange={handleInputChange("withHoldingPercent")}
                                        disabled={!isEditing}
                                        className="w-full h-full text-center text-sm outline-none bg-transparent"
                                    />
                                </div>
                            </div>
                            <div className="w-[120px] border-l border-zinc-400 text-right px-2 py-1.5 text-sm bg-white">
                                {values.withHoldingAmount ? `-${values.withHoldingAmount}` : ""}
                            </div>
                        </div>
                        <div className="flex">
                            <div className="flex-1 text-center py-1.5 text-sm flex items-center justify-center font-medium">Grand TOTAL:</div>
                            <div className="w-[120px] border-l border-zinc-400 text-right px-2 py-1.5 text-sm bg-white">{values.grandTotal || "0.00"}</div>
                        </div>
                    </div>
                </div>
            </form>
        </section>
    );
}
