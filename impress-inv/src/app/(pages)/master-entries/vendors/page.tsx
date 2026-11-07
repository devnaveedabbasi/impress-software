"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { LabeledField } from "@/components/ui/LabeledField";
import { LabeledSelect } from "@/components/ui/LabeledSelect";
import { Button } from "@/components/ui/Button";
import useDebounce from "@/hooks/useDebounce";
import { vendorSchema, type VendorFormValues } from "@/lib/validations/master";
import { VENDORS, CITIES, PROVINCES } from "@/utlis/apiRoutes";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { ViewAllModal, type ViewAllColumn } from "@/components/ui/ViewAllModal";

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
    const [vendors, setVendors] = useState<VendorRow[]>([]);
    const [hasLoadedVendors, setHasLoadedVendors] = useState(false);
    const [isVendorsLoading, setIsVendorsLoading] = useState(false);
    const [vendorsError, setVendorsError] = useState("");
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
    } = useForm<VendorFormValues>({ defaultValues: initialValues });
    const values = watch();

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
            skipNextIdLookup.current = true;
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

    const fetchAllVendors = async (openModal = true, force = false) => {
        if (openModal) setIsViewAllOpen(true);
        if (hasLoadedVendors && !force) return;

        setIsVendorsLoading(true);
        setVendorsError("");
        try {
            const { data } = await api.get(VENDORS);
            const list: VendorRow[] = (data.data || []).map((v: VendorRow) => ({
                ...v,
                cityName: v.city?.name || `City #${v.cityId}`,
                provinceName: v.province?.name || `Province #${v.provinceId}`,
            }));
            setVendors(list);
            setHasLoadedVendors(true);
        } catch (error: unknown) {
            const apiError = error as ApiError;
            setVendorsError(apiError.response?.data?.message || "Failed to fetch vendors");
        } finally {
            setIsVendorsLoading(false);
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
        setHasLoadedVendors(true);
    };

    useEffect(() => {
        void fetchNextId();
        void fetchProvinces();
        void fetchAllVendors(false);
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
            if (hasLoadedVendors) {
                setHasLoadedVendors(false);
                await fetchAllVendors(false, true);
            }
            refreshNextIdAfterSubmit.current = true;
        } catch (error: unknown) {
            const apiError = error as ApiError;
            console.error("Vendor save failed:", apiError.response?.data || error);
            toast.error(apiError.response?.data?.message || "Failed to save vendor");
        }
    };

    useEffect(() => {
        if (!isSubmitting && refreshNextIdAfterSubmit.current) {
            refreshNextIdAfterSubmit.current = false;
            void fetchNextId();
        }
    }, [isSubmitting]);

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
            if (skipNextIdLookup.current) {
                skipNextIdLookup.current = false;
                return;
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
                const vendor: VendorRow = cached || (await api.get(`${VENDORS}/${debouncedId}`)).data.data;

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

            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                    <LabeledField
                        type={isIdLoading ? "text" : "number"}
                        label="Vendor ID"
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
                        wrapperClassName="w-24"
                        disabled={isIdLoading}
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

                    <LabeledField
                        type="number"
                        label="Account Limit"
                        value={values.amoutLimit}
                        onChange={(event) =>
                            setValue("amoutLimit", event.target.value, {
                                shouldDirty: true,
                                shouldValidate: true,
                            })
                        }
                        error={errors.amoutLimit?.message}
                        disabled={!isEditing}
                        min={0}
                        max={100000000}
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

                    <LabeledField
                        type="number"
                        label="Opening Balance"
                        value={values.openingBalance}
                        onChange={(event) =>
                            setValue("openingBalance", event.target.value, {
                                shouldDirty: true,
                                shouldValidate: true,
                            })
                        }
                        error={errors.openingBalance?.message}
                        disabled={!isEditing}
                        min={-100000000}
                        max={1000000000}
                    />
                </div>

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
                        onClick={() => fetchAllVendors()}
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
                        onClick={() => window.open("/print/vendors", "_blank")}
                        className="border border-zinc-400 bg-white px-6 hover:bg-zinc-50"
                    >
                        Print
                    </Button>
                </div>
            </form>

            <ViewAllModal
                key={isViewAllOpen ? "open" : "closed"}
                isOpen={isViewAllOpen}
                title="All Vendors"
                rows={vendors}
                columns={vendorColumns}
                searchKeys={["id", "vendorName", "contactNo", "cityName"]}
                isLoading={isVendorsLoading}
                error={vendorsError}
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
                onDelete={() => undefined}
            />
        </section>
    );
}
