"use client";

import { useEffect, useState } from "react";
import { LabeledField } from "@/components/ui/LabeledField";
import { Button } from "@/components/ui/Button";
import { useForm } from "@/hooks/useForm";
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
    const [nextId, setNextId] = useState<string>("");
    const [isViewAllOpen, setIsViewAllOpen] = useState(false);
    const [stations, setStations] = useState<StationRow[]>([]);
    const [isStationsLoading, setIsStationsLoading] = useState(false);
    const [stationsError, setStationsError] = useState("");


    const fetchNextId = async () => {
        setIsIdLoading(true);
        try {
            const { data } = await api.get(`${STATIONS}/next-id`);
            const fetchedNextId = String(data.data.nextId);
            setNextId(fetchedNextId);
            setValues({ id: fetchedNextId, name: "" });
            setIsNewMode(true);
            setIsEditing(true);
        } catch (error) {
            console.error("Failed to fetch next ID", error);
        } finally {
            setIsIdLoading(false);
        }
    };

    const fetchAllStations = async () => {
        setIsViewAllOpen(true);
        setIsStationsLoading(true);
        setStationsError("");
        try {
            const { data } = await api.get(STATIONS);
            setStations(data.data || []);
        } catch (error: any) {
            setStationsError(error.response?.data?.message || "Failed to fetch stations");
        } finally {
            setIsStationsLoading(false);
        }
    };

    useEffect(() => {
        fetchNextId();
    }, []);

    const {
        values,
        errors,
        isLoading: isSubmitting,
        handleInputChange,
        handleSubmit,
        setValues,
    } = useForm({
        initialValues,
        validationSchema: stationSchema,
        onSubmit: async (data) => {
            try {
                if (isNewMode) {
                    const response = await api.post(STATIONS, { name: data.name });
                    toast.success(response.data.message || "Station created successfully");
                } else {
                    const response = await api.put(`${STATIONS}/${data.id}`, { name: data.name });
                    toast.success(response.data.message || "Station updated successfully");
                }
                fetchNextId();
            } catch (error: any) {
                toast.error(error.response?.data?.message || "Failed to save station");
                throw error;
            }
        },
    });

    
    const debouncedId = useDebounce(values?.id, 500);

    const stationColumns: ViewAllColumn<StationRow>[] = [
        { key: "id", header: "Station ID" },
        { key: "name", header: "Station Name" },
    ];

    useEffect(() => {
        const fetchDebouncedId = async () => {
        if (!debouncedId) return;

        if (debouncedId === String(nextId)) {
            setValues({ ...initialValues, id: nextId });
            setIsNewMode(true);
            setIsEditing(true);
            return;
        }

        if (!canView) {
            toast.error("You do not have permission to view or search for this record.");
            setValues({ ...initialValues, id: nextId });
            setIsNewMode(true);
            setIsEditing(true);
            return;
        }

        setIsIdLoading(true);
        try {
            const { data } = await api.get(`${STATIONS}/${debouncedId}`);
            if (data.data) {
                setValues({ id: String(data.data.id), name: data.data.name });
                setIsNewMode(false);
                setIsEditing(false);
                toast.success("Station found");
            } else {
                toast.error("Station not found");
                setValues({ ...initialValues, id: nextId });
                setIsNewMode(true);
            }
        } catch (error: any) {
            if (error.response?.status === 403) {
                toast.error(error.response?.data?.message || "Access denied. You do not have permission.");
            } else {
                toast.error("Invalid Station ID");
            }
            setValues({ ...initialValues, id: nextId });
            setIsNewMode(true);
        } finally {
            setIsIdLoading(false);
        }
    }
        fetchDebouncedId();
    }, [debouncedId]);;

    return (
        <section className="mx-auto mt-10 w-full max-w-110 bg-form-bg p-6 shadow-xl sm:p-8">
            <h1 className="mb-6 text-center text-2xl font-bold text-zinc-900 sm:text-3xl">Station Entry</h1>

            <form onSubmit={handleSubmit} noValidate className="space-y-3">
                <LabeledField
                    type={isIdLoading ? "text" : "number"}
                    label="Station ID"
                    value={isIdLoading ? "Loading..." : values.id || ""}
                    onChange={handleInputChange("id")}
                    error={errors.id}
                    disabled={isIdLoading}
                min={1}
                    max={Number(nextId) || 1}
                />
                <LabeledField
                    label="Station Name"
                    value={values.name}
                    onChange={handleInputChange("name")}
                    error={errors.name}
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
                        onClick={fetchAllStations}
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
                    setValues({ id: String(station.id), name: station.name });
                    setIsNewMode(false);
                    setIsEditing(false);
                    setIsViewAllOpen(false);
                }}
                onDelete={() => undefined}
            />
        </section>
    );
}

