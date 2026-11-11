"use client";

import { Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LabeledField } from "@/components/ui/LabeledField";
import { LabeledSelect } from "@/components/ui/LabeledSelect";
import { Button } from "@/components/ui/Button";
import { VENDORS, INVENTORY } from "@/utlis/apiRoutes";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";
import {
    ALL,
    FIELD_LABELS,
    REPORT_RESULT_PATH,
    STATUS_OPTIONS,
    TABS,
    emptyFilters,
    findTab,
    type FieldKey,
    type Filters,
    type Option,
    type TabConfig,
    type TabKey,
} from "@/lib/inwardReport";

// Choose the report and its filters here. "Show Report" opens the report on its own page.
function ReportFilters() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { hasPermission } = usePermissions();
    const canView = hasPermission("inward_quality_control_report", "view");

    // Coming back from the report page ("Change filters") restores the tab and filters it was run with
    const initialTab = (findTab(searchParams.get("tab"))?.key ?? "date") as TabKey;
    const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
    const [filters, setFilters] = useState<Record<TabKey, Filters>>(() => {
        const all: Record<TabKey, Filters> = {
            date: emptyFilters("date"),
            vendor: emptyFilters("vendor"),
            item: emptyFilters("item"),
            po: emptyFilters("po"),
        };
        const restoredTab = findTab(searchParams.get("tab"));
        if (restoredTab) {
            for (const field of restoredTab.fields) {
                const value = searchParams.get(field);
                if (value) all[restoredTab.key][field] = value;
            }
        }
        return all;
    });
    const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});

    const [vendors, setVendors] = useState<Option[]>([]);
    const [items, setItems] = useState<Option[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isOpening, setIsOpening] = useState(false);

    useEffect(() => {
        const fetchOptions = async () => {
            const [vendorRes, inventoryRes] = await Promise.allSettled([api.get(VENDORS), api.get(INVENTORY)]);

            if (vendorRes.status === "fulfilled") {
                setVendors(
                    (vendorRes.value.data.data || []).map((v: { id: number; vendorName?: string; name?: string }) => ({
                        label: v.vendorName || v.name || `Vendor #${v.id}`,
                        value: String(v.id),
                    }))
                );
            } else {
                toast.error("Failed to load vendors");
            }

            if (inventoryRes.status === "fulfilled") {
                const names: string[] = Array.from(
                    new Set((inventoryRes.value.data.data || []).map((item: { itemName: string }) => item.itemName))
                );
                setItems(names.map((name) => ({ label: name, value: name })));
            } else {
                toast.error("Failed to load items");
            }

            setIsLoading(false);
        };

        void fetchOptions();
    }, []);

    const tab = TABS.find((t) => t.key === activeTab) as TabConfig;
    const current = filters[activeTab];

    const setField = (field: FieldKey, value: string) => {
        setFilters((all) => ({ ...all, [activeTab]: { ...all[activeTab], [field]: value } }));
        setErrors((existing) => ({ ...existing, [field]: undefined }));
    };

    const changeTab = (key: TabKey) => {
        setActiveTab(key);
        setErrors({});
    };

    const validate = () => {
        const found: Partial<Record<FieldKey, string>> = {};
        for (const field of tab.required) {
            if (!current[field] || current[field] === ALL) found[field] = `${FIELD_LABELS[field]} is required`;
        }
        if (current.fromDate && current.toDate && current.fromDate > current.toDate) {
            found.toDate = "To Date cannot be before From Date";
        }
        setErrors(found);
        return Object.keys(found).length === 0;
    };

    const handleSubmit = (event: FormEvent) => {
        event.preventDefault();
        if (!canView) return;
        if (!validate()) {
            toast.error("Please fix the highlighted fields");
            return;
        }

        // The filters travel in the address, so the report page can be refreshed, bookmarked or shared
        const params = new URLSearchParams({ tab: activeTab });
        for (const field of tab.fields) {
            const value = current[field];
            if (value && value !== ALL) params.set(field, value);
        }
        setIsOpening(true);
        router.push(`${REPORT_RESULT_PATH}?${params.toString()}`);
    };

    const resetTab = () => {
        setFilters((all) => ({ ...all, [activeTab]: emptyFilters(activeTab) }));
        setErrors({});
    };

    // Plain-language summary of the filters
    const summary = useMemo(() => {
        const parts: string[] = [];
        for (const field of tab.fields) {
            const value = current[field];
            if (!value || value === ALL) continue;
            if (field === "vendorId") parts.push(`Vendor: ${vendors.find((v) => v.value === value)?.label ?? value}`);
            else if (field === "itemName") parts.push(`Item: ${value}`);
            else if (field === "status") parts.push(value === "ok" ? "OK rows only" : "Rejected rows only");
            else if (field === "fromDate") parts.push(`From ${value}`);
            else if (field === "toDate") parts.push(`To ${value}`);
        }
        return parts;
    }, [tab, current, vendors]);

    const renderField = (field: FieldKey) => {
        const error = errors[field];
        switch (field) {
            case "fromDate":
            case "toDate":
                return (
                    <LabeledField
                        key={field}
                        type="date"
                        label={FIELD_LABELS[field]}
                        value={current[field]}
                        onChange={(event) => setField(field, event.target.value)}
                        error={error}
                        max={field === "fromDate" ? current.toDate || undefined : undefined}
                        min={field === "toDate" ? current.fromDate || undefined : undefined}
                    />
                );
            case "vendorId":
                return (
                    <LabeledSelect
                        key={field}
                        label={tab.required.includes(field) ? "Vendor *" : "Vendor (optional)"}
                        options={tab.required.includes(field) ? vendors : [{ label: "All vendors", value: ALL }, ...vendors]}
                        value={current.vendorId}
                        onChange={(value) => setField("vendorId", value)}
                        error={error}
                        disabled={isLoading}
                        placeholder={isLoading ? "Loading vendors..." : "Select Vendor"}
                    />
                );
            case "itemName":
                return (
                    <LabeledSelect
                        key={field}
                        label={tab.required.includes(field) ? "Item *" : "Item (optional)"}
                        options={tab.required.includes(field) ? items : [{ label: "All items", value: ALL }, ...items]}
                        value={current.itemName}
                        onChange={(value) => setField("itemName", value)}
                        error={error}
                        disabled={isLoading}
                        placeholder={isLoading ? "Loading items..." : "Select Item"}
                    />
                );
            case "status":
                return (
                    <LabeledSelect
                        key={field}
                        label={FIELD_LABELS.status}
                        options={STATUS_OPTIONS}
                        value={current.status}
                        onChange={(value) => setField("status", value)}
                    />
                );
        }
    };

    return (
        <section className="mx-auto mt-10 w-full max-w-2xl bg-form-bg p-6 shadow-xl sm:p-8">
            <h1 className="mb-6 text-center text-2xl font-bold text-zinc-900 sm:text-3xl">
                Inward Quality Control Report
            </h1>

            {/* One tab per report: pick the report first, then fill only its fields */}
            <div role="tablist" aria-label="Report type" className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {TABS.map((t) => (
                    <button
                        key={t.key}
                        type="button"
                        role="tab"
                        aria-selected={t.key === activeTab}
                        onClick={() => changeTab(t.key)}
                        className={cn(
                            "rounded-md border px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/30",
                            t.key === activeTab
                                ? "border-primary-500 bg-primary-500 text-white"
                                : "border-zinc-300 bg-white text-zinc-700 hover:bg-primary-50"
                        )}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            <form onSubmit={handleSubmit} noValidate>
                <p className="mb-4 text-sm text-zinc-600">{tab.description}</p>

                <div className="grid gap-3 sm:grid-cols-2">
                    {tab.fields.map((field) => (
                        <div key={field} className={cn(field === "status" && tab.fields.length % 2 === 1 && "sm:col-span-2")}>
                            {renderField(field)}
                        </div>
                    ))}
                </div>

                <div className="mt-5 rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600">
                    <span className="font-semibold text-zinc-800">{tab.label} report</span>
                    {summary.length > 0 ? ` · ${summary.join(" · ")}` : " · all records"}
                </div>

                <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
                    <Button
                        type="submit"
                        shape="rounded"
                        isLoading={isOpening}
                        disabled={!canView || isLoading}
                        className="px-10"
                    >
                        Show Report
                    </Button>
                    <Button
                        type="button"
                        variant="secondary"
                        shape="rounded"
                        onClick={resetTab}
                        className="border border-zinc-400 bg-white px-8 hover:bg-zinc-50"
                    >
                        Clear Filters
                    </Button>
                </div>

                {!canView && (
                    <p className="mt-4 text-center text-xs text-red-500">
                        You do not have permission to view this report.
                    </p>
                )}
            </form>
        </section>
    );
}

export default function InwardQualityControlReportPage() {
    return (
        <Suspense fallback={null}>
            <ReportFilters />
        </Suspense>
    );
}
