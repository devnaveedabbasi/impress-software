"use client";

import { useEffect, useState } from "react";
import api from "@/lib/axios";
import { accountCodeSchema, type AccountCodeFormValues } from "@/lib/validations/master";
import { useForm } from "@/hooks/useForm";
import toast from "react-hot-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { ACCOUNT_CODES } from "@/utlis/apiRoutes";
import { ViewAllResource, type ViewAllColumn } from "@/components/ui/ViewAllModal";

type ViewAllRow = { id: number; [key: string]: unknown };

const initialValues: AccountCodeFormValues = {
    id: "",
    headName: "",
    group: "",
    items: [
        { code: "", name: "", address: "", contactNo: "", saleTaxNo: "", openingBalance: "" },
        { code: "", name: "", address: "", contactNo: "", saleTaxNo: "", openingBalance: "" },
        { code: "", name: "", address: "", contactNo: "", saleTaxNo: "", openingBalance: "" },
        { code: "", name: "", address: "", contactNo: "", saleTaxNo: "", openingBalance: "" }
    ],
};

const groupOptions = [
    { label: "Select Group", value: "" },
    { label: "Expenses", value: "expenses" },
    { label: "Current Assets", value: "currentassets" },
    { label: "Liabilities", value: "liabilities" },
    { label: "Capital", value: "capital" },
    { label: "Revenue", value: "revenue" },
    { label: "Purchases", value: "purchases" },
    { label: "Other Income & Expense", value: "otherIncomeAndExpense" },
    { label: "Expense", value: "Expense" },
];

