"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { LabeledField } from "@/components/ui/LabeledField";
import { LabeledSelect } from "@/components/ui/LabeledSelect";
import { PriceField } from "@/components/ui/PriceField";
import { Button } from "@/components/ui/Button";
import useDebounce from "@/hooks/useDebounce";
import { vendorSchema, type VendorFormValues } from "@/lib/validations/master";
import { VENDORS, CITIES, PROVINCES } from "@/utlis/apiRoutes";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import { usePermissions } from "@/hooks/usePermissions";
import type { ViewAllColumn } from "@/components/ui/ViewAllModal";
import { InfiniteViewAllModal, useRefreshMasterList } from "@/components/ui/InfiniteViewAllModal";
import { EntryActions } from "@/components/ui/EntryActions";
import { useMasterRecord } from "@/hooks/useMasterRecord";
import { PrintOptionsModal } from "@/components/print/PrintOptionsModal";

type VendorRow = {
    id: number;
    vendorName: string;
    address: string;
    provinceId: number;
    cityId: number;
    contactNo: string;
    saleTaxNo: string;
    NICNo: string;
    mobileNo: string;
    daysLimit: number;
    amoutLimit: number;
    NTNNo: string;
    openingBalance: number;
    CNICNo: string;
    cityName?: string;
    provinceName?: string;
    city?: { name: string };
    province?: { name: string };
};

type ApiError = {
    response?: {
        status?: number;
        data?: { message?: string };
    };
};

const initialValues: VendorFormValues = {
    id: "",
    vendorName: "",
    address: "",
    provinceId: "",
    cityId: "",
    contactNo: "",
    saleTaxNo: "",
    NICNo: "",
    mobileNo: "",
    daysLimit: "",
    amoutLimit: "",
    NTNNo: "",
    openingBalance: "",
    CNICNo: "",
};

const formatCNIC = (val: string) => {
    const raw = val.replace(/\D/g, "").slice(0, 13);
    if (raw.length <= 5) return raw;
    if (raw.length <= 12) return `${raw.slice(0, 5)}-${raw.slice(5)}`;
    return `${raw.slice(0, 5)}-${raw.slice(5, 12)}-${raw.slice(12)}`;
};

