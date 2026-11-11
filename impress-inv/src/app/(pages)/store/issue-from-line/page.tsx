"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { LabeledField } from "@/components/ui/LabeledField";
import { LabeledSelect } from "@/components/ui/LabeledSelect";
import { Button } from "@/components/ui/Button";
import useDebounce from "@/hooks/useDebounce";
import { storeIssueSchema, type StoreIssueFormValues } from "@/lib/validations/master";
import { STORE_ISSUES, DEPARTMENTS, COLORS } from "@/utlis/apiRoutes";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { ViewAllModal, type ViewAllColumn } from "@/components/ui/ViewAllModal";
import { InventoryPickerModal, type InventoryPickItem } from "@/components/ui/InventoryPickerModal";
import { RowDeleteButton, deletableRowClassName } from "@/components/ui/RowDeleteButton";
import { AddRowButton } from "@/components/ui/AddRowButton";

type Option = { label: string; value: string };

type IssueItemRow = {
    id: number;
    inventoryId: number;
    inventory?: { id: number; itemName: string } | null;
    upm: number;
    handStock: number;
    issueQty: number;
    purpose: string;
};

type StoreIssueRow = {
    id: number; // the Requisition Slip No
    date: string;
    departmentId: number;
    colorId: number;
    department?: { id: number; name: string } | null;
    color?: { id: number; name: string } | null;
    bikeQty: number;
    items?: IssueItemRow[];
    departmentName?: string;
    colorName?: string;
    itemsSummary?: string;
    [key: string]: unknown;
};

type ApiError = {
    response?: {
        status?: number;
        data?: { message?: string };
    };
};

const MIN_ROWS = 10;
const MAX_ROWS = 500;
const padRows = <T,>(rows: T[], makeRow: () => T): T[] => {
    const padded = [...rows];
    while (padded.length < MIN_ROWS) padded.push(makeRow());
    return padded;
};

const defaultRow = () => ({ inventoryId: "", itemName: "", upm: "", handStock: "", issueQty: "", purpose: "" });
const today = () => new Date().toISOString().split("T")[0];

const initialValues: StoreIssueFormValues = {
    id: "",
    date: today(),
    departmentId: "",
    colorId: "",
    bikeQty: "",
    items: Array.from({ length: MIN_ROWS }, defaultRow),
};

// Issue qty of an item = Bike Qty x Upm (units of this item that one bike needs)
const autoIssueQty = (bikeQty: string, upm: string) => {
    const bikes = Number(bikeQty);
    const perBike = Number(upm);
    return bikes > 0 && perBike > 0 ? String(bikes * perBike) : "";
};

