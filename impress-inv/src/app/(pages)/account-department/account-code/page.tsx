"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import api from "@/lib/axios";
import { accountCodeSchema, type AccountCodeFormValues } from "@/lib/validations/master";
import useDebounce from "@/hooks/useDebounce";
import toast from "react-hot-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { ACCOUNT_CODES } from "@/utlis/apiRoutes";
import { ViewAllModal, type ViewAllColumn } from "@/components/ui/ViewAllModal";
import { Button } from "@/components/ui/Button";

type AccountCodeRow = {
    id: number;
    headName: string;
    group: string;
    code?: string[];
    name?: string[];
    address?: string[];
    contactNo?: string[];
    saleTaxNo?: string[];
    openingBalance?: number[];
    items?: Array<{
        code: string;
        name: string;
        address: string;
        contactNo: string;
        saleTaxNo: string;
        openingBalance: string | number;
    }>;
    [key: string]: unknown;
};

type ApiError = {
    response?: {
        status?: number;
        data?: { message?: string };
    };
};

const defaultItemRow = () => ({
    code: "",
    name: "",
    address: "",
    contactNo: "",
    saleTaxNo: "",
    openingBalance: "",
});

const initialValues: AccountCodeFormValues = {
    id: "",
    headName: "",
    group: "",
    items: Array.from({ length: 4 }, defaultItemRow),
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

    const [isIdLoading, setIsIdLoading] = useState(true);
    const [nextId, setNextId] = useState("");
    const [isViewAllOpen, setIsViewAllOpen] = useState(false);
    const [accountCodes, setAccountCodes] = useState<AccountCodeRow[]>([]);
    const [hasLoadedAccountCodes, setHasLoadedAccountCodes] = useState(false);
    const [isAccountCodesLoading, setIsAccountCodesLoading] = useState(false);
    const [accountCodesError, setAccountCodesError] = useState("");
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
    } = useForm<AccountCodeFormValues>({ defaultValues: initialValues });
    const values = watch();

    const fetchNextId = async () => {
        setIsIdLoading(true);
        try {
            const { data } = await api.get(`${ACCOUNT_CODES}/next-id`, {
                params: { _ts: Date.now() },
            });
            const fetchedNextId = String(data.data.nextId);
            setNextId(fetchedNextId);
            skipNextIdLookup.current = true;
            reset({
                ...initialValues,
                id: fetchedNextId,
                items: Array.from({ length: 4 }, defaultItemRow),
            });
            setIsNewMode(true);
            setIsEditing(true);
        } catch (error) {
            console.error("Failed to fetch next account code ID", error);
        } finally {
            setIsIdLoading(false);
        }
    };

    const mapAccountCodeToForm = (ac: any): AccountCodeFormValues => {
        let fetchedItems: any[] = [];
        if (ac.items && ac.items.length > 0) {
            fetchedItems = ac.items.map((it: any) => ({
                code: it.code || "",
                name: it.name || "",
                address: it.address || "",
                contactNo: it.contactNo || "",
                saleTaxNo: it.saleTaxNo || "",
                openingBalance: it.openingBalance !== null && it.openingBalance !== undefined ? String(it.openingBalance) : "",
            }));
        } else if (Array.isArray(ac.code)) {
            fetchedItems = ac.code.map((c: string, i: number) => ({
                code: c || "",
                name: ac.name?.[i] || "",
                address: ac.address?.[i] || "",
                contactNo: ac.contactNo?.[i] || "",
                saleTaxNo: ac.saleTaxNo?.[i] || "",
                openingBalance: ac.openingBalance?.[i] !== null && ac.openingBalance?.[i] !== undefined ? String(ac.openingBalance[i]) : "",
            }));
        }

        while (fetchedItems.length < 4) {
            fetchedItems.push(defaultItemRow());
        }

        return {
            id: String(ac.id),
            headName: ac.headName || "",
            group: ac.group || "",
            items: fetchedItems,
        };
    };

    const fetchAllAccountCodes = async (openModal = true, force = false) => {
        if (openModal) setIsViewAllOpen(true);
        if (hasLoadedAccountCodes && !force) return;

        setIsAccountCodesLoading(true);
        setAccountCodesError("");
        try {
            const { data } = await api.get(ACCOUNT_CODES);
            setAccountCodes(data.data || []);
            setHasLoadedAccountCodes(true);
        } catch (error: unknown) {
            const apiError = error as ApiError;
            setAccountCodesError(apiError.response?.data?.message || "Failed to fetch account codes");
        } finally {
            setIsAccountCodesLoading(false);
        }
    };

    const addAccountCodeToCache = (item: AccountCodeRow) => {
        setAccountCodes((current) => {
            const existingIndex = current.findIndex(
                (c) => String(c.id) === String(item.id)
            );
            if (existingIndex === -1) return [...current, item];
            return current.map((c, index) => (index === existingIndex ? item : c));
        });
        setHasLoadedAccountCodes(true);
    };

    useEffect(() => {
        void fetchNextId();
        void fetchAllAccountCodes(false);
    }, []);

    const onSubmit = async (data: AccountCodeFormValues) => {
        const validationResult = accountCodeSchema.safeParse(data);
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

        const filledItems = data.items.filter(
            (row) =>
                row.code?.trim() ||
                row.name?.trim() ||
                row.address?.trim() ||
                row.contactNo?.trim() ||
                row.saleTaxNo?.trim() ||
                row.openingBalance?.trim()
        );

        const payload = {
            headName: data.headName,
            group: data.group,
            items: filledItems,
        };

        try {
            const response = isNewMode
                ? await api.post(ACCOUNT_CODES, payload)
                : await api.put(`${ACCOUNT_CODES}/${data.id}`, payload);

            toast.success(response.data.message || "Account Form saved successfully");
            if (hasLoadedAccountCodes) {
                setHasLoadedAccountCodes(false);
                await fetchAllAccountCodes(false, true);
            }
            refreshNextIdAfterSubmit.current = true;
        } catch (error: unknown) {
            const apiError = error as ApiError;
            console.error("Account Form save failed:", apiError.response?.data || error);
            toast.error(apiError.response?.data?.message || "Failed to save Account Form");
        }
    };

    useEffect(() => {
        if (!isSubmitting && refreshNextIdAfterSubmit.current) {
            refreshNextIdAfterSubmit.current = false;
            void fetchNextId();
        }
    }, [isSubmitting]);

    const debouncedId = useDebounce(values.id, 500);
    const accountCodeColumns: ViewAllColumn<AccountCodeRow>[] = [
        { key: "id", header: "Account ID" },
        { key: "headName", header: "Head Name" },
        { key: "group", header: "Group" },
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
                    items: Array.from({ length: 4 }, defaultItemRow),
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
                const cached = accountCodes.find((item) => String(item.id) === debouncedId);
                const ac = cached || (await api.get(`${ACCOUNT_CODES}/${debouncedId}`)).data.data;

                if (!ac) {
                    toast.error("Account Form not found");
                    resetToNextId();
                    return;
                }

                if (!cached) addAccountCodeToCache(ac);
                reset(mapAccountCodeToForm(ac));
                setIsNewMode(false);
                setIsEditing(false);
                toast.success("Account Form found");
            } catch (error: unknown) {
                const apiError = error as ApiError;
                toast.error(
                    apiError.response?.status === 403
                        ? apiError.response?.data?.message || "Access denied. You do not have permission."
                        : "Account Form not found"
                );
                resetToNextId();
            } finally {
                setIsIdLoading(false);
            }
        };

        void fetchDebouncedId();
    }, [debouncedId, nextId, canView, accountCodes]);

    const handleItemChange = (index: number, field: string, value: string) => {
        const newItems = [...values.items];
        newItems[index] = { ...newItems[index], [field]: value };

        // Auto add new row if editing the last row
        if (index === values.items.length - 1 && value.trim() !== "") {
            newItems.push(defaultItemRow());
        }
        setValue("items", newItems, { shouldDirty: true, shouldValidate: true });
    };

    return (
        <section className="mx-auto mt-10 w-full max-w-6xl bg-[#f0f0f0] p-8 shadow-sm">
            <h1 className="mb-8 text-center text-3xl font-medium text-black tracking-wide">
                Account Form
            </h1>

            <form onSubmit={handleSubmit(onSubmit)} noValidate>
                {/* Top Section */}
                <div className="flex flex-col gap-2 mb-8 max-w-md">
                    <div className="flex items-center gap-4">
                        <label className="w-24 text-sm text-black">Head Code</label>
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
                            className={`border border-zinc-300 px-2 py-1 outline-none text-sm w-32 text-black ${
                                errors.id ? "border-red-500" : ""
                            }`}
                        />
                        {errors.id && <span className="text-red-500 text-xs">{errors.id.message}</span>}
                    </div>

                    <div className="flex items-center gap-4">
                        <label className="w-24 text-sm text-black">Head Name</label>
                        <input
                            type="text"
                            value={values.headName}
                            onChange={(e) =>
                                setValue("headName", e.target.value, {
                                    shouldDirty: true,
                                    shouldValidate: true,
                                })
                            }
                            disabled={!isEditing}
                            className={`border border-zinc-300 px-2 py-1 outline-none text-sm flex-1 text-black ${
                                errors.headName ? "border-red-500" : ""
                            }`}
                        />
                    </div>
                    {errors.headName && (
                        <span className="text-red-500 text-xs ml-28">{errors.headName.message}</span>
                    )}

                    <div className="flex items-center gap-4">
                        <label className="w-24 text-sm text-black flex items-center gap-1">
                            Group
                        </label>
                        <div className="flex-1 ml-5 border border-zinc-300 bg-white">
                            <select
                                value={values.group}
                                onChange={(e) =>
                                    setValue("group", e.target.value, {
                                        shouldDirty: true,
                                        shouldValidate: true,
                                    })
                                }
                                disabled={!isEditing}
                                className={`w-full px-2 py-1 outline-none text-sm bg-transparent text-black ${
                                    errors.group ? "border-red-500" : ""
                                }`}
                            >
                                {groupOptions.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    {errors.group && (
                        <span className="text-red-500 text-xs ml-28">{errors.group.message}</span>
                    )}
                </div>

                {/* Grid Section */}
                <div className="border border-zinc-300 bg-white mb-8 overflow-x-auto">
                    <table className="w-full text-sm text-left text-black">
                        <thead className="bg-[#f8f8f8] border-b border-zinc-300">
                            <tr>
                                <th className="px-2 py-2 border-r border-zinc-300 font-medium w-16 text-black">
                                    Code
                                </th>
                                <th className="px-2 py-2 border-r border-zinc-300 font-medium text-black">
                                    Name
                                </th>
                                <th className="px-2 py-2 border-r border-zinc-300 font-medium text-black">
                                    Address
                                </th>
                                <th className="px-2 py-2 border-r border-zinc-300 font-medium text-black">
                                    Contact
                                </th>
                                <th className="px-2 py-2 border-r border-zinc-300 font-medium text-black">
                                    Sale Tax No
                                </th>
                                <th className="px-2 py-2 font-medium w-32 text-black">
                                    Opening Bal
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {values.items.map((item, idx) => (
                                <tr
                                    key={idx}
                                    className="border-b border-zinc-300 last:border-0 hover:bg-zinc-50"
                                >
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
                                    <td>
                                        <input
                                            type="number"
                                            value={item.openingBalance}
                                            onChange={(e) =>
                                                handleItemChange(idx, "openingBalance", e.target.value)
                                            }
                                            disabled={!isEditing}
                                            className="w-full px-2 py-1.5 outline-none bg-transparent text-black"
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {errors.items && (
                    <div className="text-red-500 text-sm mb-4">{errors.items.message}</div>
                )}

                {/* Action Buttons */}
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
                        onClick={() => fetchAllAccountCodes()}
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
                title="All Account Codes"
                rows={accountCodes}
                columns={accountCodeColumns}
                searchKeys={["id", "headName", "group"]}
                isLoading={isAccountCodesLoading}
                error={accountCodesError}
                onClose={() => setIsViewAllOpen(false)}
                onRowSelect={(item) => {
                    reset(mapAccountCodeToForm(item));
                    setIsNewMode(false);
                    setIsEditing(false);
                    setIsViewAllOpen(false);
                }}
                onDelete={() => undefined}
            />
        </section>
    );
}
