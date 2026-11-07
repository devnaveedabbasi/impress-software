"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import api from "@/lib/axios";
import { roleSchema, type RoleFormValues } from "@/lib/validations/account";
import { usePermissions } from "@/hooks/usePermissions";
import toast from "react-hot-toast";
import { PERMISSIONS, ROLES } from "@/utlis/apiRoutes";
import useDebounce from "@/hooks/useDebounce";
import { LabeledField } from "@/components/ui/LabeledField";
import { ViewAllModal, type ViewAllColumn } from "@/components/ui/ViewAllModal";
import { Button } from "@/components/ui/Button";

type RoleRow = {
    id: number;
    name: string;
    permissions?: Array<{ permission: { id: number; name: string } }>;
    [key: string]: unknown;
};

type ApiError = {
    response?: {
        status?: number;
        data?: { message?: string };
    };
};

const initialValues: RoleFormValues = {
    id: "",
    name: "",
    permissionIds: [],
};

export default function AddRolePage() {
    const [isNewMode, setIsNewMode] = useState(true);
    const [isEditing, setIsEditing] = useState(true);
    const [permissionsData, setPermissionsData] = useState<any>(null);

    const { hasPermission } = usePermissions();
    const canCreate = hasPermission("role", "create");
    const canUpdate = hasPermission("role", "update");
    const canView = hasPermission("role", "view");

    const [isIdLoading, setIsIdLoading] = useState(true);
    const [nextId, setNextId] = useState("");
    const [isViewAllOpen, setIsViewAllOpen] = useState(false);
    const [roles, setRoles] = useState<RoleRow[]>([]);
    const [hasLoadedRoles, setHasLoadedRoles] = useState(false);
    const [isRolesLoading, setIsRolesLoading] = useState(false);
    const [rolesError, setRolesError] = useState("");
    const skipNextIdLookup = useRef(false);
    const refreshNextIdAfterSubmit = useRef(false);

    const [searchQuery, setSearchQuery] = useState("");
    const debouncedSearchQuery = useDebounce(searchQuery, 300);

    const {
        handleSubmit,
        reset,
        setError,
        clearErrors,
        setValue,
        watch,
        formState: { errors, isSubmitting },
    } = useForm<RoleFormValues>({ defaultValues: initialValues });
    const values = watch();

    const fetchPermissions = async () => {
        try {
            const { data } = await api.get(PERMISSIONS);
            setPermissionsData(data.data);
        } catch (error) {
            console.error("Failed to fetch permissions", error);
        }
    };

    const fetchNextId = async () => {
        setIsIdLoading(true);
        try {
            const { data } = await api.get(`${ROLES}/next-id`, {
                params: { _ts: Date.now() },
            });
            const fetchedNextId = String(data.data.nextId);
            setNextId(fetchedNextId);
            skipNextIdLookup.current = true;
            reset({ ...initialValues, id: fetchedNextId });
            setIsNewMode(true);
            setIsEditing(true);
        } catch (error) {
            console.error("Failed to fetch next role ID", error);
        } finally {
            setIsIdLoading(false);
        }
    };

    const mapRoleToForm = (r: any): RoleFormValues => ({
        id: String(r.id),
        name: r.name || "",
        permissionIds: (r.permissions || []).map((p: any) => String(p.permission?.id || p.permissionId || p.id)),
    });

    const fetchAllRoles = async (openModal = true, force = false) => {
        if (openModal) setIsViewAllOpen(true);
        if (hasLoadedRoles && !force) return;

        setIsRolesLoading(true);
        setRolesError("");
        try {
            const { data } = await api.get(ROLES);
            setRoles(data.data || []);
            setHasLoadedRoles(true);
        } catch (error: unknown) {
            const apiError = error as ApiError;
            setRolesError(apiError.response?.data?.message || "Failed to fetch roles");
        } finally {
            setIsRolesLoading(false);
        }
    };

    const addRoleToCache = (item: RoleRow) => {
        setRoles((current) => {
            const existingIndex = current.findIndex(
                (c) => String(c.id) === String(item.id)
            );
            if (existingIndex === -1) return [...current, item];
            return current.map((c, index) => (index === existingIndex ? item : c));
        });
        setHasLoadedRoles(true);
    };

    useEffect(() => {
        void fetchNextId();
        void fetchPermissions();
        void fetchAllRoles(false);
    }, []);

    const formatLabel = (str: string) => {
        if (!str) return "";
        return str
            .split("_")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(" ");
    };

    const onSubmit = async (data: RoleFormValues) => {
        const validationResult = roleSchema.safeParse(data);
        if (!validationResult.success) {
            clearErrors();
            validationResult.error.issues.forEach((issue) => {
                const field = issue.path[0];
                if (typeof field === "string") {
                    setError(field as any, {
                        type: "manual",
                        message: issue.message,
                    });
                }
            });
            return;
        }

        const payload = {
            name: data.name,
            permissionIds: data.permissionIds.map(Number),
        };

        try {
            const response = isNewMode
                ? await api.post(ROLES, payload)
                : await api.put(`${ROLES}/${data.id}`, payload);

            toast.success(response.data.message || "Role saved successfully");
            if (hasLoadedRoles) {
                setHasLoadedRoles(false);
                await fetchAllRoles(false, true);
            }
            refreshNextIdAfterSubmit.current = true;
        } catch (error: unknown) {
            const apiError = error as ApiError;
            console.error("Role save failed:", apiError.response?.data || error);
            toast.error(apiError.response?.data?.message || "Failed to save role");
        }
    };

    useEffect(() => {
        if (!isSubmitting && refreshNextIdAfterSubmit.current) {
            refreshNextIdAfterSubmit.current = false;
            void fetchNextId();
        }
    }, [isSubmitting]);

    const debouncedId = useDebounce(values.id, 500);
    const roleColumns: ViewAllColumn<RoleRow>[] = [
        { key: "id", header: "Role ID" },
        { key: "name", header: "Role Name" },
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
                toast.error("You do not have permission to view or search for roles.");
                resetToNextId();
                return;
            }

            setIsIdLoading(true);
            try {
                const cached = roles.find((item) => String(item.id) === debouncedId);
                const r = cached || (await api.get(`${ROLES}/${debouncedId}`)).data.data;

                if (!r) {
                    toast.error("Role not found");
                    resetToNextId();
                    return;
                }

                if (!cached) addRoleToCache(r);
                reset(mapRoleToForm(r));
                setIsNewMode(false);
                setIsEditing(false);
                toast.success("Role found");
            } catch (error: unknown) {
                const apiError = error as ApiError;
                toast.error(
                    apiError.response?.status === 403
                        ? apiError.response?.data?.message || "Access denied. You do not have permission."
                        : "Role not found"
                );
                resetToNextId();
            } finally {
                setIsIdLoading(false);
            }
        };

        void fetchDebouncedId();
    }, [debouncedId, nextId, canView, roles]);

    const filteredPermissions = permissionsData
        ? Object.entries(permissionsData).reduce((acc: any, [key, module]: [string, any]) => {
              const groupName = formatLabel(module.operation);
              const searchLower = debouncedSearchQuery.trim().toLowerCase();

              if (groupName.toLowerCase().includes(searchLower)) {
                  acc[key] = module;
                  return acc;
              }

              const matchedPerms = module.permissions.filter((p: any) =>
                  formatLabel(p.name).toLowerCase().includes(searchLower)
              );
              if (matchedPerms.length > 0) {
                  acc[key] = { ...module, permissions: matchedPerms };
              }
              return acc;
          }, {})
        : null;

    return (
        <section className="mx-auto mt-10 w-full max-w-4xl bg-[#f0f0f0] p-8 shadow-sm">
            <h1 className="mb-10 text-center text-4xl text-black tracking-wide">
                Role Management
            </h1>

            <form onSubmit={handleSubmit(onSubmit)} noValidate>
                {/* Top Section */}
                <div className="flex flex-col md:flex-row justify-between items-start gap-10">
                    <div className="flex-1 w-full space-y-1.5">
                        <LabeledField
                            type={isIdLoading ? "text" : "number"}
                            label="Role ID"
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
                            wrapperClassName="max-w-[200px]"
                        />
                        <LabeledField
                            label="Role Name"
                            value={values.name}
                            onChange={(e) =>
                                setValue("name", e.target.value, {
                                    shouldDirty: true,
                                    shouldValidate: true,
                                })
                            }
                            error={errors.name?.message}
                            disabled={!isEditing}
                        />
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap md:flex-col gap-2 shrink-0">
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
                            onClick={() => fetchAllRoles()}
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
                            disabled={isEditing || isNewMode || !canUpdate}
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
                </div>

                {/* Information Divider */}
                <div className="flex items-center justify-between gap-3 mb-4 mt-6">
                    <div className="flex items-center gap-3 flex-1">
                        <span className="text-[14px] text-zinc-900 font-normal whitespace-nowrap">
                            Permissions
                        </span>
                        <div className="flex-1 h-[1px] bg-zinc-500"></div>
                    </div>
                    <input
                        type="text"
                        placeholder="Search permissions..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                            }
                        }}
                        className="border border-zinc-300 px-3 py-1 outline-none text-sm w-64 text-black bg-white"
                    />
                </div>

                {/* Permissions Section */}
                <div className="bg-white border border-zinc-300 min-h-[200px] overflow-x-auto">
                    {filteredPermissions ? (
                        <table className="w-full text-left text-sm text-zinc-700 border-collapse">
                            <thead className="bg-zinc-100 border-b border-zinc-300">
                                <tr>
                                    <th className="px-4 py-2 font-semibold border-r border-zinc-300 w-1/3">
                                        Module
                                    </th>
                                    <th className="px-4 py-2 font-semibold text-center border-r border-zinc-300">
                                        View
                                    </th>
                                    <th className="px-4 py-2 font-semibold text-center border-r border-zinc-300">
                                        Create
                                    </th>
                                    <th className="px-4 py-2 font-semibold text-center border-r border-zinc-300">
                                        Update
                                    </th>
                                    <th className="px-4 py-2 font-semibold text-center">Delete</th>
                                </tr>
                            </thead>
                            <tbody>
                                {Object.values(filteredPermissions).length > 0 ? (
                                    Object.values(filteredPermissions).map((module: any) => {
                                        const groupName = formatLabel(module.operation);
                                        const getPerm = (action: string) =>
                                            module.permissions.find((p: any) => p.name === action);

                                        return (
                                            <tr
                                                key={module.operation}
                                                className="border-b border-zinc-200 hover:bg-zinc-50"
                                            >
                                                <td className="px-4 py-2 font-medium border-r border-zinc-200">
                                                    {groupName}
                                                </td>
                                                {["view", "create", "update", "delete"].map(
                                                    (action, index) => {
                                                        const p = getPerm(action);
                                                        const isLast = index === 3;
                                                        const tdClass = `px-4 py-2 text-center ${
                                                            !isLast ? "border-r border-zinc-200" : ""
                                                        }`;

                                                        if (!p)
                                                            return (
                                                                <td
                                                                    key={action}
                                                                    className={`${tdClass} text-zinc-400`}
                                                                >
                                                                    -
                                                                </td>
                                                            );

                                                        const pid = String(p.id);
                                                        const isChecked =
                                                            values.permissionIds?.includes(pid);
                                                        return (
                                                            <td key={action} className={tdClass}>
                                                                <input
                                                                    type="checkbox"
                                                                    disabled={!isEditing}
                                                                    checked={isChecked}
                                                                    onChange={(e) => {
                                                                        const current =
                                                                            values.permissionIds || [];
                                                                        if (e.target.checked) {
                                                                            setValue(
                                                                                "permissionIds",
                                                                                [...current, pid],
                                                                                {
                                                                                    shouldDirty: true,
                                                                                    shouldValidate: true,
                                                                                }
                                                                            );
                                                                        } else {
                                                                            setValue(
                                                                                "permissionIds",
                                                                                current.filter(
                                                                                    (id: string) =>
                                                                                        id !== pid
                                                                                ),
                                                                                {
                                                                                    shouldDirty: true,
                                                                                    shouldValidate: true,
                                                                                }
                                                                            );
                                                                        }
                                                                    }}
                                                                    className="cursor-pointer mx-auto w-4 h-4 accent-zinc-800"
                                                                />
                                                            </td>
                                                        );
                                                    }
                                                )}
                                            </tr>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td
                                            colSpan={5}
                                            className="py-4 text-center text-sm text-zinc-500"
                                        >
                                            No permissions match your search.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    ) : (
                        <p className="p-4 text-sm text-zinc-500">Loading permissions...</p>
                    )}
                    {errors.permissionIds && (
                        <p className="p-4 mt-2 text-xs text-red-500">
                            {errors.permissionIds.message}
                        </p>
                    )}
                </div>
            </form>

            <ViewAllModal
                key={isViewAllOpen ? "open" : "closed"}
                isOpen={isViewAllOpen}
                title="All Roles"
                rows={roles}
                columns={roleColumns}
                searchKeys={["id", "name"]}
                isLoading={isRolesLoading}
                error={rolesError}
                onClose={() => setIsViewAllOpen(false)}
                onRowSelect={(item) => {
                    reset(mapRoleToForm(item));
                    setIsNewMode(false);
                    setIsEditing(false);
                    setIsViewAllOpen(false);
                }}
                onDelete={() => undefined}
            />
        </section>
    );
}