// Store Issuance ("Issue from Line"): parts issued from the store to a department for a number of bikes.
// The Requisition Slip No is the automatic id of the slip.
export default function IssueFromLinePage() {
    const [isNewMode, setIsNewMode] = useState(true);
    const [isEditing, setIsEditing] = useState(true);
    const [pickerRowIndex, setPickerRowIndex] = useState<number | null>(null);
    // Problems found in the item rows: which cell of which row is wrong and why
    const [rowErrors, setRowErrors] = useState<Record<number, { field: string; message: string }>>({});

    const [departments, setDepartments] = useState<Option[]>([]);
    const [colors, setColors] = useState<Option[]>([]);
    const [isOptionsLoading, setIsOptionsLoading] = useState(true);

    const { hasPermission } = usePermissions();
    const canCreate = hasPermission("issue_from_line", "create");
    const canUpdate = hasPermission("issue_from_line", "update");
    const canView = hasPermission("issue_from_line", "view");

    const [isIdLoading, setIsIdLoading] = useState(true);
    const [nextId, setNextId] = useState("");
    const [isViewAllOpen, setIsViewAllOpen] = useState(false);
    const [issues, setIssues] = useState<StoreIssueRow[]>([]);
    const [hasLoadedIssues, setHasLoadedIssues] = useState(false);
    const [isIssuesLoading, setIsIssuesLoading] = useState(false);
    const [issuesError, setIssuesError] = useState("");
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
    } = useForm<StoreIssueFormValues>({ defaultValues: initialValues });
    const values = watch();

    const departmentName = departments.find((d) => d.value === values.departmentId)?.label ?? "";

    const freshForm = (id: string): StoreIssueFormValues => ({
        ...initialValues,
        id,
        date: today(),
        items: Array.from({ length: MIN_ROWS }, defaultRow),
    });

    const fetchOptions = async () => {
        const [departmentRes, colorRes] = await Promise.allSettled([api.get(DEPARTMENTS), api.get(COLORS)]);
        if (departmentRes.status === "fulfilled") {
            setDepartments(
                (departmentRes.value.data.data || []).map((d: { id: number; name: string }) => ({
                    label: d.name,
                    value: String(d.id),
                }))
            );
        } else {
            toast.error("Failed to load departments");
        }
        if (colorRes.status === "fulfilled") {
            setColors(
                (colorRes.value.data.data || []).map((c: { id: number; name: string }) => ({
                    label: c.name,
                    value: String(c.id),
                }))
            );
        } else {
            toast.error("Failed to load colors");
        }
        setIsOptionsLoading(false);
    };

    const fetchNextId = async () => {
        setIsIdLoading(true);
        try {
            const { data } = await api.get(`${STORE_ISSUES}/next-id`, { params: { _ts: Date.now() } });
            const fetchedNextId = String(data.data.nextId);
            setNextId(fetchedNextId);
            skipNextIdLookup.current = true;
            reset(freshForm(fetchedNextId));
            setRowErrors({});
            setIsNewMode(true);
            setIsEditing(true);
        } catch (error) {
            console.error("Failed to fetch next Requisition Slip No", error);
        } finally {
            setIsIdLoading(false);
        }
    };

    const mapIssueToForm = (issue: StoreIssueRow): StoreIssueFormValues => ({
        id: String(issue.id),
        date: issue.date ? new Date(issue.date).toISOString().split("T")[0] : today(),
        departmentId: String(issue.departmentId),
        colorId: String(issue.colorId),
        bikeQty: String(issue.bikeQty),
        items: padRows(
            (issue.items || []).map((item) => ({
                inventoryId: String(item.inventoryId),
                itemName: item.inventory?.itemName || `Item #${item.inventoryId}`,
                upm: String(item.upm ?? 0),
                handStock: String(item.handStock ?? 0),
                issueQty: String(item.issueQty ?? ""),
                purpose: item.purpose || "",
            })),
            defaultRow
        ),
    });

    const withListFields = (item: StoreIssueRow): StoreIssueRow => ({
        ...item,
        date: item.date ? new Date(item.date).toISOString().split("T")[0] : "",
        departmentName: item.department?.name || `Department #${item.departmentId}`,
        colorName: item.color?.name || `Color #${item.colorId}`,
        itemsSummary: (item.items || []).map((row) => row.inventory?.itemName).filter(Boolean).join(", "),
    });

    const fetchAllIssues = async (openModal = true, force = false) => {
        if (openModal) setIsViewAllOpen(true);
        if (hasLoadedIssues && !force) return;

        setIsIssuesLoading(true);
        setIssuesError("");
        try {
            const { data } = await api.get(STORE_ISSUES);
            setIssues((data.data || []).map(withListFields));
            setHasLoadedIssues(true);
        } catch (error: unknown) {
            const apiError = error as ApiError;
            setIssuesError(apiError.response?.data?.message || "Failed to fetch issue slips");
        } finally {
            setIsIssuesLoading(false);
        }
    };

    const addIssueToCache = (item: StoreIssueRow) => {
        setIssues((current) => {
            const cached = withListFields(item);
            const existingIndex = current.findIndex((c) => String(c.id) === String(item.id));
            if (existingIndex === -1) return [...current, cached];
            return current.map((c, index) => (index === existingIndex ? cached : c));
        });
        setHasLoadedIssues(true);
    };

    useEffect(() => {
        void fetchNextId();
        void fetchOptions();
        void fetchAllIssues(false);
    }, []);

    // Show every problem of the form: field messages under the fields, row problems on the row itself
    const showValidationIssues = (problems: { path: PropertyKey[]; message: string }[]) => {
        const rows: Record<number, { field: string; message: string }> = {};
        for (const issue of problems) {
            const [field, rowIndex, rowField] = issue.path;
            if (field === "items" && typeof rowIndex === "number") {
                if (!rows[rowIndex]) rows[rowIndex] = { field: String(rowField ?? "inventoryId"), message: issue.message };
            } else if (typeof field === "string") {
                setError(field as keyof StoreIssueFormValues, { type: "manual", message: issue.message });
            }
        }
        setRowErrors(rows);
        toast.error("Please fix the highlighted fields");
        // Bring the first problem into view
        requestAnimationFrame(() =>
            document
                .querySelector('[aria-invalid="true"], [data-row-error="true"]')
                ?.scrollIntoView({ block: "center", behavior: "smooth" })
        );
    };

    const onSubmit = async (data: StoreIssueFormValues) => {
        clearErrors();
        setRowErrors({});
        const validationResult = storeIssueSchema.safeParse(data);
        if (!validationResult.success) {
            showValidationIssues(validationResult.error.issues);
            return;
        }

        const validRows = data.items.filter((row) => row.inventoryId && row.issueQty);
        const payload = {
            date: new Date(data.date).toISOString(),
            departmentId: Number(data.departmentId),
            colorId: Number(data.colorId),
            bikeQty: Number(data.bikeQty),
            items: validRows.map((row) => ({
                inventoryId: Number(row.inventoryId),
                issueQty: Number(row.issueQty),
                purpose: (row.purpose ?? "").trim(),
            })),
        };

        // Issue Qty cannot be more than the hand stock. The server checks this again with the live stock.
        // A saved slip's own quantity is part of its hand stock again, so it is not counted twice.
        const overStock = data.items
            .map((row, index) => ({ row, index }))
            .filter(({ row }) => row.inventoryId && row.issueQty && Number(row.issueQty) > Number(row.handStock || 0));
        if (overStock.length > 0) {
            const rows: Record<number, { field: string; message: string }> = {};
            for (const { row, index } of overStock) {
                rows[index] = {
                    field: "issueQty",
                    message: `Issue Qty (${row.issueQty}) is more than the hand stock (${row.handStock || 0})`,
                };
            }
            setRowErrors(rows);
            const first = overStock[0];
            toast.error(`${first.row.itemName}: Issue Qty (${first.row.issueQty}) is more than the hand stock (${first.row.handStock || 0})`);
            requestAnimationFrame(() =>
                document.querySelector('[data-row-error="true"]')?.scrollIntoView({ block: "center", behavior: "smooth" })
            );
            return;
        }

        try {
            const response = isNewMode
                ? await api.post(STORE_ISSUES, payload)
                : await api.put(`${STORE_ISSUES}/${data.id}`, payload);

            toast.success(response.data.message || "Issue slip saved successfully");
            if (hasLoadedIssues) {
                setHasLoadedIssues(false);
                await fetchAllIssues(false, true);
            }
            refreshNextIdAfterSubmit.current = true;
        } catch (error: unknown) {
            const apiError = error as ApiError;
            console.error("Issue slip save failed:", apiError.response?.data || error);
            toast.error(apiError.response?.data?.message || "Failed to save issue slip");
        }
    };

    useEffect(() => {
        if (!isSubmitting && refreshNextIdAfterSubmit.current) {
            refreshNextIdAfterSubmit.current = false;
            void fetchNextId();
        }
    }, [isSubmitting]);

    const debouncedId = useDebounce(values.id, 500);
    const issueColumns: ViewAllColumn<StoreIssueRow>[] = [
        { key: "id", header: "Slip No" },
        { key: "date", header: "Date" },
        { key: "departmentName", header: "Department" },
        { key: "colorName", header: "Color" },
        { key: "bikeQty", header: "Bike Qty" },
    ];

    useEffect(() => {
        const fetchDebouncedId = async () => {
            if (!debouncedId) return;
            if (skipNextIdLookup.current) {
                skipNextIdLookup.current = false;
                return;
            }

            const resetToNextId = () => {
                reset(freshForm(nextId));
                setRowErrors({});
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
                const cached = issues.find((item) => String(item.id) === debouncedId);
                const issue: StoreIssueRow | undefined = cached || (await api.get(`${STORE_ISSUES}/${debouncedId}`)).data.data;

                if (!issue) {
                    toast.error("Issue slip not found");
                    resetToNextId();
                    return;
                }

                if (!cached) addIssueToCache(issue);
                reset(mapIssueToForm(issue));
                setRowErrors({});
                setIsNewMode(false);
                setIsEditing(false);
            } catch (error: unknown) {
                const apiError = error as ApiError;
                toast.error(
                    apiError.response?.status === 403
                        ? apiError.response?.data?.message || "Access denied. You do not have permission."
                        : "Issue slip not found"
                );
                resetToNextId();
            } finally {
                setIsIdLoading(false);
            }
        };

        void fetchDebouncedId();
    }, [debouncedId, nextId, canView, issues]);

    const updateItemRow = (index: number, field: keyof (typeof initialValues.items)[number], value: string) => {
        setRowErrors({});
        const currentItems = [...values.items];
        let cleanValue = value;
        if (field === "issueQty") {
            if (!currentItems[index].inventoryId) {
                toast.error(`Row ${index + 1}: Select Item Description first`, { id: `row-hint-${index}` });
                return;
            }
            cleanValue = value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
        }
        currentItems[index] = { ...currentItems[index], [field]: cleanValue };
        setValue("items", currentItems, { shouldDirty: true, shouldValidate: true });
    };

    const rowHasData = (row: (typeof values.items)[number]) =>
        !!(row.inventoryId || row.itemName || row.issueQty || row.purpose);

    const removeRow = (index: number) => {
        setRowErrors({});
        const remaining = values.items.filter((_, i) => i !== index);
        setValue("items", padRows(remaining, defaultRow), { shouldDirty: true, shouldValidate: true });
    };

    // Changing Bike Qty updates the Issue Qty of the rows that still have the automatic value
    const handleBikeQtyChange = (rawValue: string) => {
        const nextBikeQty = rawValue.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
        const previousBikeQty = values.bikeQty;
        setRowErrors({});
        setValue("bikeQty", nextBikeQty, { shouldDirty: true, shouldValidate: true });

        const updated = values.items.map((row) => {
            if (!row.inventoryId) return row;
            const wasAutomatic =
                row.issueQty === "" || row.issueQty === autoIssueQty(previousBikeQty ?? "", row.upm ?? "");
            return wasAutomatic ? { ...row, issueQty: autoIssueQty(nextBikeQty, row.upm ?? "") } : row;
        });
        setValue("items", updated, { shouldDirty: true });
    };

    // Changing the department updates the Purpose of the rows that still have the old department name
    const handleDepartmentChange = (departmentId: string) => {
        const nextName = departments.find((d) => d.value === departmentId)?.label ?? "";
        setValue("departmentId", departmentId, { shouldDirty: true, shouldValidate: true });
        const updated = values.items.map((row) =>
            row.inventoryId && (!row.purpose || row.purpose === departmentName) ? { ...row, purpose: nextName } : row
        );
        setValue("items", updated, { shouldDirty: true });
    };

    // A row for an inventory item: Upm from the item, hand stock from its stock, Issue Qty = Bike Qty x Upm
    const buildRow = (item: InventoryPickItem) => {
        const upm = String(item.unitPerBike ?? 0);
        return {
            inventoryId: String(item.id),
            itemName: item.itemName,
            upm,
            handStock: String(item.stock),
            issueQty: autoIssueQty(values.bikeQty ?? "", upm),
            purpose: departmentName,
        };
    };

    const handleItemSelect = (item: InventoryPickItem) => {
        if (pickerRowIndex === null) return;
        setRowErrors({});
        const duplicateIndex = values.items.findIndex(
            (row, i) => i !== pickerRowIndex && row.inventoryId === String(item.id)
        );
        if (duplicateIndex !== -1) {
            toast.error(`"${item.itemName}" is already added in row ${duplicateIndex + 1}`);
            return;
        }
        const currentItems = [...values.items];
        currentItems[pickerRowIndex] = buildRow(item);
        setValue("items", currentItems, { shouldDirty: true, shouldValidate: true });
        setPickerRowIndex(null);
    };

    const totalIssueQty = values.items.reduce((sum, row) => sum + (Number(row.issueQty) || 0), 0);

    const handlePrint = () => {
        if (isNewMode || !values.id) {
            toast.error("Open a saved slip first (enter its number or use View All) to print it");
            return;
        }
        window.open(`/print/store-issue-slip?id=${values.id}`, "_blank");
    };

    return (
        <section className="mx-auto mt-10 w-full max-w-5xl bg-form-bg p-6 shadow-sm sm:p-8">
            <h1 className="mb-8 text-center text-3xl font-medium tracking-wide text-black underline decoration-2 underline-offset-4 sm:text-4xl">
                Store Issuance
            </h1>

            <form
                onSubmit={(event) => {
                    // Clear stale manual errors, otherwise handleSubmit blocks onSubmit forever
                    clearErrors();
                    void handleSubmit(onSubmit)(event);
                }}
                noValidate
                className="space-y-6"
            >
                <div className="grid gap-3 md:grid-cols-2">
                    <LabeledField
                        type={isIdLoading ? "text" : "number"}
                        label="Requisition Slip #"
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
                        label="Requisition Date"
                        value={values.date}
                        onChange={(event) =>
                            setValue("date", event.target.value, { shouldDirty: true, shouldValidate: true })
                        }
                        error={errors.date?.message}
                        disabled={!isEditing}
                    />

                    <LabeledSelect
                        label="Department"
                        options={departments}
                        value={values.departmentId}
                        onChange={handleDepartmentChange}
                        error={errors.departmentId?.message}
                        disabled={!isEditing || isOptionsLoading}
                        placeholder={isOptionsLoading ? "Loading departments..." : "Select Department"}
                    />
                    <LabeledSelect
                        label="Color"
                        options={colors}
                        value={values.colorId}
                        onChange={(value) =>
                            setValue("colorId", value, { shouldDirty: true, shouldValidate: true })
                        }
                        error={errors.colorId?.message}
                        disabled={!isEditing || isOptionsLoading}
                        placeholder={isOptionsLoading ? "Loading colors..." : "Select Color"}
                    />

                    <LabeledField
                        label="Bike Qty"
                        value={values.bikeQty}
                        onChange={(event) => handleBikeQtyChange(event.target.value)}
                        inputMode="numeric"
                        error={errors.bikeQty?.message}
                        disabled={!isEditing}
                        maxLength={7}
                        wrapperClassName="w-40"
                    />
                </div>

                <div className="max-h-100 overflow-y-auto border border-zinc-400 bg-white">
                    <table className="relative w-full table-fixed border-collapse bg-white text-sm text-black">
                        <thead className="sticky top-0 z-10 bg-white">
                            <tr className="border-b border-zinc-400">
                                <th className="w-20 border-r border-zinc-400 px-2 py-1.5 text-center font-medium">Code</th>
                                <th className="border-r border-zinc-400 px-2 py-1.5 text-center font-medium">
                                    Item Description
                                </th>
                                <th className="w-24 border-r border-zinc-400 px-2 py-1.5 text-center font-medium">
                                    Upm Unit
                                </th>
                                <th className="w-28 border-r border-zinc-400 px-2 py-1.5 text-center font-medium">
                                    Hand Stock
                                </th>
                                <th className="w-28 border-r border-zinc-400 px-2 py-1.5 text-center font-medium">
                                    Issue Qty
                                </th>
                                <th className="w-1/4 px-2 py-1.5 text-center font-medium">Purpose</th>
                            </tr>
                        </thead>
                        <tbody>
                            {values.items.map((row, index) => (
                                <tr key={index} className={deletableRowClassName}>
                                    <td className="border-r border-zinc-300 p-0">
                                        <input
                                            type="text"
                                            value={row.inventoryId}
                                            readOnly
                                            tabIndex={-1}
                                            title="Inventory item code (set by selecting Item Description)"
                                            disabled={!isEditing}
                                            className="w-full bg-transparent px-2 py-1.5 text-center text-[13px] outline-none disabled:bg-[#f3f4f6]"
                                        />
                                    </td>
                                    <td className="border-r border-zinc-300 p-0">
                                        <input
                                            type="text"
                                            value={row.itemName}
                                            readOnly
                                            onClick={() => isEditing && setPickerRowIndex(index)}
                                            onKeyDown={(e) => {
                                                if (isEditing && (e.key === "Enter" || e.key === " ")) {
                                                    e.preventDefault();
                                                    setPickerRowIndex(index);
                                                }
                                            }}
                                            placeholder={isEditing ? "Click to select item" : ""}
                                            disabled={!isEditing}
                                            title={isEditing ? "Click to select item from inventory" : undefined}
                                            data-row-error={rowErrors[index]?.field === "inventoryId" ? "true" : undefined}
                                            className={`w-full cursor-pointer truncate bg-transparent px-2 py-1.5 text-[13px] outline-none placeholder:text-zinc-400 hover:bg-primary-50 disabled:cursor-default disabled:bg-[#f3f4f6] ${
                                                rowErrors[index]?.field === "inventoryId" ? "ring-2 ring-inset ring-red-400" : ""
                                            }`}
                                        />
                                    </td>
                                    <td className="border-r border-zinc-300 p-0">
                                        <input
                                            type="text"
                                            value={row.upm ?? ""}
                                            readOnly
                                            tabIndex={-1}
                                            title="Units of this item that one bike needs (from the inventory)"
                                            disabled={!isEditing}
                                            className="w-full bg-transparent px-2 py-1.5 text-center text-[13px] outline-none disabled:bg-[#f3f4f6]"
                                        />
                                    </td>
                                    <td className="border-r border-zinc-300 p-0">
                                        <input
                                            type="text"
                                            value={row.handStock ?? ""}
                                            readOnly
                                            tabIndex={-1}
                                            title="Stock of this item when the slip is issued"
                                            disabled={!isEditing}
                                            className="w-full bg-transparent px-2 py-1.5 text-center text-[13px] outline-none disabled:bg-[#f3f4f6]"
                                        />
                                    </td>
                                    <td className="border-r border-zinc-300 p-0">
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            value={row.issueQty ?? ""}
                                            onChange={(e) => updateItemRow(index, "issueQty", e.target.value)}
                                            disabled={!isEditing}
                                            data-row-error={rowErrors[index]?.field === "issueQty" ? "true" : undefined}
                                            className={`w-full bg-transparent px-2 py-1.5 text-center text-[13px] outline-none disabled:bg-[#f3f4f6] ${
                                                rowErrors[index]?.field === "issueQty" ? "ring-2 ring-inset ring-red-400" : ""
                                            }`}
                                        />
                                    </td>
                                    <td className="relative p-0">
                                        <input
                                            type="text"
                                            value={row.purpose ?? ""}
                                            onChange={(e) => updateItemRow(index, "purpose", e.target.value)}
                                            disabled={!isEditing}
                                            maxLength={100}
                                            title={row.purpose || undefined}
                                            className="w-full truncate bg-transparent px-2 py-1.5 pr-8 text-[13px] outline-none disabled:bg-[#f3f4f6]"
                                        />
                                        {isEditing && rowHasData(row) && (
                                            <RowDeleteButton rowNumber={index + 1} onClick={() => removeRow(index)} />
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-zinc-500">
                        {isEditing ? "Tip: hover a row and click the trash icon to remove it" : ""}
                    </span>
                    <div className="flex items-center gap-4">
                        <span className="text-sm text-zinc-700">
                            Total Issue Qty:{" "}
                            <span className="font-semibold text-black">{totalIssueQty.toLocaleString()}</span>
                        </span>
                        <AddRowButton
                            onClick={() => setValue("items", [...values.items, defaultRow()], { shouldDirty: true })}
                            disabled={!isEditing || values.items.length >= MAX_ROWS}
                        />
                    </div>
                </div>
                {errors.items && <p className="text-center text-xs text-red-500">{errors.items.message}</p>}
                {Object.keys(rowErrors).length > 0 && (
                    <ul className="space-y-0.5 text-center text-xs text-red-500">
                        {Object.entries(rowErrors).map(([index, problem]) => (
                            <li key={index}>
                                Row {Number(index) + 1}: {problem.message}
                            </li>
                        ))}
                    </ul>
                )}

                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
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
                        onClick={() => fetchAllIssues()}
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
                        onClick={handlePrint}
                        disabled={isSubmitting || isNewMode || !canView}
                        title={isNewMode ? "Open a saved slip to print it" : "Print this slip"}
                        className="border border-zinc-400 bg-white px-6 hover:bg-zinc-50"
                    >
                        Print
                    </Button>
                </div>
            </form>

            <InventoryPickerModal
                isOpen={pickerRowIndex !== null}
                title={`Select Item${pickerRowIndex !== null ? ` (Row ${pickerRowIndex + 1})` : ""}`}
                onClose={() => setPickerRowIndex(null)}
                onSelect={handleItemSelect}
            />

            <ViewAllModal
                key={isViewAllOpen ? "open" : "closed"}
                isOpen={isViewAllOpen}
                title="All Store Issuance Slips"
                rows={issues}
                columns={issueColumns}
                searchKeys={["id", "date", "departmentName", "colorName", "itemsSummary"]}
                isLoading={isIssuesLoading}
                error={issuesError}
                onClose={() => setIsViewAllOpen(false)}
                onRowSelect={(item) => {
                    reset(mapIssueToForm(item));
                    setRowErrors({});
                    setIsNewMode(false);
                    setIsEditing(false);
                    setIsViewAllOpen(false);
                }}
                onDelete={() => undefined}
            />
        </section>
    );
}
