"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { LabeledField } from "@/components/ui/LabeledField";
import { LabeledSelect } from "@/components/ui/LabeledSelect";
import { Button } from "@/components/ui/Button";
import useDebounce from "@/hooks/useDebounce";
import {
    rejectionReturnToVendorSchema,
    type RejectionReturnToVendorFormValues,
} from "@/lib/validations/master";
import { REJECTION_RETURN_TO_VENDOR, VENDORS } from "@/utlis/apiRoutes";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { ViewAllModal, type ViewAllColumn } from "@/components/ui/ViewAllModal";

type RejectionReturnRow = {
    id: number;
    claimNoteId?: number;
    date: string;
    vendorName: string;
    address: string;
    contactNo: string;
    saleTaxNo: string;
    transport: string;
    builtyNo: string;
    bookNo: string;
    receivedBy: string;
    itemName?: string[];
    rej?: number[];
    report?: string[];
    [key: string]: unknown;
};

type ApiError = {
    response?: {
        status?: number;
        data?: { message?: string };
    };
};

const defaultRow = () => ({ itemName: "", rej: "", report: "" });

const initialValues: RejectionReturnToVendorFormValues = {
    id: "",
    date: new Date().toISOString().split("T")[0],
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
    const [isNewMode, setIsNewMode] = useState(true);
    const [isEditing, setIsEditing] = useState(true);

    const { hasPermission } = usePermissions();
    const canCreate = hasPermission("rejection-return", "create") || true;
    const canUpdate = hasPermission("rejection-return", "update") || true;
    const canView = hasPermission("rejection-return", "view") || true;

    const [isIdLoading, setIsIdLoading] = useState(true);
    const [nextId, setNextId] = useState<string>("");
    const [vendors, setVendors] = useState<{ label: string; value: string }[]>([]);
    const [isVendorsLoading, setIsVendorsLoading] = useState(true);

    const [isViewAllOpen, setIsViewAllOpen] = useState(false);
    const [rejectionReturns, setRejectionReturns] = useState<RejectionReturnRow[]>([]);
    const [hasLoadedRejectionReturns, setHasLoadedRejectionReturns] = useState(false);
    const [isRejectionReturnsLoading, setIsRejectionReturnsLoading] = useState(false);
    const [rejectionReturnsError, setRejectionReturnsError] = useState("");
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
    } = useForm<RejectionReturnToVendorFormValues>({ defaultValues: initialValues });
    const values = watch();

    const fetchVendors = async () => {
        setIsVendorsLoading(true);
        try {
            const res = await api.get(VENDORS);
            setVendors(
                (res.data?.data || []).map((v: any) => ({
                    label: v.vendorName || v.name,
                    value: v.vendorName || v.name,
                }))
            );
        } catch (err) {
            console.error("Failed to fetch vendors", err);
        } finally {
            setIsVendorsLoading(false);
        }
    };

    const fetchNextId = async () => {
        setIsIdLoading(true);
        try {
            const { data } = await api.get(`${REJECTION_RETURN_TO_VENDOR}/next-id`, {
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

    const mapRejectionReturnToForm = (s: any): RejectionReturnToVendorFormValues => {
        const fetchedRows = (s.itemName || []).map((name: string, i: number) => ({
            itemName: name || "",
            rej: s.rej?.[i] !== undefined && s.rej?.[i] !== null ? String(s.rej[i]) : "",
            report: s.report?.[i] || "",
        }));

        while (fetchedRows.length < 10) fetchedRows.push(defaultRow());

        return {
            id: String(s.id),
            date: s.date ? new Date(s.date).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
            vendorName: s.vendorName || "",
            address: s.address || "",
            contactNo: s.contactNo || "",
            saleTaxNo: s.saleTaxNo || "",
            transport: s.transport || "",
            builtyNo: s.builtyNo || "",
            bookNo: s.bookNo || "",
            receivedBy: s.receivedBy || "",
            items: fetchedRows,
        };
    };

    const fetchAllRejectionReturns = async (openModal = true, force = false) => {
        if (openModal) setIsViewAllOpen(true);
        if (hasLoadedRejectionReturns && !force) return;

        setIsRejectionReturnsLoading(true);
        setRejectionReturnsError("");
        try {
            const { data } = await api.get(REJECTION_RETURN_TO_VENDOR);
            setRejectionReturns(
                (data.data || []).map((item: RejectionReturnRow) => ({
                    ...item,
                    date: item.date ? new Date(item.date).toISOString().split("T")[0] : "",
                }))
            );
            setHasLoadedRejectionReturns(true);
        } catch (error: unknown) {
            const apiError = error as ApiError;
            setRejectionReturnsError(apiError.response?.data?.message || "Failed to fetch Rejection Returns");
        } finally {
            setIsRejectionReturnsLoading(false);
        }
    };

    const addRejectionReturnToCache = (item: RejectionReturnRow) => {
        setRejectionReturns((current) => {
            const cachedItem = {
                ...item,
                date: item.date ? new Date(item.date).toISOString().split("T")[0] : "",
            };
            const existingIndex = current.findIndex(
                (c) => String(c.id) === String(item.id)
            );
            if (existingIndex === -1) return [...current, cachedItem];
            return current.map((c, index) => (index === existingIndex ? cachedItem : c));
        });
        setHasLoadedRejectionReturns(true);
    };

    useEffect(() => {
        void fetchNextId();
        void fetchVendors();
        void fetchAllRejectionReturns(false);
    }, []);

    const onSubmit = async (data: RejectionReturnToVendorFormValues) => {
        const validationResult = rejectionReturnToVendorSchema.safeParse(data);
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

        const validRows = data.items.filter((r) => r.itemName || r.rej || r.report);
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
            itemName: validRows.map((r) => r.itemName),
            rej: validRows.map((r) => Number(r.rej)),
            report: validRows.map((r) => r.report),
        };

        try {
            const response = isNewMode
                ? await api.post(REJECTION_RETURN_TO_VENDOR, payload)
                : await api.put(`${REJECTION_RETURN_TO_VENDOR}/${data.id}`, payload);

            toast.success(response.data.message || "Rejection Return saved successfully");
            if (hasLoadedRejectionReturns) {
                setHasLoadedRejectionReturns(false);
                await fetchAllRejectionReturns(false, true);
            }
            refreshNextIdAfterSubmit.current = true;
        } catch (error: unknown) {
            const apiError = error as ApiError;
            console.error("Rejection Return save failed:", apiError.response?.data || error);
            toast.error(apiError.response?.data?.message || "Failed to save Rejection Return");
        }
    };

    useEffect(() => {
        if (!isSubmitting && refreshNextIdAfterSubmit.current) {
            refreshNextIdAfterSubmit.current = false;
            void fetchNextId();
        }
    }, [isSubmitting]);

    const debouncedId = useDebounce(values.id, 500);
    const rejectionColumns: ViewAllColumn<RejectionReturnRow>[] = [
        { key: "id", header: "Return ID" },
        { key: "date", header: "Date" },
        { key: "vendorName", header: "Vendor" },
        { key: "builtyNo", header: "Builty No" },
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
                const cached = rejectionReturns.find((item) => String(item.id) === debouncedId);
                const s = cached || (await api.get(`${REJECTION_RETURN_TO_VENDOR}/${debouncedId}`)).data.data;

                if (!s) {
                    toast.error("Rejection Return not found");
                    resetToNextId();
                    return;
                }

                if (!cached) addRejectionReturnToCache(s);
                reset(mapRejectionReturnToForm(s));
                setIsNewMode(false);
                setIsEditing(false);
                toast.success("Rejection Return found");
            } catch (error: unknown) {
                const apiError = error as ApiError;
                toast.error(
                    apiError.response?.status === 403
                        ? apiError.response?.data?.message || "Access denied. You do not have permission."
                        : "Rejection Return not found"
                );
                resetToNextId();
            } finally {
                setIsIdLoading(false);
            }
        };

        void fetchDebouncedId();
    }, [debouncedId, nextId, canView, rejectionReturns]);

    const updateItemRow = (index: number, field: keyof typeof initialValues.items[0], value: string) => {
        const currentItems = [...values.items];
        currentItems[index] = { ...currentItems[index], [field]: value };
        setValue("items", currentItems, { shouldDirty: true, shouldValidate: true });
    };

    const isRowDisabled = (index: number) => {
        if (!isEditing) return true;
        if (index === 0) return false;
        const prevRow = values.items[index - 1];
        return !(prevRow?.itemName && prevRow?.rej && prevRow?.report);
    };

    const addRow = () => {
        setValue("items", [...values.items, defaultRow()], { shouldDirty: true, shouldValidate: true });
    };

    const canAddRow =
        values.items.length > 0 &&
        values.items.every((r) => r.itemName && r.rej && r.report);

    return (
        <section className="mx-auto mt-10 w-full max-w-5xl bg-form-bg p-8 shadow-sm">
            <h1 className="mb-10 text-center text-4xl font-medium text-black tracking-wide">
                Rejection Return To Vendor
            </h1>

            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    <LabeledField
                        type={isIdLoading ? "text" : "number"}
                        label="Claim Note No"
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

                    <LabeledSelect
                        label="Vendor Name"
                        options={vendors}
                        value={values.vendorName}
                        onChange={(val) =>
                            setValue("vendorName", val, {
                                shouldDirty: true,
                                shouldValidate: true,
                            })
                        }
                        error={errors.vendorName?.message}
                        disabled={!isEditing || isVendorsLoading}
                        placeholder={isVendorsLoading ? "Loading..." : "Select Vendor"}
                    />

                    <LabeledField
                        label="Address"
                        value={values.address}
                        onChange={(e) =>
                            setValue("address", e.target.value, {
                                shouldDirty: true,
                                shouldValidate: true,
                            })
                        }
                        error={errors.address?.message}
                        disabled={!isEditing}
                    />

                    <LabeledField
                        label="Contact No"
                        value={values.contactNo}
                        onChange={(e) =>
                            setValue("contactNo", e.target.value, {
                                shouldDirty: true,
                                shouldValidate: true,
                            })
                        }
                        error={errors.contactNo?.message}
                        disabled={!isEditing}
                    />

                    <LabeledField
                        label="Sale Tax No"
                        value={values.saleTaxNo}
                        onChange={(e) =>
                            setValue("saleTaxNo", e.target.value, {
                                shouldDirty: true,
                                shouldValidate: true,
                            })
                        }
                        error={errors.saleTaxNo?.message}
                        disabled={!isEditing}
                    />

                    <LabeledField
                        label="Transport"
                        value={values.transport}
                        onChange={(e) =>
                            setValue("transport", e.target.value, {
                                shouldDirty: true,
                                shouldValidate: true,
                            })
                        }
                        error={errors.transport?.message}
                        disabled={!isEditing}
                    />

                    <LabeledField
                        label="Builty No"
                        value={values.builtyNo}
                        onChange={(e) =>
                            setValue("builtyNo", e.target.value, {
                                shouldDirty: true,
                                shouldValidate: true,
                            })
                        }
                        error={errors.builtyNo?.message}
                        disabled={!isEditing}
                    />

                    <LabeledField
                        label="Book No"
                        value={values.bookNo}
                        onChange={(e) =>
                            setValue("bookNo", e.target.value, {
                                shouldDirty: true,
                                shouldValidate: true,
                            })
                        }
                        error={errors.bookNo?.message}
                        disabled={!isEditing}
                    />

                    <LabeledField
                        label="Received By"
                        value={values.receivedBy}
                        onChange={(e) =>
                            setValue("receivedBy", e.target.value, {
                                shouldDirty: true,
                                shouldValidate: true,
                            })
                        }
                        error={errors.receivedBy?.message}
                        disabled={!isEditing}
                    />
                </div>

                <div className="max-h-[400px] overflow-y-auto border border-zinc-400 bg-white">
                    <table className="w-full border-collapse text-sm text-black relative bg-white">
                        <thead className="sticky top-0 z-10 bg-white">
                            <tr className="border-b border-zinc-400">
                                <th className="border-r border-zinc-400 px-2 py-1.5 text-center font-medium w-3/6">
                                    Item Name
                                </th>
                                <th className="border-r border-zinc-400 px-2 py-1.5 text-center font-medium w-1/6">
                                    Rej
                                </th>
                                <th className="px-2 py-1.5 text-center font-medium w-2/6">
                                    Report
                                </th>
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
                        onClick={() => fetchAllRejectionReturns()}
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
                title="All Rejection Returns"
                rows={rejectionReturns}
                columns={rejectionColumns}
                searchKeys={["id", "date", "vendorName", "builtyNo"]}
                isLoading={isRejectionReturnsLoading}
                error={rejectionReturnsError}
                onClose={() => setIsViewAllOpen(false)}
                onRowSelect={(item) => {
                    reset(mapRejectionReturnToForm(item));
                    setIsNewMode(false);
                    setIsEditing(false);
                    setIsViewAllOpen(false);
                }}
                onDelete={() => undefined}
            />
        </section>
    );
}
