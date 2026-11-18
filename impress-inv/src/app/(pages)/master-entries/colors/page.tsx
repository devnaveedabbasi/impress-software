"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { LabeledField } from "@/components/ui/LabeledField";
import { Button } from "@/components/ui/Button";
import useDebounce from "@/hooks/useDebounce";
import { colorSchema, type ColorFormValues } from "@/lib/validations/master";
import { COLORS } from "@/utlis/apiRoutes";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import { usePermissions } from "@/hooks/usePermissions";
import type { ViewAllColumn } from "@/components/ui/ViewAllModal";
import { InfiniteViewAllModal, useRefreshMasterList } from "@/components/ui/InfiniteViewAllModal";
import { EntryActions } from "@/components/ui/EntryActions";
import { useMasterRecord } from "@/hooks/useMasterRecord";

type ColorRow = {
    id: number;
    name: string;
};

type ApiError = {
    response?: {
        status?: number;
        data?: { message?: string };
    };
};

const initialValues: ColorFormValues = {
    id: "",
    name: "",
};

export default function ColorPage() {
    const [isNewMode, setIsNewMode] = useState(true);
    const [isEditing, setIsEditing] = useState(true);
    const { hasPermission } = usePermissions();
    const canCreate = hasPermission("color", "create");
    const canUpdate = hasPermission("color", "update");
    const canView = hasPermission("color", "view");
    const [isIdLoading, setIsIdLoading] = useState(true);
    const [nextId, setNextId] = useState("");
    const [isViewAllOpen, setIsViewAllOpen] = useState(false);
    const refreshList = useRefreshMasterList("colors");
    const { fetchOne, prefetchNear } = useMasterRecord("colors", COLORS);
    const [colors, setColors] = useState<ColorRow[]>([]);
    const skipNextIdLookup = useRef(false);

    const {
        handleSubmit,
        reset,
        setError,
        clearErrors,
        setValue,
        watch,
        formState: { errors, isSubmitting },
    } = useForm<ColorFormValues>({ defaultValues: initialValues });
    const values = watch();

    const fetchNextId = async () => {
        setIsIdLoading(true);
        try {
            const { data } = await api.get(`${COLORS}/next-id`, {
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

    const addColorToCache = (color: ColorRow) => {
        setColors((current) => {
            const existingIndex = current.findIndex(
                (item) => String(item.id) === String(color.id)
            );
            if (existingIndex === -1) return [...current, color];
            return current.map((item, index) =>
                index === existingIndex ? color : item
            );
        });
    };

    useEffect(() => {
        void fetchNextId();
    }, []);

    const onSubmit = async (data: ColorFormValues) => {
        const validationResult = colorSchema.safeParse(data);
        if (!validationResult.success) {
            clearErrors();
            validationResult.error.issues.forEach((issue) => {
                const field = issue.path[0];
                if (typeof field === "string") {
                    setError(field as keyof ColorFormValues, {
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
                ? await api.post(COLORS, payload)
                : await api.put(`${COLORS}/${validationResult.data.id}`, payload);

            toast.success(response.data.message || "Color saved successfully");
            setColors([]); // the looked-up copies are old now
            void refreshList();
            // After Save the record stays on the screen (it does not jump to the next new one: the New button does that).
            // Only the next number is read again, quietly, so a new record still gets the right number.
            setIsNewMode(false);
            setIsEditing(false);
            skipNextIdLookup.current = true;
            void api
                .get(`${COLORS}/next-id`, { params: { _ts: Date.now() } })
                .then(({ data }) => setNextId(String(data.data.nextId)))
                .catch(() => {
                    skipNextIdLookup.current = false;
                });
        } catch (error: unknown) {
            const apiError = error as ApiError;
            console.error("Color save failed:", apiError.response?.data || error);
            toast.error(apiError.response?.data?.message || "Failed to save color");
        }
    };

    const debouncedId = useDebounce(values.id, 500);
    const colorColumns: ViewAllColumn<ColorRow>[] = [
        { key: "id", header: "Color ID" },
        { key: "name", header: "Color Name" },
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
                const cached = colors.find((c) => String(c.id) === debouncedId);
                const color = cached || (await fetchOne(debouncedId));
                prefetchNear(debouncedId, Number(nextId));

                if (!color) {
                    toast.error("Color not found");
                    resetToNextId();
                    return;
                }

                if (!cached) addColorToCache(color);
                reset({
                    id: String(color.id),
                    name: color.name,
                });
                setIsNewMode(false);
                setIsEditing(false);
            } catch (error: unknown) {
                const apiError = error as ApiError;
                toast.error(
                    apiError.response?.status === 403
                        ? apiError.response?.data?.message || "Access denied. You do not have permission."
                        : "Invalid Color ID"
                );
                resetToNextId();
            } finally {
                setIsIdLoading(false);
            }
        };

        void fetchDebouncedId();
    }, [debouncedId, nextId, canView, colors]);

    return (
        <section className="mx-auto mt-10 w-full max-w-110 bg-form-bg p-6 shadow-xl sm:p-8">
            <h1 className="mb-6 text-center text-2xl font-bold text-zinc-900 sm:text-3xl">
                Color Entry
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
                <LabeledField
                    type="number"
                    label="Color ID"
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
                    min={1}
                    max={Number(nextId) || 1}
                />
                <LabeledField
                    label="Color Name"
                    value={values.name}
                    onChange={(event) =>
                        setValue("name", event.target.value, {
                            shouldDirty: true,
                            shouldValidate: true,
                        })
                    }
                    error={errors.name?.message}
                    disabled={!isEditing}
                    maxLength={50}
                />

                <EntryActions
                    onNew={fetchNextId}
                    newDisabled={isSubmitting || !canCreate}
                    onViewAll={() => setIsViewAllOpen(true)}
                    viewAllDisabled={isSubmitting || !canView}
                    onEdit={() => setIsEditing(true)}
                    editDisabled={isSubmitting || isNewMode || isEditing || !canUpdate}
                    saveLoading={isSubmitting}
                    saveDisabled={!isEditing || (isNewMode ? !canCreate : !canUpdate)}
                />
            </form>

            <InfiniteViewAllModal
                isOpen={isViewAllOpen}
                title="All Colors"
                endpoint={COLORS}
                name="colors"
                columns={colorColumns}
                onClose={() => setIsViewAllOpen(false)}
                onRowSelect={(color) => {
                    reset({
                        id: String(color.id),
                        name: color.name,
                    });
                    setIsNewMode(false);
                    setIsEditing(false);
                    setIsViewAllOpen(false);
                }}
            />
        </section>
    );
}
