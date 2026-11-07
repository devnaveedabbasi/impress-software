"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { LabeledField } from "@/components/ui/LabeledField";
import { Button } from "@/components/ui/Button";
import useDebounce from "@/hooks/useDebounce";
import { provinceSchema, type ProvinceFormValues } from "@/lib/validations/master";
import { PROVINCES } from "@/utlis/apiRoutes";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { ViewAllModal, type ViewAllColumn } from "@/components/ui/ViewAllModal";

type ProvinceRow = {
    id: number;
    name: string;
};

type ApiError = {
    response?: {
        status?: number;
        data?: { message?: string };
    };
};

const initialValues: ProvinceFormValues = {
    id: "",
    name: "",
};

export default function ProvincePage() {
    const [isNewMode, setIsNewMode] = useState(true);
    const [isEditing, setIsEditing] = useState(true);
    const { hasPermission } = usePermissions();
    const canCreate = hasPermission("province", "create");
    const canUpdate = hasPermission("province", "update");
    const canView = hasPermission("province", "view");
    const [isIdLoading, setIsIdLoading] = useState(true);
    const [nextId, setNextId] = useState("");
    const [isViewAllOpen, setIsViewAllOpen] = useState(false);
    const [provinces, setProvinces] = useState<ProvinceRow[]>([]);
    const [hasLoadedProvinces, setHasLoadedProvinces] = useState(false);
    const [isProvincesLoading, setIsProvincesLoading] = useState(false);
    const [provincesError, setProvincesError] = useState("");
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
    } = useForm<ProvinceFormValues>({ defaultValues: initialValues });
    const values = watch();

    const fetchNextId = async () => {
        setIsIdLoading(true);
        try {
            const { data } = await api.get(`${PROVINCES}/next-id`, {
                params: { _ts: Date.now() },
            });
            const fetchedNextId = String(data.data.nextId);
            setNextId(fetchedNextId);
            skipNextIdLookup.current = true;
            reset({ id: fetchedNextId, name: "" });
            setIsNewMode(true);
            setIsEditing(true);
        } catch (error) {
            console.error("Failed to fetch next ID", error);
        } finally {
            setIsIdLoading(false);
        }
    };

    const fetchAllProvinces = async (openModal = true, force = false) => {
        if (openModal) setIsViewAllOpen(true);
        if (hasLoadedProvinces && !force) return;

        setIsProvincesLoading(true);
        setProvincesError("");
        try {
            const { data } = await api.get(PROVINCES);
            setProvinces(data.data || []);
            setHasLoadedProvinces(true);
        } catch (error: unknown) {
            const apiError = error as ApiError;
            setProvincesError(apiError.response?.data?.message || "Failed to fetch provinces");
        } finally {
            setIsProvincesLoading(false);
        }
    };

    const addProvinceToCache = (province: ProvinceRow) => {
        setProvinces((current) => {
            const existingIndex = current.findIndex(
                (item) => String(item.id) === String(province.id)
            );
            if (existingIndex === -1) return [...current, province];
            return current.map((item, index) =>
                index === existingIndex ? province : item
            );
        });
        setHasLoadedProvinces(true);
    };

    useEffect(() => {
        void fetchNextId();
        void fetchAllProvinces(false);
    }, []);

    const onSubmit = async (data: ProvinceFormValues) => {
        const validationResult = provinceSchema.safeParse(data);
        if (!validationResult.success) {
            clearErrors();
            validationResult.error.issues.forEach((issue) => {
                const field = issue.path[0];
                if (typeof field === "string") {
                    setError(field as keyof ProvinceFormValues, {
                        type: "manual",
                        message: issue.message,
                    });
                }
            });
            return;
        }

        try {
            const payload = {
                name: validationResult.data.name.trim(),
            };
            const response = isNewMode
                ? await api.post(PROVINCES, payload)
                : await api.put(`${PROVINCES}/${validationResult.data.id}`, payload);

            toast.success(response.data.message || "Province saved successfully");
            if (hasLoadedProvinces) {
                setHasLoadedProvinces(false);
                await fetchAllProvinces(false, true);
            }
            refreshNextIdAfterSubmit.current = true;
        } catch (error: unknown) {
            const apiError = error as ApiError;
            console.error("Province save failed:", apiError.response?.data || error);
            toast.error(apiError.response?.data?.message || "Failed to save province");
        }
    };

    useEffect(() => {
        if (!isSubmitting && refreshNextIdAfterSubmit.current) {
            refreshNextIdAfterSubmit.current = false;
            void fetchNextId();
        }
    }, [isSubmitting]);

    const debouncedId = useDebounce(values.id, 500);
    const provinceColumns: ViewAllColumn<ProvinceRow>[] = [
        { key: "id", header: "Province ID" },
        { key: "name", header: "Province Name" },
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
                const cached = provinces.find((p) => String(p.id) === debouncedId);
                const province = cached || (await api.get(`${PROVINCES}/${debouncedId}`)).data.data;

                if (!province) {
                    toast.error("Province not found");
                    resetToNextId();
                    return;
                }

                if (!cached) addProvinceToCache(province);
                reset({
                    id: String(province.id),
                    name: province.name,
                });
                setIsNewMode(false);
                setIsEditing(false);
            } catch (error: unknown) {
                const apiError = error as ApiError;
                toast.error(
                    apiError.response?.status === 403
                        ? apiError.response?.data?.message || "Access denied. You do not have permission."
                        : "Invalid Province ID"
                );
                resetToNextId();
            } finally {
                setIsIdLoading(false);
            }
        };

        void fetchDebouncedId();
    }, [debouncedId, nextId, canView, provinces]);

    return (
        <section className="mx-auto mt-10 w-full max-w-110 bg-form-bg p-6 shadow-xl sm:p-8">
            <h1 className="mb-6 text-center text-2xl font-bold text-zinc-900 sm:text-3xl">
                Province Entry
            </h1>

            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-3">
                <LabeledField
                    type={isIdLoading ? "text" : "number"}
                    label="Province ID"
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
                    label="Province Name"
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
                        onClick={() => fetchAllProvinces()}
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
                title="All Provinces"
                rows={provinces}
                columns={provinceColumns}
                searchKeys={["id", "name"]}
                isLoading={isProvincesLoading}
                error={provincesError}
                onClose={() => setIsViewAllOpen(false)}
                onRowSelect={(province) => {
                    reset({
                        id: String(province.id),
                        name: province.name,
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
