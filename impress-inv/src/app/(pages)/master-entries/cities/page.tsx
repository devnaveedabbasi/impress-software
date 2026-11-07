"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { LabeledField } from "@/components/ui/LabeledField";
import { Button } from "@/components/ui/Button";
import { LabeledSelect } from "@/components/ui/LabeledSelect";
import useDebounce from "@/hooks/useDebounce";
import { citySchema, type CityFormValues } from "@/lib/validations/master";
import { CITIES, PROVINCES } from "@/utlis/apiRoutes";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { ViewAllModal, type ViewAllColumn } from "@/components/ui/ViewAllModal";

type CityRow = {
    id: number;
    name: string;
    provinceId: number;
    provinceName: string;
};

type ApiError = {
    response?: {
        status?: number;
        data?: { message?: string };
    };
};

const initialValues: CityFormValues = {
    id: "",
    name: "",
    provinceId: "",
};

export default function CityPage() {
    const [isNewMode, setIsNewMode] = useState(true);
    const [isEditing, setIsEditing] = useState(true);
    const [provinces, setProvinces] = useState<{ label: string; value: string }[]>([]);
    const { hasPermission } = usePermissions();
    const canCreate = hasPermission("city", "create");
    const canUpdate = hasPermission("city", "update");
    const canView = hasPermission("city", "view");
    const [isIdLoading, setIsIdLoading] = useState(true);
    const [nextId, setNextId] = useState("");
    const [isProvincesLoading, setIsProvincesLoading] = useState(true);
    const [isViewAllOpen, setIsViewAllOpen] = useState(false);
    const [cities, setCities] = useState<CityRow[]>([]);
    const [hasLoadedCities, setHasLoadedCities] = useState(false);
    const [isCitiesLoading, setIsCitiesLoading] = useState(false);
    const [citiesError, setCitiesError] = useState("");
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
    } = useForm<CityFormValues>({ defaultValues: initialValues });
    const values = watch();

    const fetchNextId = async () => {
        setIsIdLoading(true);
        try {
            const { data } = await api.get(`${CITIES}/next-id`, {
                params: { _ts: Date.now() },
            });
            const fetchedNextId = String(data.data.nextId);
            setNextId(fetchedNextId);
            skipNextIdLookup.current = true;
            reset({ id: fetchedNextId, name: "", provinceId: "" });
            setIsNewMode(true);
            setIsEditing(true);
        } catch (error) {
            console.error("Failed to fetch next ID", error);
        } finally {
            setIsIdLoading(false);
        }
    };

    const fetchProvinces = async () => {
        setIsProvincesLoading(true);
        try {
            const { data } = await api.get(PROVINCES);
            setProvinces(
                (data.data || []).map((province: { name: string; id: number }) => ({
                    label: province.name,
                    value: String(province.id),
                }))
            );
        } catch (error) {
            console.error("Failed to fetch provinces", error);
            toast.error("Failed to load provinces");
        } finally {
            setIsProvincesLoading(false);
        }
    };

    const fetchAllCities = async (openModal = true, force = false) => {
        if (openModal) setIsViewAllOpen(true);
        if (hasLoadedCities && !force) return;

        setIsCitiesLoading(true);
        setCitiesError("");
        try {
            const { data } = await api.get(CITIES);
            const provinceNames = new Map(
                provinces.map((province) => [province.value, province.label])
            );
            setCities(
                (data.data || []).map((city: CityRow) => ({
                    ...city,
                    provinceName:
                        provinceNames.get(String(city.provinceId)) ||
                        `Province #${city.provinceId}`,
                }))
            );
            setHasLoadedCities(true);
        } catch (error: unknown) {
            const apiError = error as ApiError;
            setCitiesError(apiError.response?.data?.message || "Failed to fetch cities");
        } finally {
            setIsCitiesLoading(false);
        }
    };

    const addCityToCache = (city: CityRow) => {
        setCities((currentCities) => {
            const provinceName =
                provinces.find((province) => String(province.value) === String(city.provinceId))
                    ?.label ||
                city.provinceName ||
                `Province #${city.provinceId}`;
            const cachedCity = { ...city, provinceName };
            const existingIndex = currentCities.findIndex(
                (currentCity) => String(currentCity.id) === String(city.id)
            );

            if (existingIndex === -1) return [...currentCities, cachedCity];
            return currentCities.map((currentCity, index) =>
                index === existingIndex ? cachedCity : currentCity
            );
        });
        setHasLoadedCities(true);
    };

    useEffect(() => {
        void fetchNextId();
        void fetchProvinces();
        void fetchAllCities(false);
    }, []);

    const onSubmit = async (data: CityFormValues) => {
        const validationResult = citySchema.safeParse(data);
        if (!validationResult.success) {
            clearErrors();
            validationResult.error.issues.forEach((issue) => {
                const field = issue.path[0];
                if (typeof field === "string") {
                    setError(field as keyof CityFormValues, {
                        type: "manual",
                        message: issue.message,
                    });
                }
            });
            return;
        }

        try {
            const payload = {
                name: validationResult.data.name,
                provinceId: Number(validationResult.data.provinceId),
            };
            const response = isNewMode
                ? await api.post(CITIES, payload)
                : await api.put(`${CITIES}/${validationResult.data.id}`, payload);

            toast.success(response.data.message || "City saved successfully");
            if (hasLoadedCities) {
                setHasLoadedCities(false);
                await fetchAllCities(false, true);
            }
            refreshNextIdAfterSubmit.current = true;
        } catch (error: unknown) {
            const apiError = error as ApiError;
            console.error("City save failed:", apiError.response?.data || error);
            toast.error(apiError.response?.data?.message || "Failed to save city");
        }
    };

    useEffect(() => {
        if (!isSubmitting && refreshNextIdAfterSubmit.current) {
            refreshNextIdAfterSubmit.current = false;
            void fetchNextId();
        }
    }, [isSubmitting]);

    const debouncedId = useDebounce(values.id, 500);
    const cityColumns: ViewAllColumn<CityRow>[] = [
        { key: "id", header: "City ID" },
        { key: "name", header: "City Name" },
        { key: "provinceName", header: "Province" },
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
                const cachedCity = cities.find((city) => String(city.id) === debouncedId);
                const city = cachedCity || (await api.get(`${CITIES}/${debouncedId}`)).data.data;

                if (!city) {
                    toast.error("City not found");
                    resetToNextId();
                    return;
                }

                if (!cachedCity) addCityToCache(city);
                reset({
                    id: String(city.id),
                    name: city.name,
                    provinceId: String(city.provinceId),
                });
                setIsNewMode(false);
                setIsEditing(false);
            } catch (error: unknown) {
                const apiError = error as ApiError;
                toast.error(
                    apiError.response?.status === 403
                        ? apiError.response?.data?.message || "Access denied. You do not have permission."
                        : "Invalid City ID"
                );
                resetToNextId();
            } finally {
                setIsIdLoading(false);
            }
        };

        void fetchDebouncedId();
    }, [debouncedId, nextId, canView, cities]);

    return (
        <section className="mx-auto mt-10 w-full max-w-110 bg-form-bg p-6 shadow-xl sm:p-8">
            <h1 className="mb-6 text-center text-2xl font-bold text-zinc-900 sm:text-3xl">
                City Entry
            </h1>

            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-3">
                <LabeledField
                    type={isIdLoading ? "text" : "number"}
                    label="City ID"
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
                />
                <LabeledField
                    label="City Name"
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
                <LabeledSelect
                    label="Province"
                    options={provinces}
                    value={values.provinceId}
                    onChange={(value) =>
                        setValue("provinceId", value, {
                            shouldDirty: true,
                            shouldValidate: true,
                        })
                    }
                    error={errors.provinceId?.message}
                    disabled={!isEditing || isProvincesLoading}
                    placeholder={isProvincesLoading ? "Loading provinces..." : "Select Province"}
                />

                <div className="grid grid-cols-2 gap-3 pt-6 sm:flex sm:flex-wrap sm:items-center sm:justify-center">
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
                        onClick={() => fetchAllCities()}
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
                title="All Cities"
                rows={cities}
                columns={cityColumns}
                searchKeys={["id", "name", "provinceName"]}
                isLoading={isCitiesLoading}
                error={citiesError}
                onClose={() => setIsViewAllOpen(false)}
                onRowSelect={(city) => {
                    reset({
                        id: String(city.id),
                        name: city.name,
                        provinceId: String(city.provinceId),
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
