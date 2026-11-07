"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import useDebounce from "@/hooks/useDebounce";
import { dealerSchema, type DealerFormValues } from "@/lib/validations/master";
import { DEALERS, CITIES, PROVINCES } from "@/utlis/apiRoutes";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { ViewAllModal, type ViewAllColumn } from "@/components/ui/ViewAllModal";
import { LabeledField } from "@/components/ui/LabeledField";
import { LabeledSelect } from "@/components/ui/LabeledSelect";

type DealerRow = {
    id: number;
    dealarShipName: string;
    contactNo: string;
    address: string;
    saleTaxNo: string;
    NTNNo: string;
    name: string;
    provinceId: number;
    cityId: number;
    mobileNo: string;
    opeaningBalance: number;
    dealarType: "single" | "dealar";
    NICNo: string;
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

const initialValues: DealerFormValues = {
    id: "",
    dealarShipName: "",
    contactNo: "",
    address: "",
    saleTaxNo: "",
    NTNNo: "",
    name: "",
    provinceId: "",
    cityId: "",
    mobileNo: "",
    opeaningBalance: "",
    dealarType: "single",
    NICNo: "",
};

const formatCNIC = (val: string) => {
    const raw = val.replace(/\D/g, "").slice(0, 13);
    if (raw.length <= 5) return raw;
    if (raw.length <= 12) return `${raw.slice(0, 5)}-${raw.slice(5)}`;
    return `${raw.slice(0, 5)}-${raw.slice(5, 12)}-${raw.slice(12)}`;
};

export default function DealerPage() {
    const [isNewMode, setIsNewMode] = useState(true);
    const [isEditing, setIsEditing] = useState(true);
    const [provinces, setProvinces] = useState<{ label: string; value: string }[]>([]);
    const [cities, setCities] = useState<{ label: string; value: string }[]>([]);
    const [isProvincesLoading, setIsProvincesLoading] = useState(true);
    const [isCitiesLoading, setIsCitiesLoading] = useState(false);

    const { hasPermission } = usePermissions();
    const canCreate = hasPermission("dealer", "create");
    const canUpdate = hasPermission("dealer", "update");
    const canView = hasPermission("dealer", "view");

    const [isIdLoading, setIsIdLoading] = useState(true);
    const [nextId, setNextId] = useState("");
    const [isViewAllOpen, setIsViewAllOpen] = useState(false);
    const [dealers, setDealers] = useState<DealerRow[]>([]);
    const [hasLoadedDealers, setHasLoadedDealers] = useState(false);
    const [isDealersLoading, setIsDealersLoading] = useState(false);
    const [dealersError, setDealersError] = useState("");
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
    } = useForm<DealerFormValues>({ defaultValues: initialValues });
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
        } finally {
            setIsCitiesLoading(false);
        }
    };

    const fetchNextId = async () => {
        setIsIdLoading(true);
        try {
            const { data } = await api.get(`${DEALERS}/next-id`, {
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
            console.error("Failed to fetch next dealer ID", error);
        } finally {
            setIsIdLoading(false);
        }
    };

    const fetchAllDealers = async (openModal = true, force = false) => {
        if (openModal) setIsViewAllOpen(true);
        if (hasLoadedDealers && !force) return;

        setIsDealersLoading(true);
        setDealersError("");
        try {
            const { data } = await api.get(DEALERS);
            const list: DealerRow[] = (data.data || []).map((d: DealerRow) => ({
                ...d,
                cityName: d.city?.name || `City #${d.cityId}`,
                provinceName: d.province?.name || `Province #${d.provinceId}`,
            }));
            setDealers(list);
            setHasLoadedDealers(true);
        } catch (error: unknown) {
            const apiError = error as ApiError;
            setDealersError(apiError.response?.data?.message || "Failed to fetch dealers");
        } finally {
            setIsDealersLoading(false);
        }
    };

    const addDealerToCache = (dealer: DealerRow) => {
        setDealers((current) => {
            const cityName = dealer.city?.name || dealer.cityName || `City #${dealer.cityId}`;
            const provinceName = dealer.province?.name || dealer.provinceName || `Province #${dealer.provinceId}`;
            const cached: DealerRow = { ...dealer, cityName, provinceName };
            const existingIndex = current.findIndex(
                (item) => String(item.id) === String(dealer.id)
            );
            if (existingIndex === -1) return [...current, cached];
            return current.map((item, index) =>
                index === existingIndex ? cached : item
            );
        });
        setHasLoadedDealers(true);
    };

    useEffect(() => {
        void fetchNextId();
        void fetchProvinces();
        void fetchAllDealers(false);
    }, []);

    const handleProvinceChange = (provinceId: string) => {
        setValue("provinceId", provinceId, { shouldDirty: true, shouldValidate: true });
        setValue("cityId", "", { shouldDirty: true });
        void fetchCitiesByProvince(provinceId);
    };

    const onSubmit = async (data: DealerFormValues) => {
        const validationResult = dealerSchema.safeParse(data);
        if (!validationResult.success) {
            clearErrors();
            validationResult.error.issues.forEach((issue) => {
                const field = issue.path[0];
                if (typeof field === "string") {
                    setError(field as keyof DealerFormValues, {
                        type: "manual",
                        message: issue.message,
                    });
                }
            });
            return;
        }

        const payload = {
            dealarShipName: validationResult.data.dealarShipName.trim(),
            contactNo: validationResult.data.contactNo.trim(),
            address: validationResult.data.address.trim(),
            saleTaxNo: validationResult.data.saleTaxNo.trim(),
            NTNNo: validationResult.data.NTNNo.trim(),
            name: validationResult.data.name.trim(),
            provinceId: Number(validationResult.data.provinceId),
            cityId: Number(validationResult.data.cityId),
            mobileNo: validationResult.data.mobileNo.trim(),
            opeaningBalance: Number(validationResult.data.opeaningBalance),
            dealarType: validationResult.data.dealarType,
            NICNo: validationResult.data.NICNo.trim(),
        };

        try {
            const response = isNewMode
                ? await api.post(DEALERS, payload)
                : await api.put(`${DEALERS}/${validationResult.data.id}`, payload);

            toast.success(response.data.message || "Dealer saved successfully");
            if (hasLoadedDealers) {
                setHasLoadedDealers(false);
                await fetchAllDealers(false, true);
            }
            refreshNextIdAfterSubmit.current = true;
        } catch (error: unknown) {
            const apiError = error as ApiError;
            console.error("Dealer save failed:", apiError.response?.data || error);
            toast.error(apiError.response?.data?.message || "Failed to save dealer");
        }
    };

    useEffect(() => {
        if (!isSubmitting && refreshNextIdAfterSubmit.current) {
            refreshNextIdAfterSubmit.current = false;
            void fetchNextId();
        }
    }, [isSubmitting]);

    const debouncedId = useDebounce(values.id, 500);
    const dealerColumns: ViewAllColumn<DealerRow>[] = [
        { key: "id", header: "Dealer ID" },
        { key: "dealarShipName", header: "Dealership" },
        { key: "name", header: "Contact Person" },
        { key: "contactNo", header: "Contact" },
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
                const cached = dealers.find((d) => String(d.id) === debouncedId);
                const dealer: DealerRow = cached || (await api.get(`${DEALERS}/${debouncedId}`)).data.data;

                if (!dealer) {
                    toast.error("Dealer not found");
                    resetToNextId();
                    return;
                }

                if (!cached) addDealerToCache(dealer);

                const provinceIdStr = String(dealer.provinceId);
                await fetchCitiesByProvince(provinceIdStr);

                reset({
                    id: String(dealer.id),
                    dealarShipName: dealer.dealarShipName || "",
                    contactNo: dealer.contactNo || "",
                    address: dealer.address || "",
                    saleTaxNo: dealer.saleTaxNo || "",
                    NTNNo: dealer.NTNNo || "",
                    name: dealer.name || "",
                    provinceId: provinceIdStr,
                    cityId: String(dealer.cityId),
                    mobileNo: dealer.mobileNo || "",
                    opeaningBalance: String(dealer.opeaningBalance ?? 0),
                    dealarType: dealer.dealarType || "single",
                    NICNo: dealer.NICNo || "",
                });
                setIsNewMode(false);
                setIsEditing(false);
            } catch (error: unknown) {
                const apiError = error as ApiError;
                toast.error(
                    apiError.response?.status === 403
                        ? apiError.response?.data?.message || "Access denied. You do not have permission."
                        : "Invalid Dealer ID"
                );
                resetToNextId();
            } finally {
                setIsIdLoading(false);
            }
        };

        void fetchDebouncedId();
    }, [debouncedId, nextId, canView, dealers]);

    const btnClass =
        "bg-white border border-zinc-400 px-6 py-1.5 text-[15px] text-black hover:bg-zinc-50 active:bg-zinc-100 min-w-[85px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center";

    return (
        <section className="mx-auto mt-10 w-full max-w-4xl bg-form-bg p-8 shadow-sm">
            <h1 className="mb-10 text-center text-4xl text-black tracking-wide">
                Dealer Profile
            </h1>

            <form onSubmit={handleSubmit(onSubmit)} noValidate>
                {/* Top Section */}
                <div className="flex flex-col md:flex-row justify-between items-start gap-10">
                    <div className="flex-1 w-full space-y-1.5">
                        <LabeledField
                            type={isIdLoading ? "text" : "number"}
                            label="Dealer ID"
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
                            wrapperClassName="max-w-[200px]"
                            disabled={isIdLoading}
                            min={1}
                            max={Number(nextId) || 1}
                        />
                        <LabeledField
                            label="Dealership Name"
                            value={values.dealarShipName}
                            onChange={(event) =>
                                setValue("dealarShipName", event.target.value, {
                                    shouldDirty: true,
                                    shouldValidate: true,
                                })
                            }
                            error={errors.dealarShipName?.message}
                            disabled={!isEditing}
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
                        />
                        <LabeledField
                            label="Sale Tax"
                            value={values.saleTaxNo}
                            onChange={(event) =>
                                setValue("saleTaxNo", event.target.value, {
                                    shouldDirty: true,
                                    shouldValidate: true,
                                })
                            }
                            error={errors.saleTaxNo?.message}
                            disabled={!isEditing}
                        />
                        <LabeledField
                            label="N.T.N.NO"
                            value={values.NTNNo}
                            onChange={(event) =>
                                setValue("NTNNo", event.target.value, {
                                    shouldDirty: true,
                                    shouldValidate: true,
                                })
                            }
                            error={errors.NTNNo?.message}
                            disabled={!isEditing}
                        />
                    </div>

                    {/* Action Buttons */}
                    <div className="grid grid-cols-2 gap-2 shrink-0">
                        <button
                            type="button"
                            onClick={fetchNextId}
                            className={btnClass}
                            disabled={isSubmitting || !canCreate}
                        >
                            New
                        </button>
                        <button
                            type="button"
                            onClick={() => fetchAllDealers()}
                            className={btnClass}
                            disabled={isSubmitting || !canView}
                        >
                            View All
                        </button>
                        <button
                            type="submit"
                            className={btnClass}
                            disabled={!isEditing || isSubmitting || (isNewMode ? !canCreate : !canUpdate)}
                        >
                            Save
                        </button>
                        <button
                            type="button"
                            onClick={() => window.open("/print/dealers", "_blank")}
                            className={btnClass}
                        >
                            Print
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsEditing(true)}
                            className={btnClass}
                            disabled={isEditing || isNewMode || !canUpdate}
                        >
                            Edit
                        </button>
                    </div>
                </div>

                {/* Information Divider */}
                <div className="flex items-center gap-3 mb-6 mt-6">
                    <span className="text-[14px] text-zinc-900 font-normal">Information</span>
                    <div className="flex-1 h-[1px] bg-zinc-500"></div>
                </div>

                {/* Bottom Section */}
                <div className="flex flex-col md:flex-row gap-6">
                    <div className="flex-1 space-y-1.5">
                        <LabeledField
                            label="Name"
                            value={values.name}
                            onChange={(event) =>
                                setValue("name", event.target.value, {
                                    shouldDirty: true,
                                    shouldValidate: true,
                                })
                            }
                            error={errors.name?.message}
                            disabled={!isEditing}
                        />
                        <LabeledField
                            label="Mobile"
                            value={values.mobileNo}
                            onChange={(event) =>
                                setValue("mobileNo", event.target.value, {
                                    shouldDirty: true,
                                    shouldValidate: true,
                                })
                            }
                            error={errors.mobileNo?.message}
                            disabled={!isEditing}
                        />
                        <LabeledField
                            type="number"
                            label="Opening Balance"
                            value={values.opeaningBalance}
                            onChange={(event) =>
                                setValue("opeaningBalance", event.target.value, {
                                    shouldDirty: true,
                                    shouldValidate: true,
                                })
                            }
                            error={errors.opeaningBalance?.message}
                            disabled={!isEditing}
                        />
                        <LabeledSelect
                            label="Dealer Type"
                            options={[
                                { label: "Single", value: "single" },
                                { label: "Dealer", value: "dealar" },
                            ]}
                            value={values.dealarType}
                            onChange={(val) =>
                                setValue("dealarType", val as "single" | "dealar", {
                                    shouldDirty: true,
                                    shouldValidate: true,
                                })
                            }
                            error={errors.dealarType?.message}
                            disabled={!isEditing}
                        />
                    </div>

                    <div className="flex-1 space-y-1.5">
                        <LabeledField
                            label="N.I.C#"
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
                            onChange={(val) =>
                                setValue("cityId", val, {
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
                    </div>
                </div>
            </form>

            <ViewAllModal
                key={isViewAllOpen ? "open" : "closed"}
                isOpen={isViewAllOpen}
                title="All Dealers"
                rows={dealers}
                columns={dealerColumns}
                searchKeys={["id", "dealarShipName", "name", "contactNo"]}
                isLoading={isDealersLoading}
                error={dealersError}
                onClose={() => setIsViewAllOpen(false)}
                onRowSelect={async (dealer) => {
                    const provinceIdStr = String(dealer.provinceId);
                    await fetchCitiesByProvince(provinceIdStr);
                    reset({
                        id: String(dealer.id),
                        dealarShipName: dealer.dealarShipName || "",
                        contactNo: dealer.contactNo || "",
                        address: dealer.address || "",
                        saleTaxNo: dealer.saleTaxNo || "",
                        NTNNo: dealer.NTNNo || "",
                        name: dealer.name || "",
                        provinceId: provinceIdStr,
                        cityId: String(dealer.cityId),
                        mobileNo: dealer.mobileNo || "",
                        opeaningBalance: String(dealer.opeaningBalance ?? 0),
                        dealarType: dealer.dealarType || "single",
                        NICNo: dealer.NICNo || "",
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
