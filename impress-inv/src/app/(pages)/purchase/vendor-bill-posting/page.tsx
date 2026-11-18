"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import api from "@/lib/axios";
import { LabeledField } from "@/components/ui/LabeledField";
import { Button } from "@/components/ui/Button";
import { LabeledSelect } from "@/components/ui/LabeledSelect";
import { ViewAllModal, type ViewAllColumn } from "@/components/ui/ViewAllModal";
import useDebounce from "@/hooks/useDebounce";
import { usePermissions } from "@/hooks/usePermissions";
import { vendorBillSchema, type VendorBillFormValues } from "@/lib/validations/master";
import { VENDOR_BILLS } from "@/utlis/apiRoutes";

type BillLine = {
    inventoryId: number;
    itemName: string;
    recQty: number;
    rejQty: number;
    okQty: number;
    rate: number;
};

// What is shown about the inward and the bill, besides the fields the user fills in
type BillDoc = {
    date: string | null;
    purchaseOrderId: number | null;
    vendorName: string;
    grirNo: number | null;
    dcNo: number | null;
    type: string;
    status: "DRAFT" | "APPROVED" | "REJECTED" | "";
    approvedDate: string | null;
    savedStatus: BillDoc["status"]; // the status the bill has in the database (not the one chosen in the dropdown)
    items: BillLine[];
};

type BillRow = {
    id: number;
    inwardId: number;
    date: string;
    purchaseOrderId: number | null;
    vendorName: string;
    billNo: string;
    stInvNo: string;
    status: string;
    inclAmount: number;
    [key: string]: unknown;
};

type InwardRow = {
    id: number;
    date: string;
    purchaseOrderId: number;
    vendorName: string;
    grirNo: number;
    dcNo: number;
    [key: string]: unknown;
};

type ApiError = { response?: { status?: number; data?: { message?: string } } };

const emptyDoc: BillDoc = {
    date: null,
    purchaseOrderId: null,
    vendorName: "",
    grirNo: null,
    dcNo: null,
    type: "",
    status: "",
    approvedDate: null,
    savedStatus: "",
    items: [],
};

const today = () => new Date().toISOString().split("T")[0];
const initialValues: VendorBillFormValues = { id: "", inwardId: "", stInvNo: "", stInvDate: today(), saleTaxPercent: "" };

const fmt = (value: number) => value.toLocaleString();
const fmtDate = (value: string | null) => (value ? new Date(value).toLocaleDateString("en-GB") : "");
const TYPE_LABELS: Record<string, string> = {
    againstPO: "Against PO",
    againstSimple: "Against Simple",
    againstDealarRejection: "Against Dealer Rejection",
};
// The month of the bill: "Mar 2026"
const periodLabel = (date: string) => {
    if (!date) return "";
    const d = new Date(date);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
};
// The same sum the server makes: sales tax of a line = excl amount x rate / 100, rounded
const lineAmounts = (line: BillLine, percent: number) => {
    const excl = line.okQty * line.rate;
    const gst = Math.round((excl * percent) / 100);
    return { excl, gst, incl: excl + gst };
};

const MIN_ROWS = 10;

const STATUS_OPTIONS = [
    { label: "Pending", value: "DRAFT" },
    { label: "Approved", value: "APPROVED" },
    { label: "Rejected", value: "REJECTED" },
];
const STATUS_LABELS: Record<string, string> = { DRAFT: "Pending", APPROVED: "Approved", REJECTED: "Rejected" };