export default function VendorPage() {
    const [isNewMode, setIsNewMode] = useState(true);
    const [isPrintOpen, setIsPrintOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(true);
    const [provinces, setProvinces] = useState<{ label: string; value: string }[]>([]);
    const [cities, setCities] = useState<{ label: string; value: string }[]>([]);
    const [isProvincesLoading, setIsProvincesLoading] = useState(true);
    const [isCitiesLoading, setIsCitiesLoading] = useState(false);

    const { hasPermission } = usePermissions();
    const canCreate = hasPermission("vendor", "create");
    const canUpdate = hasPermission("vendor", "update");
    const canView = hasPermission("vendor", "view");

    const [isIdLoading, setIsIdLoading] = useState(true);
    const [nextId, setNextId] = useState("");
    const [isViewAllOpen, setIsViewAllOpen] = useState(false);
    const refreshList = useRefreshMasterList("vendors");
    const { fetchOne, prefetchNear } = useMasterRecord("vendors", VENDORS);
    const [vendors, setVendors] = useState<VendorRow[]>([]);
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
    } = useForm<VendorFormValues>({ defaultValues: initialValues });
    const values = watch();

    // An error goes away as soon as the user changes that field, it does not stay red until the next Save
    useEffect(() => {
        const subscription = watch((_, { name }) => {
            if (name) clearErrors(name.split(".")[0] as keyof VendorFormValues);
        });
        return () => subscription.unsubscribe();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [watch, clearErrors]);

    const fetchProvinces = async () => {
        setIsProvincesLoading(true);
        try {
            const { data } = await api.get(PROVINCES);
            setProvinces(
                (data.data || []).map((p: { id: number; name: string }) => ({
                    label: p.name,
                    value: String(p.id),
                }))
            );
        } catch (error) {
            console.error("Failed to fetch provinces", error);
            toast.error("Failed to load provinces");
        } finally {
            setIsProvincesLoading(false);
        }
    };

    const fetchCitiesByProvince = async (provinceId: string) => {
        if (!provinceId) {
            setCities([]);
            return;
        }
        setIsCitiesLoading(true);
        try {
            const { data } = await api.get(`${CITIES}/province/${provinceId}`);
            setCities(
                (data.data || []).map((c: { city?: { id: number; name: string }; id?: number; name?: string }) => {
                    const id = c.city?.id ?? c.id;
                    const name = c.city?.name ?? c.name ?? "";
                    return { label: name, value: String(id) };
                })
            );
        } catch (error) {
            console.error("Failed to fetch cities", error);
            toast.error("Failed to load cities");
        } finally {
            setIsCitiesLoading(false);
        }
    };

    const fetchNextId = async () => {
        setIsIdLoading(true);
        try {
            const { data } = await api.get(`${VENDORS}/next-id`, {
                params: { _ts: Date.now() },
            });
            const fetchedNextId = String(data.data.nextId);
            setNextId(fetchedNextId);
            skipNextIdLookup.current = Date.now();
            reset({ ...initialValues, id: fetchedNextId });
            setCities([]);
            setIsNewMode(true);
            setIsEditing(true);
        } catch (error) {
            console.error("Failed to fetch next vendor ID", error);
        } finally {
            setIsIdLoading(false);
        }
    };

    const addVendorToCache = (vendor: VendorRow) => {
        setVendors((current) => {
            const cityName = vendor.city?.name || vendor.cityName || `City #${vendor.cityId}`;
            const provinceName = vendor.province?.name || vendor.provinceName || `Province #${vendor.provinceId}`;
            const cached: VendorRow = { ...vendor, cityName, provinceName };
            const existingIndex = current.findIndex(
                (item) => String(item.id) === String(vendor.id)
            );
            if (existingIndex === -1) return [...current, cached];
            return current.map((item, index) =>
                index === existingIndex ? cached : item
            );
        });
    };

    useEffect(() => {
        void fetchNextId();
        void fetchProvinces();
    }, []);

    const handleProvinceChange = (provinceId: string) => {
        setValue("provinceId", provinceId, { shouldDirty: true, shouldValidate: true });
        setValue("cityId", "", { shouldDirty: true });
        void fetchCitiesByProvince(provinceId);
    };

    const onSubmit = async (data: VendorFormValues) => {
        const validationResult = vendorSchema.safeParse(data);
        if (!validationResult.success) {
            clearErrors();
            validationResult.error.issues.forEach((issue) => {
                const field = issue.path[0];
                if (typeof field === "string") {
                    setError(field as keyof VendorFormValues, {
                        type: "manual",
                        message: issue.message,
                    });
                }
            });
            return;
        }

        const payload = {
            vendorName: validationResult.data.vendorName.trim(),
            address: validationResult.data.address.trim(),
            provinceId: Number(validationResult.data.provinceId),
            cityId: Number(validationResult.data.cityId),
            contactNo: validationResult.data.contactNo.trim(),
            saleTaxNo: validationResult.data.saleTaxNo.trim(),
            NICNo: validationResult.data.NICNo.trim(),
            mobileNo: validationResult.data.mobileNo.trim(),
            daysLimit: Number(validationResult.data.daysLimit),
            amoutLimit: Number(validationResult.data.amoutLimit),
            NTNNo: validationResult.data.NTNNo.trim(),
            openingBalance: Number(validationResult.data.openingBalance),
            CNICNo: validationResult.data.CNICNo.trim(),
        };

        try {
            const response = isNewMode
                ? await api.post(VENDORS, payload)
                : await api.put(`${VENDORS}/${validationResult.data.id}`, payload);

            toast.success(response.data.message || "Vendor saved successfully");
            setVendors([]); // the looked-up copies are old now
            void refreshList();
            // This page has a Print button: after Save the record stays on the screen (it does not jump to the next new
            // record). Only the next number is read again, quietly, so a new record still gets the right number.
            setIsNewMode(false);
            setIsEditing(false);
            skipNextIdLookup.current = Date.now();
            void api
                .get(`${VENDORS}/next-id`, { params: { _ts: Date.now() } })
                .then(({ data }) => setNextId(String(data.data.nextId)))
                .catch(() => { skipNextIdLookup.current = 0; });
        } catch (error: unknown) {
            const apiError = error as ApiError;
            console.error("Vendor save failed:", apiError.response?.data || error);
            toast.error(apiError.response?.data?.message || "Failed to save vendor");
        }
    };

    const debouncedId = useDebounce(values.id, 500);
    const vendorColumns: ViewAllColumn<VendorRow>[] = [
        { key: "id", header: "Vendor ID" },
        { key: "vendorName", header: "Vendor Name" },
        { key: "contactNo", header: "Contact" },
        { key: "cityName", header: "City" },
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
                reset({ ...initialValues, id: nextId });
                setCities([]);
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
                const cached = vendors.find((v) => String(v.id) === debouncedId);
                const vendor: VendorRow = cached || (await fetchOne(debouncedId));
                prefetchNear(debouncedId, Number(nextId));

                if (!vendor) {
                    toast.error("Vendor not found");
                    resetToNextId();
                    return;
                }

                if (!cached) addVendorToCache(vendor);

                const provinceIdStr = String(vendor.provinceId);
                await fetchCitiesByProvince(provinceIdStr);

                reset({
                    id: String(vendor.id),
                    vendorName: vendor.vendorName || "",
                    address: vendor.address || "",
                    provinceId: provinceIdStr,
                    cityId: String(vendor.cityId),
                    contactNo: vendor.contactNo || "",
                    saleTaxNo: vendor.saleTaxNo || "",
                    NICNo: vendor.NICNo || "",
                    mobileNo: vendor.mobileNo || "",
                    daysLimit: String(vendor.daysLimit ?? 0),
                    amoutLimit: String(vendor.amoutLimit ?? 0),
                    NTNNo: vendor.NTNNo || "",
                    openingBalance: String(vendor.openingBalance ?? 0),
                    CNICNo: vendor.CNICNo || "",
                });
                setIsNewMode(false);
                setIsEditing(false);
            } catch (error: unknown) {
                const apiError = error as ApiError;
                toast.error(
                    apiError.response?.status === 403
                        ? apiError.response?.data?.message || "Access denied. You do not have permission."
                        : "Invalid Vendor ID"
                );
                resetToNextId();
            } finally {
                setIsIdLoading(false);
            }
        };

        void fetchDebouncedId();
    }, [debouncedId, nextId, canView, vendors]);

    return (
        <section className="mx-auto mt-10 w-full max-w-4xl bg-form-bg p-6 shadow-xl sm:p-8">
            <h1 className="mb-6 text-center text-2xl font-bold text-zinc-900 sm:text-3xl">
                Vendor Profile
            </h1>

            <form
                onSubmit={(event) => {
                    // Clear stale manual errors, otherwise handleSubmit blocks onSubmit forever
                    clearErrors();
                    void handleSubmit(onSubmit)(event);
                }}
                noValidate
                className="space-y-3"
            >
                <div className="grid gap-3 md:grid-cols-2">
                    <LabeledField
                        type="number"
                        label="Vendor ID"
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
                        error={errors.id?.message}
                        wrapperClassName="w-24"
                        min={1}
                        max={Number(nextId) || 1}
                    />
                    <LabeledField
                        label="Vendor Name"
                        value={values.vendorName}
                        onChange={(event) =>
                            setValue("vendorName", event.target.value, {
                                shouldDirty: true,
                                shouldValidate: true,
                            })
                        }
                        error={errors.vendorName?.message}
                        disabled={!isEditing}
                        wrapperClassName="md:col-span-2"
                        maxLength={100}
                    />

                    <LabeledField
                        label="Address"
                        value={values.address}
                        onChange={(event) =>
                            setValue("address", event.target.value, {
                                shouldDirty: true,
                                shouldValidate: true,
                            })
                        }
                        error={errors.address?.message}
                        disabled={!isEditing}
                        wrapperClassName="md:col-span-2"
                        maxLength={255}
                    />

                    <LabeledSelect
                        label="Province"
                        options={provinces}
                        value={values.provinceId}
                        onChange={handleProvinceChange}
                        error={errors.provinceId?.message}
                        disabled={!isEditing || isProvincesLoading}
                        placeholder={isProvincesLoading ? "Loading provinces..." : "Select Province"}
                    />
                    <LabeledSelect
                        label="City"
                        options={cities}
                        value={values.cityId}
                        onChange={(value) =>
                            setValue("cityId", value, {
                                shouldDirty: true,
                                shouldValidate: true,
                            })
                        }
                        error={errors.cityId?.message}
                        disabled={!isEditing || !values.provinceId || isCitiesLoading}
                        placeholder={
                            isCitiesLoading
                                ? "Loading cities..."
                                : values.provinceId
                                ? "Select City"
                                : "Select Province first"
                        }
                    />

                    <LabeledField
                        label="Contact No"
                        value={values.contactNo}
                        onChange={(event) =>
                            setValue("contactNo", event.target.value, {
                                shouldDirty: true,
                                shouldValidate: true,
                            })
                        }
                        error={errors.contactNo?.message}
                        disabled={!isEditing}
                        maxLength={15}
                    />
                    <LabeledField
                        label="Sale Tax No"
                        value={values.saleTaxNo}
                        onChange={(event) =>
                            setValue("saleTaxNo", event.target.value, {
                                shouldDirty: true,
                                shouldValidate: true,
                            })
                        }
                        error={errors.saleTaxNo?.message}
                        disabled={!isEditing}
                        maxLength={20}
                    />

                    <LabeledField
                        label="N.I.C No"
                        placeholder="12345-1234567-1"
                        value={values.NICNo}
                        onChange={(event) =>
                            setValue("NICNo", formatCNIC(event.target.value), {
                                shouldDirty: true,
                                shouldValidate: true,
                            })
                        }
                        error={errors.NICNo?.message}
                        disabled={!isEditing}
                        maxLength={15}
                    />
                    <LabeledField
                        label="Mobile No"
                        placeholder="03001234567"
                        value={values.mobileNo}
                        onChange={(event) =>
                            setValue("mobileNo", event.target.value, {
                                shouldDirty: true,
                                shouldValidate: true,
                            })
                        }
                        error={errors.mobileNo?.message}
                        disabled={!isEditing}
                        maxLength={13}
                    />

                    <LabeledField
                        label="CNIC No"
                        placeholder="12345-1234567-1"
                        value={values.CNICNo}
                        onChange={(event) =>
                            setValue("CNICNo", formatCNIC(event.target.value), {
                                shouldDirty: true,
                                shouldValidate: true,
                            })
                        }
                        error={errors.CNICNo?.message}
                        disabled={!isEditing}
                        maxLength={15}
                    />
                    <LabeledField
                        type="number"
                        label="Days Limit"
                        value={values.daysLimit}
                        onChange={(event) =>
                            setValue("daysLimit", event.target.value, {
                                shouldDirty: true,
                                shouldValidate: true,
                            })
                        }
                        error={errors.daysLimit?.message}
                        disabled={!isEditing}
                        min={0}
                        max={365}
                    />

                    <PriceField
                        label="Account Limit"
                        value={values.amoutLimit}
                        onValueChange={(digits) =>
                            setValue("amoutLimit", digits, {
                                shouldDirty: true,
                                shouldValidate: true,
                            })
                        }
                        error={errors.amoutLimit?.message}
                        disabled={!isEditing}
                    />
                    <LabeledField
                        label="NTN No"
                        placeholder="1234567-8"
                        value={values.NTNNo}
                        onChange={(event) =>
                            setValue("NTNNo", event.target.value, {
                                shouldDirty: true,
                                shouldValidate: true,
                            })
                        }
                        error={errors.NTNNo?.message}
                        disabled={!isEditing}
                        maxLength={9}
                    />

                    <PriceField
                        label="Opening Balance"
                        value={values.openingBalance}
                        onValueChange={(digits) =>
                            setValue("openingBalance", digits, {
                                shouldDirty: true,
                                shouldValidate: true,
                            })
                        }
                        allowNegative
                        error={errors.openingBalance?.message}
                        disabled={!isEditing}
                    />
                </div>

                <EntryActions
                    onNew={fetchNextId}
                    newDisabled={isSubmitting || !canCreate}
                    onViewAll={() => setIsViewAllOpen(true)}
                    viewAllDisabled={isSubmitting || !canView}
                    onEdit={() => setIsEditing(true)}
                    editDisabled={isSubmitting || isNewMode || isEditing || !canUpdate}
                    saveLoading={isSubmitting}
                    saveDisabled={!isEditing || (isNewMode ? !canCreate : !canUpdate)}
                    onPrint={() => setIsPrintOpen(true)}
                />
            </form>

            <PrintOptionsModal
                isOpen={isPrintOpen}
                onClose={() => setIsPrintOpen(false)}
                entityName="Vendors"
                printPath="/print/vendors"
                recordId={isNewMode ? null : values.id || null}
                maxCode={Number(nextId) > 1 ? Number(nextId) - 1 : undefined}
            />

            <InfiniteViewAllModal
                isOpen={isViewAllOpen}
                title="All Vendors"
                endpoint={VENDORS}
                name="vendors"
                mapRow={(row) => ({ ...row, cityName: row.city?.name || `City #${row.cityId}`, provinceName: row.province?.name || `Province #${row.provinceId}` })}
                columns={vendorColumns}
                onClose={() => setIsViewAllOpen(false)}
                onRowSelect={async (vendor) => {
                    const provinceIdStr = String(vendor.provinceId);
                    await fetchCitiesByProvince(provinceIdStr);
                    reset({
                        id: String(vendor.id),
                        vendorName: vendor.vendorName || "",
                        address: vendor.address || "",
                        provinceId: provinceIdStr,
                        cityId: String(vendor.cityId),
                        contactNo: vendor.contactNo || "",
                        saleTaxNo: vendor.saleTaxNo || "",
                        NICNo: vendor.NICNo || "",
                        mobileNo: vendor.mobileNo || "",
                        daysLimit: String(vendor.daysLimit ?? 0),
                        amoutLimit: String(vendor.amoutLimit ?? 0),
                        NTNNo: vendor.NTNNo || "",
                        openingBalance: String(vendor.openingBalance ?? 0),
                        CNICNo: vendor.CNICNo || "",
                    });
                    setIsNewMode(false);
                    setIsEditing(false);
                    setIsViewAllOpen(false);
                }}
            />
        </section>
    );
}