export default function AccountCodePage() {
    const [isNewMode, setIsNewMode] = useState(true);
    const [isEditing, setIsEditing] = useState(true);
    const { hasPermission } = usePermissions();
    const canCreate = hasPermission("account_code", "create");
    const canUpdate = hasPermission("account_code", "update");
    const canView = hasPermission("account_code", "view");
    const accountCodeColumns: ViewAllColumn<ViewAllRow>[] = [
        { key: "id", header: "Account ID" },
        { key: "headName", header: "Head Name" },
        { key: "group", header: "Group" },
    ];


    const fetchNextId = async () => {
        try {
            const { data } = await api.get(`${ACCOUNT_CODES}/next-id`);
            setValues({ ...initialValues, id: String(data.data.nextId) });
            setIsNewMode(true);
            setIsEditing(true);
        } catch (error) {
            console.error("Failed to fetch next account code ID", error);
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
        validationSchema: accountCodeSchema,
        onSubmit: async (data) => {
            // Filter out completely empty rows
            const filledItems = data.items.filter(row => 
                row.code?.trim() || row.name?.trim() || row.address?.trim() || 
                row.contactNo?.trim() || row.saleTaxNo?.trim() || row.openingBalance?.trim()
            );

            const payload = {
                headName: data.headName,
                group: data.group,
                items: filledItems,
            };

            try {
                if (isNewMode) {
                    const response = await api.post(ACCOUNT_CODES, payload);
                    toast.success(response.data.message || "Account Form created successfully");
                } else {
                    const response = await api.put(`${ACCOUNT_CODES}/${data.id}`, payload);
                    toast.success(response.data.message || "Account Form updated successfully");
                }
                fetchNextId();
            } catch (error: any) {
                toast.error(error.response?.data?.message || "Failed to save Account Form");
                throw error;
            }
        },
    });

    const handleIdBlur = async (selectedId = values.id) => {
        if (!selectedId) return;

        if (!canView) {
            toast.error("You do not have permission to view or search for this record.");
            setValues({ ...initialValues, id: selectedId });
            setIsNewMode(true);
            setIsEditing(true);
            return;
        }
        try {
            const { data } = await api.get(`${ACCOUNT_CODES}/${selectedId}`);
            if (data.data) {
                const ac = data.data;
                let fetchedItems = ac.items?.length > 0 ? ac.items.map((it: any) => ({
                    code: it.code || "",
                    name: it.name || "",
                    address: it.address || "",
                    contactNo: it.contactNo || "",
                    saleTaxNo: it.saleTaxNo || "",
                    openingBalance: it.openingBalance !== null && it.openingBalance !== undefined ? String(it.openingBalance) : "",
                })) : [...initialValues.items];

                // Pad with empty rows to ensure at least 4 rows are displayed
                while (fetchedItems.length < 4) {
                    fetchedItems.push({ code: "", name: "", address: "", contactNo: "", saleTaxNo: "", openingBalance: "" });
                }

                setValues({
                    id: String(ac.id),
                    headName: ac.headName,
                    group: ac.group,
                    items: fetchedItems,
                });
                setIsNewMode(false);
                setIsEditing(false);
                toast.success("Account Form found");
            } else {
                toast.error("Account Form not found");
                setValues({ ...initialValues, id: selectedId });
                setIsNewMode(true);
                setIsEditing(true);
            }
        } catch (error: any) {
            if (error.response?.status === 403) {
                toast.error(error.response?.data?.message || "Access denied. You do not have permission.");
            } else {
                toast.error("Invalid Head Code");
            }
            setValues({ ...initialValues, id: selectedId });
            setIsNewMode(true);
            setIsEditing(true);
        }
    };

    const handleItemChange = (index: number, field: string, value: string) => {
        const newItems = [...values.items];
        newItems[index] = { ...newItems[index], [field]: value };
        setValues({ ...values, items: newItems });
        
        // Auto add new row if editing the last row
        if (index === values.items.length - 1 && value.trim() !== "") {
            setValues({
                ...values,
                items: [...newItems, { code: "", name: "", address: "", contactNo: "", saleTaxNo: "", openingBalance: "" }]
            });
        }
    };

    const handleDeleteRow = (index: number) => {
        if (values.items.length > 1) {
            const newItems = values.items.filter((_: any, i: number) => i !== index);
            setValues({ ...values, items: newItems });
        }
    };

    const btnClass = "bg-white border border-zinc-400 px-6 py-1.5 text-[15px] text-black hover:bg-zinc-50 active:bg-zinc-100 min-w-[85px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center";

    return (
        <section className="mx-auto mt-10 w-full max-w-6xl bg-[#f0f0f0] p-8 shadow-sm">
            <h1 className="mb-8 text-center text-3xl font-medium text-black tracking-wide">Account Form</h1>

            <form onSubmit={handleSubmit} noValidate>
                {/* Top Section */}
                <div className="flex flex-col gap-2 mb-8 max-w-md">
                    <div className="flex items-center gap-4">
                        <label className="w-24 text-sm text-black">Head Code</label>
                        <input
                            type="number"
                            value={values.id || ""}
                            onChange={handleInputChange("id")}
                            onBlur={() => void handleIdBlur()}
                            className={`border border-zinc-300 px-2 py-1 outline-none text-sm w-32 text-black ${errors.id ? "border-red-500" : ""}`}
                        />
                        {errors.id && <span className="text-red-500 text-xs">{errors.id}</span>}
                    </div>
                    
                    <div className="flex items-center gap-4">
                        <label className="w-24 text-sm text-black">Head Name</label>
                        <input
                            type="text"
                            value={values.headName}
                            onChange={handleInputChange("headName")}
                            disabled={!isEditing}
                            className={`border border-zinc-300 px-2 py-1 outline-none text-sm flex-1 text-black ${errors.headName ? "border-red-500" : ""}`}
                        />
                    </div>
                    {errors.headName && <span className="text-red-500 text-xs ml-28">{errors.headName}</span>}

                    <div className="flex items-center gap-4">
                        <label className="w-24 text-sm text-black flex items-center gap-1">
                            Group
                        </label>
                        <div className="flex-1 ml-5 border border-zinc-300 bg-white">
                            <select
                                value={values.group}
                                onChange={(e) => setValues({ ...values, group: e.target.value })}
                                disabled={!isEditing}
                                className={`w-full px-2 py-1 outline-none text-sm bg-transparent text-black ${errors.group ? "border-red-500" : ""}`}
                            >
                                {groupOptions.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    {errors.group && <span className="text-red-500 text-xs ml-28">{errors.group}</span>}
                </div>

                {/* Grid Section */}
                <div className="border border-zinc-300 bg-white mb-8 overflow-x-auto">
                    <table className="w-full text-sm text-left text-black">
                        <thead className="bg-[#f8f8f8] border-b border-zinc-300">
                            <tr>
                                <th className="px-2 py-2 border-r border-zinc-300 font-medium w-16 text-black">Code</th>
                                <th className="px-2 py-2 border-r border-zinc-300 font-medium text-black">Name</th>
                                <th className="px-2 py-2 border-r border-zinc-300 font-medium text-black">Address</th>
                                <th className="px-2 py-2 border-r border-zinc-300 font-medium text-black">Contact</th>
                                <th className="px-2 py-2 border-r border-zinc-300 font-medium text-black">Sale Tax No</th>
                                <th className="px-2 py-2 font-medium w-32 border-r border-zinc-300 text-black">Opening Bal</th>
                            </tr>
                        </thead>
                        <tbody>
                            {values.items.map((item: any, idx: number) => (
                                <tr key={idx} className="border-b border-zinc-300 last:border-0 hover:bg-zinc-50">
                                    <td className="border-r border-zinc-300">
                                        <input
                                            type="text"
                                            value={item.code}
                                            onChange={(e) => handleItemChange(idx, "code", e.target.value)}
                                            disabled={!isEditing}
                                            className="w-full px-2 py-1.5 outline-none bg-transparent text-black"
                                        />
                                    </td>
                                    <td className="border-r border-zinc-300">
                                        <input
                                            type="text"
                                            value={item.name}
                                            onChange={(e) => handleItemChange(idx, "name", e.target.value)}
                                            disabled={!isEditing}
                                            className="w-full px-2 py-1.5 outline-none bg-transparent text-black"
                                        />
                                    </td>
                                    <td className="border-r border-zinc-300">
                                        <input
                                            type="text"
                                            value={item.address}
                                            onChange={(e) => handleItemChange(idx, "address", e.target.value)}
                                            disabled={!isEditing}
                                            className="w-full px-2 py-1.5 outline-none bg-transparent text-black"
                                        />
                                    </td>
                                    <td className="border-r border-zinc-300">
                                        <input
                                            type="text"
                                            value={item.contactNo}
                                            onChange={(e) => handleItemChange(idx, "contactNo", e.target.value)}
                                            disabled={!isEditing}
                                            className="w-full px-2 py-1.5 outline-none bg-transparent text-black"
                                        />
                                    </td>
                                    <td className="border-r border-zinc-300">
                                        <input
                                            type="text"
                                            value={item.saleTaxNo}
                                            onChange={(e) => handleItemChange(idx, "saleTaxNo", e.target.value)}
                                            disabled={!isEditing}
                                            className="w-full px-2 py-1.5 outline-none bg-transparent text-black"
                                        />
                                    </td>
                                    <td className="border-r border-zinc-300">
                                        <input
                                            type="number"
                                            value={item.openingBalance}
                                            onChange={(e) => handleItemChange(idx, "openingBalance", e.target.value)}
                                            disabled={!isEditing}
                                            className="w-full px-2 py-1.5 outline-none bg-transparent text-black"
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {errors.items && typeof errors.items === 'string' && (
                    <div className="text-red-500 text-sm mb-4">{errors.items}</div>
                )}

                {/* Action Buttons */}
                <div className="flex items-center justify-center gap-4">
                    <button type="button" onClick={fetchNextId} className={btnClass} disabled={isSubmitting || !canCreate}>New</button>
                    <ViewAllResource
                        endpoint={ACCOUNT_CODES}
                        title="All Account Codes"
                        columns={accountCodeColumns}
                        searchKeys={["id", "headName", "group"]}
                        canView={canView}
                        onSelectId={(id) => {
                            const selectedId = String(id);
                            setValues((prev) => ({ ...prev, id: selectedId }));
                            void handleIdBlur(selectedId);
                        }}
                    />
                    <button type="submit" className={btnClass} disabled={!isEditing || isSubmitting}>Save</button>
                    <button type="button" onClick={async () => {
                        if (!values.id) return;
                        try {
                            const response = await api.delete(`${ACCOUNT_CODES}/${values.id}`);
                            toast.success(response.data.message || "Deleted successfully");
                            fetchNextId();
                        } catch (error) {
                            toast.error("Failed to delete");
                        }
                    }} className={btnClass} disabled={isEditing || isNewMode || isSubmitting}>Delete</button>
                    <button type="button" onClick={() => setIsEditing(true)} className={btnClass} disabled={isEditing || isNewMode}>Edit</button>
                </div>
            </form>
        </section>
    );
}