// Vendor Bill Posting: the bill of the vendor for one inward (OK qty x the rate of the PO, plus sales tax).
// Save keeps the bill as a draft, Approve posts it and locks it.
export default function VendorBillPostingPage() {
    const { hasPermission, isSuperAdmin } = usePermissions();
    const canCreate = hasPermission("vendor_bill_posting", "create");
    const canUpdate = hasPermission("vendor_bill_posting", "update");
    const canView = hasPermission("vendor_bill_posting", "view");

    const [isNewMode, setIsNewMode] = useState(true);
    const [isEditing, setIsEditing] = useState(true);
    const [doc, setDoc] = useState<BillDoc>(emptyDoc);
    const [isApproving, setIsApproving] = useState(false);

    const [isIdLoading, setIsIdLoading] = useState(true);
    const [nextId, setNextId] = useState("");
    const skipNextIdLookup = useRef(false);

    const [isInwardPickerOpen, setIsInwardPickerOpen] = useState(false);
    const [inwards, setInwards] = useState<InwardRow[]>([]);
    const [isInwardsLoading, setIsInwardsLoading] = useState(false);
    const [inwardsError, setInwardsError] = useState("");
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);

    const [isViewAllOpen, setIsViewAllOpen] = useState(false);
    const [bills, setBills] = useState<BillRow[]>([]);
    const [isBillsLoading, setIsBillsLoading] = useState(false);
    const [billsError, setBillsError] = useState("");

    const {
        handleSubmit,
        reset,
        setError,
        clearErrors,
        setValue,
        watch,
        formState: { errors, isSubmitting },
    } = useForm<VendorBillFormValues>({ defaultValues: initialValues });
    const values = watch();

    // An error goes away as soon as the user changes that field, it does not stay red until the next Save
    useEffect(() => {
        const subscription = watch((_, { name }) => {
            if (name) clearErrors(name.split(".")[0] as keyof VendorBillFormValues);
        });
        return () => subscription.unsubscribe();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [watch, clearErrors]);

    const percent = Number(values.saleTaxPercent) || 0;
    const totals = doc.items.reduce(
        (sum, line) => {
            const amounts = lineAmounts(line, percent);
            return { excl: sum.excl + amounts.excl, gst: sum.gst + amounts.gst, incl: sum.incl + amounts.incl };
        },
        { excl: 0, gst: 0, incl: 0 }
    );
    const isApproved = doc.status === "APPROVED";
    // An approved (posted) bill is locked: only a Super Admin can change it
    const isLocked = isApproved && !isSuperAdmin;

    const freshForm = (id: string): VendorBillFormValues => ({ ...initialValues, id, stInvDate: today() });

    const fetchNextId = async () => {
        setIsIdLoading(true);
        try {
            const { data } = await api.get(`${VENDOR_BILLS}/next-id`, { params: { _ts: Date.now() } });
            const fetched = String(data.data.nextId);
            setNextId(fetched);
            skipNextIdLookup.current = true;
            reset(freshForm(fetched));
            setDoc(emptyDoc);
            setIsNewMode(true);
            setIsEditing(true);
        } catch (error) {
            console.error("Failed to fetch next Bill Posting No", error);
        } finally {
            setIsIdLoading(false);
        }
    };

    const mapBillToForm = (bill: Record<string, unknown>): VendorBillFormValues => ({
        id: String(bill.id),
        inwardId: String(bill.inwardId),
        stInvNo: String(bill.stInvNo ?? ""),
        stInvDate: bill.stInvDate ? new Date(String(bill.stInvDate)).toISOString().split("T")[0] : today(),
        saleTaxPercent: String(bill.saleTaxPercent ?? ""),
    });

    const mapBillToDoc = (bill: Record<string, unknown>): BillDoc => ({
        date: (bill.date as string) ?? null,
        purchaseOrderId: (bill.purchaseOrderId as number) ?? null,
        vendorName: String(bill.vendorName ?? ""),
        grirNo: (bill.grirNo as number) ?? null,
        dcNo: (bill.dcNo as number) ?? null,
        type: String(bill.type ?? ""),
        status: (bill.status as BillDoc["status"]) ?? "",
        savedStatus: (bill.status as BillDoc["status"]) ?? "",
        approvedDate: (bill.approvedDate as string) ?? null,
        items: ((bill.items as BillLine[]) || []).map((item) => ({
            inventoryId: item.inventoryId,
            itemName: item.itemName,
            recQty: item.recQty,
            rejQty: item.rejQty,
            okQty: item.okQty,
            rate: item.rate,
        })),
    });

    const fetchBills = async (openModal = true, force = false) => {
        if (openModal) setIsViewAllOpen(true);
        if (bills.length > 0 && !force) return;
        setIsBillsLoading(true);
        setBillsError("");
        try {
            const { data } = await api.get(VENDOR_BILLS, { params: { _ts: Date.now() } });
            setBills(data.data || []);
        } catch (error: unknown) {
            setBillsError((error as ApiError).response?.data?.message || "Failed to fetch vendor bills");
        } finally {
            setIsBillsLoading(false);
        }
    };

    useEffect(() => {
        void fetchNextId();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // The inwards that can still get a bill
    const openInwardPicker = async () => {
        if (!isEditing || !isNewMode) return;
        setIsInwardPickerOpen(true);
        setIsInwardsLoading(true);
        setInwardsError("");
        try {
            const { data } = await api.get(`${VENDOR_BILLS}/billable-inwards`, { params: { _ts: Date.now() } });
            setInwards(data.data || []);
        } catch (error: unknown) {
            setInwardsError((error as ApiError).response?.data?.message || "Failed to load the inwards");
        } finally {
            setIsInwardsLoading(false);
        }
    };

    // The inward gives the vendor, the PO and the lines with the PO rate
    const handleInwardSelect = async (inward: InwardRow) => {
        setIsInwardPickerOpen(false);
        setIsPreviewLoading(true);
        try {
            const { data } = await api.get(`${VENDOR_BILLS}/preview`, {
                params: { inwardId: inward.id, saleTaxPercent: percent, _ts: Date.now() },
            });
            const preview = data.data;
            setValue("inwardId", String(inward.id), { shouldDirty: true, shouldValidate: true });
            setDoc({ ...mapBillToDoc({ ...preview, status: "" }), status: "" });
        } catch (error: unknown) {
            toast.error((error as ApiError).response?.data?.message || "Failed to load the inward");
        } finally {
            setIsPreviewLoading(false);
        }
    };

    const showValidationIssues = (issues: { path: PropertyKey[]; message: string }[]) => {
        for (const issue of issues) {
            const field = issue.path[0];
            if (typeof field === "string") {
                setError(field as keyof VendorBillFormValues, { type: "manual", message: issue.message });
            }
        }
        toast.error("Please fix the highlighted fields");
    };

    const onSubmit = async (data: VendorBillFormValues) => {
        clearErrors();
        const result = vendorBillSchema.safeParse(data);
        if (!result.success) {
            showValidationIssues(result.error.issues);
            return;
        }

        const payload = {
            inwardId: Number(data.inwardId),
            stInvNo: data.stInvNo.trim(),
            stInvDate: data.stInvDate,
            saleTaxPercent: Number(data.saleTaxPercent),
            ...(isNewMode ? {} : { status: doc.status || "DRAFT" }),
        };
        if (!isNewMode && doc.status === "APPROVED" && doc.savedStatus !== "APPROVED" && !window.confirm(`Approve bill #${data.id}? It cannot be changed after it is approved.`)) {
            return;
        }
        try {
            const response = isNewMode
                ? await api.post(VENDOR_BILLS, payload)
                : await api.put(`${VENDOR_BILLS}/${data.id}`, payload);
            toast.success(response.data.message || "Vendor bill saved successfully");
            setBills([]);
            // The saved bill stays on the screen, with the amounts the server calculated (the New button starts the
            // next one). Only the next number is read again, quietly.
            const bill = response.data.data;
            reset(mapBillToForm(bill));
            setDoc(mapBillToDoc(bill));
            setIsNewMode(false);
            setIsEditing(false);
            skipNextIdLookup.current = true;
            void api
                .get(`${VENDOR_BILLS}/next-id`, { params: { _ts: Date.now() } })
                .then(({ data }) => setNextId(String(data.data.nextId)))
                .catch(() => {
                    skipNextIdLookup.current = false;
                });
        } catch (error: unknown) {
            toast.error((error as ApiError).response?.data?.message || "Failed to save the vendor bill");
        }
    };

    // Approve = post the bill, it is locked afterwards
    const handleApprove = async () => {
        if (isNewMode || !values.id) return;
        if (!window.confirm(`Approve bill #${values.id}? It cannot be changed after it is approved.`)) return;
        setIsApproving(true);
        try {
            const response = await api.post(`${VENDOR_BILLS}/${values.id}/approve`);
            toast.success(response.data.message || "Vendor bill approved successfully");
            const bill = response.data.data;
            reset(mapBillToForm(bill));
            setDoc(mapBillToDoc(bill));
            setIsEditing(false);
            setBills([]);
        } catch (error: unknown) {
            toast.error((error as ApiError).response?.data?.message || "Failed to approve the vendor bill");
        } finally {
            setIsApproving(false);
        }
    };

    // Typing a Bill Posting No opens that bill
    const debouncedId = useDebounce(values.id, 500);
    useEffect(() => {
        const lookup = async () => {
            if (!debouncedId) return;
            if (skipNextIdLookup.current) {
                skipNextIdLookup.current = false;
                return;
            }
            const resetToNextId = () => {
                reset(freshForm(nextId));
                setDoc(emptyDoc);
                setIsNewMode(true);
                setIsEditing(true);
            };
            if (Number(debouncedId) < 1 || debouncedId === nextId) {
                resetToNextId();
                return;
            }
            if (!canView) {
                toast.error("You do not have permission to view vendor bills.");
                resetToNextId();
                return;
            }
            setIsIdLoading(true);
            try {
                const { data } = await api.get(`${VENDOR_BILLS}/${debouncedId}`, { params: { _ts: Date.now() } });
                reset(mapBillToForm(data.data));
                setDoc(mapBillToDoc(data.data));
                setIsNewMode(false);
                setIsEditing(false);
            } catch (error: unknown) {
                const apiError = error as ApiError;
                toast.error(apiError.response?.status === 404 ? "Vendor bill not found" : apiError.response?.data?.message || "Failed to load the vendor bill");
                resetToNextId();
            } finally {
                setIsIdLoading(false);
            }
        };
        void lookup();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debouncedId, nextId, canView]);

    const billColumns: ViewAllColumn<BillRow>[] = [
        { key: "id", header: "Bill #" },
        { key: "inwardId", header: "QC #" },
        { key: "vendorName", header: "Vendor" },
        { key: "inclAmount", header: "Incl Amt", render: (row) => fmt(row.inclAmount) },
        { key: "status", header: "Status", render: (row) => STATUS_LABELS[row.status] ?? row.status },
    ];
    const inwardColumns: ViewAllColumn<InwardRow>[] = [
        { key: "id", header: "QC #" },
        { key: "date", header: "Date", render: (row) => fmtDate(row.date) },
        { key: "purchaseOrderId", header: "PO #" },
        { key: "vendorName", header: "Vendor" },
        { key: "grirNo", header: "G.R.I.R #" },
        { key: "dcNo", header: "DC #" },
    ];

    const rows = [...doc.items];
    while (rows.length < MIN_ROWS) rows.push(null as unknown as BillLine);

    return (
        <section className="mx-auto mt-10 w-full max-w-5xl bg-form-bg p-6 shadow-sm sm:p-8">
            <div className="relative mb-8">
                <h1 className="text-center text-4xl text-black tracking-wide">Vendor Bill Posting</h1>
                {/* A stamp at the right of the heading once the bill is approved (or rejected) */}
                {(doc.status === "APPROVED" || doc.status === "REJECTED") && (
                    <span
                        aria-label={`Bill status: ${STATUS_LABELS[doc.status]}`}
                        className={`mt-3 inline-block -rotate-6 rounded-md border-4 px-4 py-1 text-xl font-bold uppercase tracking-widest sm:absolute sm:right-0 sm:top-1/2 sm:mt-0 sm:-translate-y-1/2 ${
                            doc.status === "APPROVED" ? "border-primary-600 text-primary-700" : "border-red-500 text-red-600"
                        }`}
                    >
                        {STATUS_LABELS[doc.status]}
                    </span>
                )}
            </div>

            <form
                onSubmit={(event) => {
                    clearErrors();
                    void handleSubmit(onSubmit)(event);
                }}
                noValidate
                className="space-y-4"
            >
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <LabeledField
                        type={isIdLoading ? "text" : "number"}
                        label="Head Code"
                        value={isIdLoading ? "Loading..." : values.id || ""}
                        onChange={(event) => {
                            if (/^\d*$/.test(event.target.value)) setValue("id", event.target.value, { shouldDirty: true });
                        }}
                        inputMode="numeric"
                        disabled={isIdLoading}
                        min={1}
                        max={Number(nextId) || 1}
                    />
                    <LabeledField label="Date" value={fmtDate(doc.date)} readOnly disabled />
                    {/* Click to choose the inward: only inwards against a PO without a bill are listed */}
                    <LabeledField
                        label="QC #"
                        value={values.inwardId}
                        readOnly
                        onClick={() => void openInwardPicker()}
                        onKeyDown={(event) => {
                            if (isEditing && isNewMode && (event.key === "Enter" || event.key === " ")) {
                                event.preventDefault();
                                void openInwardPicker();
                            }
                        }}
                        placeholder={isEditing && isNewMode ? "Click to select" : ""}
                        title={isEditing && isNewMode ? "Click to select the inward" : "The inward of a bill cannot be changed"}
                        error={errors.inwardId?.message}
                        disabled={!isEditing || !isNewMode || isPreviewLoading}
                        className={isEditing && isNewMode ? "cursor-pointer hover:bg-primary-50" : ""}
                    />
                    <LabeledField label="PO #" value={doc.purchaseOrderId ?? ""} readOnly disabled />
                    <LabeledField label="Vendor" value={doc.vendorName} readOnly disabled wrapperClassName="sm:col-span-2" />
                    <LabeledField label="G.I.R.R #" value={doc.grirNo ?? ""} readOnly disabled />
                    <LabeledField label="Type" value={TYPE_LABELS[doc.type] ?? ""} readOnly disabled />
                    <LabeledField label="DC #" value={doc.dcNo ?? ""} readOnly disabled />
                    {/* The number of this bill document (its id): it is not typed */}
                    <LabeledField
                        label="Bill #"
                        value={isIdLoading ? "" : values.id || ""}
                        readOnly
                        disabled
                        title="The number of this bill (it comes automatically)"
                    />
                    <LabeledField
                        label="S.Tax Inv. #"
                        value={values.stInvNo}
                        onChange={(event) => setValue("stInvNo", event.target.value, { shouldDirty: true, shouldValidate: true })}
                        error={errors.stInvNo?.message}
                        disabled={!isEditing}
                        maxLength={50}
                    />
                    <LabeledField
                        type="date"
                        label="S.Tax Inv. Date"
                        max={today()}
                        value={values.stInvDate}
                        onChange={(event) => setValue("stInvDate", event.target.value, { shouldDirty: true, shouldValidate: true })}
                        error={errors.stInvDate?.message}
                        disabled={!isEditing}
                    />
                    <LabeledField
                        label="STax Rate"
                        value={values.saleTaxPercent}
                        onChange={(event) => {
                            if (/^\d{0,3}$/.test(event.target.value)) {
                                setValue("saleTaxPercent", event.target.value, { shouldDirty: true, shouldValidate: true });
                            }
                        }}
                        inputMode="numeric"
                        placeholder="e.g. 18"
                        error={errors.saleTaxPercent?.message}
                        disabled={!isEditing}
                    />
                    <LabeledField label="Period" value={periodLabel(values.stInvDate)} readOnly disabled title="The month of the S.Tax Inv. Date" />
                    {/* The status of the bill. Approved posts it (and locks it), the date of the approval is filled in. */}
                    <LabeledSelect
                        label="Status"
                        options={STATUS_OPTIONS}
                        value={doc.status || "DRAFT"}
                        onChange={(value) => setDoc((current) => ({ ...current, status: value as BillDoc["status"] }))}
                        disabled={!isEditing || isNewMode || isLocked}
                    />
                    <LabeledField label="Approved Date" value={fmtDate(doc.approvedDate)} readOnly disabled />
                </div>

                {/* Items: the table of the other pages */}
                <div className="max-h-100 overflow-y-auto border border-zinc-400 bg-white">
                    <table className="relative w-full table-fixed border-collapse bg-white text-sm text-black">
                        <thead className="sticky top-0 z-10 bg-white">
                            <tr className="border-b border-zinc-400">
                                <th className="w-20 border-r border-zinc-400 px-2 py-1.5 text-center font-medium">Code</th>
                                <th className="border-r border-zinc-400 px-2 py-1.5 text-center font-medium">Item Name</th>
                                <th className="w-24 border-r border-zinc-400 px-2 py-1.5 text-center font-medium">Rec Qty</th>
                                <th className="w-24 border-r border-zinc-400 px-2 py-1.5 text-center font-medium">Rej Qty</th>
                                <th className="w-24 border-r border-zinc-400 px-2 py-1.5 text-center font-medium">OK Qty</th>
                                <th className="w-24 border-r border-zinc-400 px-2 py-1.5 text-center font-medium">PO Rate</th>
                                <th className="w-32 border-r border-zinc-400 px-2 py-1.5 text-center font-medium">Excl. Amount</th>
                                <th className="w-28 border-r border-zinc-400 px-2 py-1.5 text-center font-medium">GST Amt</th>
                                <th className="w-32 px-2 py-1.5 text-center font-medium">Incl Amt</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((line, index) => {
                                const amounts = line ? lineAmounts(line, percent) : null;
                                const cells: [string, boolean][] = [
                                    [line ? String(line.inventoryId) : "", true],
                                    [line?.itemName ?? "", false],
                                    [line ? fmt(line.recQty) : "", true],
                                    [line ? fmt(line.rejQty) : "", true],
                                    [line ? fmt(line.okQty) : "", true],
                                    [line ? fmt(line.rate) : "", true],
                                    [amounts ? fmt(amounts.excl) : "", true],
                                    [amounts ? fmt(amounts.gst) : "", true],
                                    [amounts ? fmt(amounts.incl) : "", true],
                                ];
                                return (
                                    <tr key={index}>
                                        {cells.map(([value, center], column) => (
                                            <td key={column} className={column === cells.length - 1 ? "p-0" : "border-r border-zinc-300 p-0"}>
                                                <input
                                                    type="text"
                                                    value={value}
                                                    readOnly
                                                    tabIndex={-1}
                                                    disabled={!isEditing}
                                                    title={value || undefined}
                                                    className={`w-full truncate bg-transparent px-2 py-1.5 text-[13px] outline-none disabled:bg-[#f3f4f6] ${center ? "text-center" : ""}`}
                                                />
                                            </td>
                                        ))}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-4">
                    <span className="text-sm text-zinc-700">
                        Excl. Amount: <span className="font-semibold text-black">{fmt(totals.excl)}</span>
                    </span>
                    <span className="text-sm text-zinc-700">
                        GST Amt: <span className="font-semibold text-black">{fmt(totals.gst)}</span>
                    </span>
                    <span className="text-sm text-zinc-700">
                        Incl Amt: <span className="font-semibold text-black">{fmt(totals.incl)}</span>
                    </span>
                </div>

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
                        onClick={() => void fetchBills()}
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
                        disabled={isSubmitting || isNewMode || isEditing || isLocked || !canUpdate}
                        title={isLocked ? "An approved bill can only be changed by a Super Admin" : undefined}
                        className="border border-zinc-400 bg-white px-6 hover:bg-zinc-50"
                    >
                        Edit
                    </Button>
                    <Button
                        type="submit"
                        variant="secondary"
                        shape="rounded"
                        isLoading={isSubmitting}
                        disabled={!isEditing || isLocked || (isNewMode ? !canCreate : !canUpdate)}
                        className="border border-zinc-400 bg-white px-8 hover:bg-zinc-50"
                    >
                        Save
                    </Button>
                    <Button
                        type="button"
                        shape="rounded"
                        onClick={() => void handleApprove()}
                        isLoading={isApproving}
                        disabled={isSubmitting || isNewMode || isEditing || isApproved || !canUpdate}
                        title={isNewMode ? "Save the bill first" : isEditing ? "Save the changes first" : "Post the bill (it is locked afterwards)"}
                        className="px-8"
                    >
                        Approve
                    </Button>
                </div>
            </form>

            <ViewAllModal
                key={isInwardPickerOpen ? "inward-open" : "inward-closed"}
                isOpen={isInwardPickerOpen}
                title="Select QC #"
                rows={inwards}
                columns={inwardColumns}
                searchKeys={["id", "purchaseOrderId", "vendorName", "grirNo", "dcNo"]}
                isLoading={isInwardsLoading}
                error={inwardsError || (!isInwardsLoading && inwards.length === 0 ? "No inward is waiting for a bill." : "")}
                onClose={() => setIsInwardPickerOpen(false)}
                onRowSelect={(row) => void handleInwardSelect(row)}
            />

            <ViewAllModal
                key={isViewAllOpen ? "open" : "closed"}
                isOpen={isViewAllOpen}
                title="All Vendor Bills"
                rows={bills}
                columns={billColumns}
                searchKeys={["id", "inwardId", "vendorName", "billNo", "stInvNo"]}
                isLoading={isBillsLoading}
                error={billsError}
                onClose={() => setIsViewAllOpen(false)}
                onRowSelect={(row) => {
                    reset(mapBillToForm(row));
                    setDoc(mapBillToDoc(row));
                    setIsNewMode(false);
                    setIsEditing(false);
                    setIsViewAllOpen(false);
                }}
                onDelete={() => undefined}
            />
        </section>
    );
}
