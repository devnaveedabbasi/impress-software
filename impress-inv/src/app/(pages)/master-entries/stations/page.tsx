"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { LabeledField } from "@/components/ui/LabeledField";
import { Button } from "@/components/ui/Button";
import useDebounce from "@/hooks/useDebounce";
import { stationSchema, type StationFormValues } from "@/lib/validations/master";
import { STATIONS } from "@/utlis/apiRoutes";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { ViewAllModal, type ViewAllColumn } from "@/components/ui/ViewAllModal";

type StationRow = {
    id: number;
    name: string;
};

type ApiError = {
    response?: {
        status?: number;
        data?: { message?: string };
    };
};

const initialValues: StationFormValues = {
    id: "",
    name: "",
};

export default function StationPage() {
    const [isNewMode, setIsNewMode] = useState(true);
    const [isEditing, setIsEditing] = useState(true);
    const { hasPermission } = usePermissions();
    const canCreate = hasPermission("station", "create");
    const canUpdate = hasPermission("station", "update");
    const canView = hasPermission("station", "view");
    const [isIdLoading, setIsIdLoading] = useState(true);
    const [nextId, setNextId] = useState("");
    const [isViewAllOpen, setIsViewAllOpen] = useState(false);
    const [stations, setStations] = useState<StationRow[]>([]);
    const [hasLoadedStations, setHasLoadedStations] = useState(false);
    const [isStationsLoading, setIsStationsLoading] = useState(false);
    const [stationsError, setStationsError] = useState("");
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
    } = useForm<StationFormValues>({ defaultValues: initialValues });
    const values = watch();

    const fetchNextId = async () => {
        setIsIdLoading(true);
        try {
            const { data } = await api.get(`${STATIONS}/next-id`, {
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

    const fetchAllStations = async (openModal = true, force = false) => {
        if (openModal) setIsViewAllOpen(true);
        if (hasLoadedStations && !force) return;

        setIsStationsLoading(true);
        setStationsError("");
        try {
            const { data } = await api.get(STATIONS);
            setStations(data.data || []);
            setHasLoadedStations(true);
        } catch (error: unknown) {
            const apiError = error as ApiError;
            setStationsError(apiError.response?.data?.message || "Failed to fetch stations");
        } finally {
            setIsStationsLoading(false);
        }
    };

    const addStationToCache = (station: StationRow) => {
        setStations((current) => {
            const existingIndex = current.findIndex(
                (item) => String(item.id) === String(station.id)
            );
            if (existingIndex === -1) return [...current, station];
            return current.map((item, index) =>
                index === existingIndex ? station : item
            );
        });
        setHasLoadedStations(true);
    };

    useEffect(() => {
        void fetchNextId();
        void fetchAllStations(false);
    }, []);

    const onSubmit = async (data: StationFormValues) => {
        const validationResult = stationSchema.safeParse(data);
        if (!validationResult.success) {
            clearErrors();
            validationResult.error.issues.forEach((issue) => {
                const field = issue.path[0];
                if (typeof field === "string") {
                    setError(field as keyof StationFormValues, {
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
                ? await api.post(STATIONS, payload)
                : await api.put(`${STATIONS}/${validationResult.data.id}`, payload);

            toast.success(response.data.message || "Station saved successfully");
            if (hasLoadedStations) {
                setHasLoadedStations(false);
                await fetchAllStations(false, true);
            }
            refreshNextIdAfterSubmit.current = true;
        } catch (error: unknown) {
            const apiError = error as ApiError;
            console.error("Station save failed:", apiError.response?.data || error);
            toast.error(apiError.response?.data?.message || "Failed to save station");
        }
    };

    useEffect(() => {
        if (!isSubmitting && refreshNextIdAfterSubmit.current) {
            refreshNextIdAfterSubmit.current = false;
            void fetchNextId();
        }
    }, [isSubmitting]);

    const debouncedId = useDebounce(values.id, 500);
    const stationColumns: ViewAllColumn<StationRow>[] = [
        { key: "id", header: "Station ID" },
        { key: "name", header: "Station Name" },
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
                const cached = stations.find((s) => String(s.id) === debouncedId);
                const station = cached || (await api.get(`${STATIONS}/${debouncedId}`)).data.data;

                if (!station) {
                    toast.error("Station not found");
                    resetToNextId();
                    return;
                }

                if (!cached) addStationToCache(station);
                reset({
                    id: String(station.id),
                    name: station.name,
                });
                setIsNewMode(false);
                setIsEditing(false);
            } catch (error: unknown) {
                const apiError = error as ApiError;
                toast.error(
                    apiError.response?.status === 403
                        ? apiError.response?.data?.message || "Access denied. You do not have permission."
                        : "Invalid Station ID"
                );
                resetToNextId();
            } finally {
                setIsIdLoading(false);
            }
        };

        void fetchDebouncedId();
    }, [debouncedId, nextId, canView, stations]);

    return (
        <section className="mx-auto mt-10 w-full max-w-110 bg-form-bg p-6 shadow-xl sm:p-8">
            <h1 className="mb-6 text-center text-2xl font-bold text-zinc-900 sm:text-3xl">
                Station Entry
            </h1>

            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-3">
                <LabeledField
                    type={isIdLoading ? "text" : "number"}
                    label="Station ID"
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
                    label="Station Name"
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
                        onClick={() => fetchAllStations()}
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
                title="All Stations"
                rows={stations}
                columns={stationColumns}
                searchKeys={["id", "name"]}
                isLoading={isStationsLoading}
                error={stationsError}
                onClose={() => setIsViewAllOpen(false)}
                onRowSelect={(station) => {
                    reset({
                        id: String(station.id),
                        name: station.name,
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
