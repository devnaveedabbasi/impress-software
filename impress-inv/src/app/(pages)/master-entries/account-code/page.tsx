"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import api from "@/lib/axios";
import { accountCodeSchema, type AccountCodeFormValues } from "@/lib/validations/master";
import useDebounce from "@/hooks/useDebounce";
import toast from "react-hot-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { ACCOUNT_CODES } from "@/utlis/apiRoutes";
import type { ViewAllColumn } from "@/components/ui/ViewAllModal";
import { InfiniteViewAllModal, useRefreshMasterList } from "@/components/ui/InfiniteViewAllModal";
import { EntryActions } from "@/components/ui/EntryActions";
import { LabeledSelect } from "@/components/ui/LabeledSelect";
import { RowDeleteButton, deletableRowClassName } from "@/components/ui/RowDeleteButton";
import { AddRowButton } from "@/components/ui/AddRowButton";
import { formatPrice, parsePrice } from "@/lib/price";
import { useMasterRecord } from "@/hooks/useMasterRecord";
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
    const refreshList = useRefreshMasterList("account-codes");
    const { fetchOne, prefetchNear } = useMasterRecord("account-codes", ACCOUNT_CODES);
    const [accountCodes, setAccountCodes] = useState<AccountCodeRow[]>([]);
    // when (a time) the next id lookup should be skipped: set right before the form is filled by itself (after a Save / New)
    const skipNextIdLookup = useRef(0);

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

    // An error goes away as soon as the user changes that field, it does not stay red until the next Save
    useEffect(() => {
        const subscription = watch((_, { name }) => {
            if (name) clearErrors(name.split(".")[0] as keyof AccountCodeFormValues);
        });
        return () => subscription.unsubscribe();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [watch, clearErrors]);

    const fetchNextId = async () => {
        setIsIdLoading(true);
        try {
            const { data } = await api.get(`${ACCOUNT_CODES}/next-id`, {
                params: { _ts: Date.now() },
            });
            const fetchedNextId = String(data.data.nextId);
            setNextId(fetchedNextId);
            skipNextIdLookup.current = Date.now();
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

    const addAccountCodeToCache = (item: AccountCodeRow) => {
        setAccountCodes((current) => {
            const existingIndex = current.findIndex(
                (c) => String(c.id) === String(item.id)
            );
            if (existingIndex === -1) return [...current, item];
            return current.map((c, index) => (index === existingIndex ? item : c));
        });
    };

    useEffect(() => {
        void fetchNextId();
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
            setAccountCodes([]); // the looked-up copies are old now
            void refreshList();
            // After Save the record stays on the screen (it does not jump to the next new one: the New button does that).
            // Only the next number is read again, quietly, so a new record still gets the right number.
            setIsNewMode(false);
            setIsEditing(false);
            skipNextIdLookup.current = Date.now();
            void api
                .get(`${ACCOUNT_CODES}/next-id`, { params: { _ts: Date.now() } })
                .then(({ data }) => setNextId(String(data.data.nextId)))
                .catch(() => {
                    skipNextIdLookup.current = 0;
                });
        } catch (error: unknown) {
            const apiError = error as ApiError;
            console.error("Account Form save failed:", apiError.response?.data || error);
            toast.error(apiError.response?.data?.message || "Failed to save Account Form");
        }
    };

    const debouncedId = useDebounce(values.id, 500);
    const accountCodeColumns: ViewAllColumn<AccountCodeRow>[] = [
        { key: "id", header: "Account ID" },
        { key: "headName", header: "Head Name" },
        { key: "group", header: "Group" },
    ];

    useEffect(() => {
        const fetchDebouncedId = async () => {
            if (!debouncedId) return;
            // The skip is only for the lookup that follows right after a Save / New. When the id did not change, nothing runs
            // that lookup and the mark stays: it must not swallow a lookup the user asks for later (going back to the
            // previous record would show nothing until the second try).
            if (skipNextIdLookup.current) {
                const isRecent = Date.now() - skipNextIdLookup.current < 2500;
                skipNextIdLookup.current = 0;
                if (isRecent) return;
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
                const ac = cached || (await fetchOne(debouncedId));
                prefetchNear(debouncedId, Number(nextId));

                if (!ac) {
                    toast.error("Account Form not found");
                    resetToNextId();
                    return;
                }

                if (!cached) addAccountCodeToCache(ac);
                reset(mapAccountCodeToForm(ac));
                setIsNewMode(false);
                setIsEditing(false);
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

    // Remove a row (it is gone from the form when Save is pressed); the table keeps at least 4 rows
    const removeItemRow = (index: number) => {
        const remaining = values.items.filter((_, i) => i !== index);
        while (remaining.length < 4) remaining.push(defaultItemRow());
        setValue("items", remaining, { shouldDirty: true, shouldValidate: true });
    };

    const addItemRow = () => {
        setValue("items", [...values.items, defaultItemRow()], { shouldDirty: true });
    };

    const rowHasData = (row: { code?: string; name?: string; address?: string; contactNo?: string; saleTaxNo?: string; openingBalance?: string }) =>
        Boolean(row.code || row.name || row.address || row.contactNo || row.saleTaxNo || row.openingBalance);

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

            <form
                onSubmit={(event) => {
                    // Clear stale manual errors, otherwise handleSubmit blocks onSubmit forever
                    clearErrors();
                    void handleSubmit(onSubmit)(event);
                }}
                noValidate
            >
                {/* Top Section */}
                <div className="flex flex-col gap-2 mb-8 max-w-md">
                    <div className="flex items-center gap-4">
                        <label className="w-24 text-sm text-black">Head Code</label>
                        <input
                            type="number"
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
                            <LabeledSelect
                                variant="cell"
                                label="Group"
                                options={groupOptions}
                                value={values.group}
                                onChange={(val) =>
                                    setValue("group", val, {
                                        shouldDirty: true,
                                        shouldValidate: true,
                                    })
                                }
                                disabled={!isEditing}
                                searchThreshold={0}
                                placeholder="Select Group"
                            />
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
                                <tr key={idx} className={deletableRowClassName}>
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
                                    <td className="relative">
                                        <input
                                            type="text"
                                            inputMode="text"
                                            autoComplete="off"
                                            value={formatPrice(item.openingBalance)}
                                            onChange={(e) =>
                                                handleItemChange(idx, "openingBalance", parsePrice(e.target.value, true))
                                            }
                                            disabled={!isEditing}
                                            className="w-full px-2 py-1.5 pr-8 outline-none bg-transparent text-black"
                                        />
                                        {isEditing && rowHasData(item) && (
                                            <RowDeleteButton rowNumber={idx + 1} onClick={() => removeItemRow(idx)} />
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="-mt-6 mb-4 flex items-center justify-between gap-2">
                    <span className="text-xs text-zinc-500">
                        {isEditing ? "Tip: hover a row and click the trash icon to remove it" : ""}
                    </span>
                    <AddRowButton onClick={addItemRow} disabled={!isEditing} />
                </div>

                {errors.items && (
                    <div className="text-red-500 text-sm mb-4">{errors.items.message}</div>
                )}

                {/* Action Buttons */}
                <EntryActions
                    onNew={fetchNextId}
                    newDisabled={isSubmitting || !canCreate}
                    onViewAll={() => setIsViewAllOpen(true)}
                    viewAllDisabled={isSubmitting || !canView}
                    onEdit={() => setIsEditing(true)}
                    editDisabled={isSubmitting || isNewMode || isEditing || !canUpdate}
                    saveLoading={isSubmitting}
                    saveDisabled={!isEditing || (isNewMode ? !canCreate : !canUpdate)}
                />
            </form>

            <InfiniteViewAllModal
                isOpen={isViewAllOpen}
                title="All Account Codes"
                endpoint={ACCOUNT_CODES}
                name="account-codes"
                columns={accountCodeColumns}
                onClose={() => setIsViewAllOpen(false)}
                onRowSelect={(item) => {
                    reset(mapAccountCodeToForm(item));
                    setIsNewMode(false);
                    setIsEditing(false);
                    setIsViewAllOpen(false);
                }}
            />
        </section>
    );
}
