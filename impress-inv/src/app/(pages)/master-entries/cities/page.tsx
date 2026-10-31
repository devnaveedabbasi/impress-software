"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LabeledField } from "@/components/ui/LabeledField";
import { Button } from "@/components/ui/Button";
import { LabeledSelect } from "@/components/ui/LabeledSelect";
import { useForm } from "@/hooks/useForm";
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

const initialValues: CityFormValues = {
    id: "",
    name: "",
    provinceId: "",
};

export default function CityPage() {
    const router = useRouter();
    const [isNewMode, setIsNewMode] = useState(true);
    const [isEditing, setIsEditing] = useState(true);
    const [provinces, setProvinces] = useState<{ label: string, value: string }[]>([]);
    const { hasPermission } = usePermissions();
    const canCreate = hasPermission("city", "create");
    const canUpdate = hasPermission("city", "update");
    const canView = hasPermission("city", "view");
    const [isIdLoading, setIsIdLoading] = useState(true);
    const [nextId, setNextId] = useState<string>("");
    const [isProvincesLoading, setIsProvincesLoading] = useState(true);
    const [isViewAllOpen, setIsViewAllOpen] = useState(false);
    const [cities, setCities] = useState<CityRow[]>([]);
    const [isCitiesLoading, setIsCitiesLoading] = useState(false);
    const [citiesError, setCitiesError] = useState("");


    const fetchNextId = async () => {
        setIsIdLoading(true);
        try {
            const { data } = await api.get(`${CITIES}/next-id`);
            const fetchedNextId = String(data.data.nextId);
            setNextId(fetchedNextId);
            setValues({ id: fetchedNextId, name: "", provinceId: "" });
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
            if (data.data) {
                const options = data.data.map((p: any) => ({
                    label: p.name,
                    value: String(p.id)
                }));
                setProvinces(options);
            }
        } catch (error) {
            console.error("Failed to fetch provinces", error);
            toast.error("Failed to load provinces");
        } finally {
            setIsProvincesLoading(false);
        }
    };

    const fetchAllCities = async () => {
        setIsViewAllOpen(true);
        setIsCitiesLoading(true);
        setCitiesError("");
        try {
            const { data } = await api.get(CITIES);
            const provinceNames = new Map(provinces.map((province) => [province.value, province.label]));
            setCities((data.data || []).map((city: CityRow) => ({
                ...city,
                provinceName: provinceNames.get(String(city.provinceId)) || `Province #${city.provinceId}`,
            })));
        } catch (error: any) {
            setCitiesError(error.response?.data?.message || "Failed to fetch cities");
        } finally {
            setIsCitiesLoading(false);
        }
    };

    useEffect(() => {
        fetchNextId();
        fetchProvinces();
    }, []);

    const {
        values,
        errors,
        isLoading: isSubmitting,
        handleInputChange,
        handleSelectChange,
        handleSubmit,
        setValues,
    } = useForm({
        initialValues,
        validationSchema: citySchema,
        onSubmit: async (data) => {
            try {
                if (isNewMode) {
                    const response = await api.post(CITIES, { name: data.name, provinceId: Number(data.provinceId) });
                    toast.success(response.data.message || "City created successfully");
                } else {
                    const response = await api.put(`${CITIES}/${data.id}`, { name: data.name, provinceId: Number(data.provinceId) });
                    toast.success(response.data.message || "City updated successfully");
                }
                fetchNextId();
            } catch (error: any) {
                toast.error(error.response?.data?.message || "Failed to save city");
                throw error;
            }
        },
    });

    
    const debouncedId = useDebounce(values?.id, 500);

    const cityColumns: ViewAllColumn<CityRow>[] = [
        { key: "id", header: "City ID" },
        { key: "name", header: "City Name" },
        { key: "provinceName", header: "Province" },
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
            const { data } = await api.get(`${CITIES}/${debouncedId}`);
            if (data.data) {
                setValues({ 
                    id: String(data.data.id), 
                    name: data.data.name,
                    provinceId: String(data.data.provinceId)
                });
                setIsNewMode(false);
                setIsEditing(false);
                toast.success("City found");
            } else {
                toast.error("City not found");
                // Clear fields but keep the ID they typed
                setValues({ ...initialValues, id: nextId });
                setIsNewMode(true);
            }
        } catch (error: any) {
            if (error.response?.status === 403) {
                toast.error(error.response?.data?.message || "Access denied. You do not have permission.");
            } else {
                toast.error("Invalid City ID");
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
            <h1 className="mb-6 text-center text-2xl font-bold text-zinc-900 sm:text-3xl">City Entry</h1>

            <form onSubmit={handleSubmit} noValidate className="space-y-3">
                <LabeledField
                    type={isIdLoading ? "text" : "number"}
                    label="City ID"
                    value={isIdLoading ? "Loading..." : values.id || ""}
                    onChange={handleInputChange("id")}
                    error={errors.id}
                    disabled={isIdLoading}
                min={1}
                    max={Number(nextId) || 1}
                />
                <LabeledField
                    label="City Name"
                    value={values.name}
                    onChange={handleInputChange("name")}
                    error={errors.name}
                    disabled={!isEditing}
                />
                <LabeledSelect
                    label="Province"
                    options={provinces}
                    value={values.provinceId}
                    onChange={handleSelectChange("provinceId")}
                    error={errors.provinceId}
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
                        onClick={fetchAllCities}
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
                    setValues({ id: String(city.id), name: city.name, provinceId: String(city.provinceId) });
                    setIsNewMode(false);
                    setIsEditing(false);
                    setIsViewAllOpen(false);
                }}
                onDelete={() => undefined}
            />
        </section>
    );
}

