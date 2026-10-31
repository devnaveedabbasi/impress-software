"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LabeledField } from "@/components/ui/LabeledField";
import { Button } from "@/components/ui/Button";
import { useForm } from "@/hooks/useForm";
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

const initialValues: ProvinceFormValues = {
    id: "",
    name: "",
};

export default function ProvincePage() {
    const router = useRouter();
    const [isNewMode, setIsNewMode] = useState(true);
    const [isEditing, setIsEditing] = useState(true);
    const { hasPermission } = usePermissions();
    const canCreate = hasPermission("province", "create");
    const canUpdate = hasPermission("province", "update");
    const canView = hasPermission("province", "view");
    const [isIdLoading, setIsIdLoading] = useState(true);
    const [nextId, setNextId] = useState<string>("");
    const [isViewAllOpen, setIsViewAllOpen] = useState(false);
    const [provinces, setProvinces] = useState<ProvinceRow[]>([]);
    const [isProvincesLoading, setIsProvincesLoading] = useState(false);
    const [provincesError, setProvincesError] = useState("");


    const fetchNextId = async () => {
        setIsIdLoading(true);
        try {
            const { data } = await api.get(`${PROVINCES}/next-id`);
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

    const fetchAllProvinces = async () => {
        setIsViewAllOpen(true);
        setIsProvincesLoading(true);
        setProvincesError("");
        try {
            const { data } = await api.get(PROVINCES);
            setProvinces(data.data || []);
        } catch (error: any) {
            setProvincesError(error.response?.data?.message || "Failed to fetch provinces");
        } finally {
            setIsProvincesLoading(false);
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
        validationSchema: provinceSchema,
        onSubmit: async (data) => {
            try {
                if (isNewMode) {
                    const response = await api.post(PROVINCES, { name: data.name });
                    toast.success(response.data.message || "Province created successfully");
                } else {
                    const response = await api.put(`${PROVINCES}/${data.id}`, { name: data.name });
                    toast.success(response.data.message || "Province updated successfully");
                }
                fetchNextId();
            } catch (error: any) {
                toast.error(error.response?.data?.message || "Failed to save province");
                throw error;
            }
        },
    });

    
    const debouncedId = useDebounce(values?.id, 500);

    const provinceColumns: ViewAllColumn<ProvinceRow>[] = [
        { key: "id", header: "Province ID" },
        { key: "name", header: "Province Name" },
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

        try {
            const { data } = await api.get(`${PROVINCES}/${debouncedId}`);
            if (data.data) {
                setValues({ id: String(data.data.id), name: data.data.name });
                setIsNewMode(false);
                setIsEditing(false);
                toast.success("Province found");
            } else {
                toast.error("Province not found");
                setValues({ ...initialValues, id: nextId });
                setIsNewMode(true);
            }
        } catch (error: any) {
            if (error.response?.status === 403) {
                toast.error(error.response?.data?.message || "Access denied. You do not have permission.");
            } else {
                toast.error("Invalid Province ID");
            }
            setValues({ ...initialValues, id: nextId });
            setIsNewMode(true);
        }
    }
        fetchDebouncedId();
    }, [debouncedId]);;

    return (
        <section className="mx-auto mt-10 w-full max-w-110 bg-form-bg p-6 shadow-xl sm:p-8">
            <h1 className="mb-6 text-center text-2xl font-bold text-zinc-900 sm:text-3xl">Province Entry</h1>

            <form onSubmit={handleSubmit} noValidate className="space-y-3">
                <LabeledField
                    type={isIdLoading ? "text" : "number"}
                    label="Province ID"
                    value={isIdLoading ? "Loading..." : values.id || ""}
                    onChange={handleInputChange("id")}
                    error={errors.id}
                    disabled={isIdLoading}
                min={1}
                    max={Number(nextId) || 1}
                />
                <LabeledField
                    label="Province Name"
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
                        onClick={fetchAllProvinces}
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
                    setValues({ id: String(province.id), name: province.name });
                    setIsNewMode(false);
                    setIsEditing(false);
                    setIsViewAllOpen(false);
                }}
                onDelete={() => undefined}
            />
        </section>
    );
}

