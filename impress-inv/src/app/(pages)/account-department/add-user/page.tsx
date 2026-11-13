"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import api from "@/lib/axios";
import { userSchema, type UserFormValues } from "@/lib/validations/account";
import { usePermissions } from "@/hooks/usePermissions";
import toast from "react-hot-toast";
import { ROLES, USERS, PERMISSIONS } from "@/utlis/apiRoutes";
import useDebounce from "@/hooks/useDebounce";

import { LabeledField } from "@/components/ui/LabeledField";
import { LabeledSelect } from "@/components/ui/LabeledSelect";
import { ViewAllModal, type ViewAllColumn } from "@/components/ui/ViewAllModal";
import { Button } from "@/components/ui/Button";

type UserRow = {
    id: number;
    name: string;
    email: string;
    role: string | null;
    roleId?: number;
    permissions?: Array<{ id: number; name: string }>;
    [key: string]: unknown;
};

type ApiError = {
    response?: {
        status?: number;
        data?: { message?: string };
    };
};

const initialValues: UserFormValues = {
    id: "",
    name: "",
    email: "",
    password: "",
    role: "",
    permissionIds: [],
};

export default function AddUserPage() {
    const [isNewMode, setIsNewMode] = useState(true);
    const [isEditing, setIsEditing] = useState(true);

    const [rolesData, setRolesData] = useState<any[]>([]);
    const [permissionsData, setPermissionsData] = useState<any>(null);

    const { hasPermission, user: currentUser } = usePermissions();
    const canCreate = hasPermission("user", "create");
    const canUpdate = hasPermission("user", "update");
    const canView = hasPermission("user", "view");

    const [isIdLoading, setIsIdLoading] = useState(true);
    const [nextId, setNextId] = useState("");
    const [isViewAllOpen, setIsViewAllOpen] = useState(false);
    const [users, setUsers] = useState<UserRow[]>([]);
    const [hasLoadedUsers, setHasLoadedUsers] = useState(false);
    const [isUsersLoading, setIsUsersLoading] = useState(false);
    const [usersError, setUsersError] = useState("");
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
    } = useForm<UserFormValues>({ defaultValues: initialValues });
    const values = watch();

    const fetchData = async () => {
        try {
            const [rolesRes, permsRes] = await Promise.all([
                api.get(ROLES),
                api.get(PERMISSIONS),
            ]);
            setRolesData(rolesRes.data.data || []);
            setPermissionsData(permsRes.data.data || null);
        } catch (error) {
            console.error("Failed to fetch roles / permissions data", error);
        }
    };

    const fetchNextId = async () => {
        setIsIdLoading(true);
        try {
            const { data } = await api.get(`${USERS}/next-id`, {
                params: { _ts: Date.now() },
            });
            const fetchedNextId = String(data.data.nextId);
            setNextId(fetchedNextId);
            skipNextIdLookup.current = true;
            reset({ ...initialValues, id: fetchedNextId });
            setIsNewMode(true);
            setIsEditing(true);
        } catch (error) {
            console.error("Failed to fetch next user ID", error);
        } finally {
            setIsIdLoading(false);
        }
    };

    const mapUserToForm = (u: any): UserFormValues => {
        const matchingRoleId = rolesData.find((r) => r.name === u.role || String(r.id) === String(u.roleId))?.id;
        return {
            id: String(u.id),
            name: u.name || "",
            email: u.email || "",
            password: "",
            role: matchingRoleId ? String(matchingRoleId) : String(u.roleId || ""),
            permissionIds: (u.permissions || []).map((p: any) => String(p.id)),
        };
    };

    const fetchAllUsers = async (openModal = true, force = false) => {
        if (openModal) setIsViewAllOpen(true);
        if (hasLoadedUsers && !force) return;

        setIsUsersLoading(true);
        setUsersError("");
        try {
            const { data } = await api.get(USERS);
            setUsers(data.data || []);
            setHasLoadedUsers(true);
        } catch (error: unknown) {
            const apiError = error as ApiError;
            setUsersError(apiError.response?.data?.message || "Failed to fetch users");
        } finally {
            setIsUsersLoading(false);
        }
    };

    const addUserToCache = (item: UserRow) => {
        setUsers((current) => {
            const existingIndex = current.findIndex(
                (c) => String(c.id) === String(item.id)
            );
            if (existingIndex === -1) return [...current, item];
            return current.map((c, index) => (index === existingIndex ? item : c));
        });
        setHasLoadedUsers(true);
    };

    useEffect(() => {
        void fetchNextId();
        void fetchData();
        void fetchAllUsers(false);
    }, []);

    const roleOptions = [
        { label: "Select a role", value: "" },
        ...(rolesData?.map((r: any) => ({ label: r.name, value: String(r.id) })) || []),
    ];

    const formatLabel = (str: string) => {
        if (!str) return "";
        return str
            .split("_")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(" ");
    };

    const isSelfUpdate = !isNewMode && !!currentUser && String(currentUser.id) === String(values.id);

    const onSubmit = async (data: UserFormValues) => {
        const validationResult = userSchema.safeParse(data);
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
            email: data.email,
            password: data.password,
            roleId: data.role,
            permissionIds: data.permissionIds.map(Number),
        };

        try {
            const response = isNewMode
                ? await api.post(USERS, payload)
                : await api.put(`${USERS}/${data.id}`, payload);

            toast.success(response.data.message || "User saved successfully");
            if (hasLoadedUsers) {
                setHasLoadedUsers(false);
                await fetchAllUsers(false, true);
            }
            refreshNextIdAfterSubmit.current = true;
        } catch (error: unknown) {
            const apiError = error as ApiError;
            console.error("User save failed:", apiError.response?.data || error);
            toast.error(apiError.response?.data?.message || "Failed to save user");
        }
    };

    useEffect(() => {
        if (!isSubmitting && refreshNextIdAfterSubmit.current) {
            refreshNextIdAfterSubmit.current = false;
            void fetchNextId();
        }
    }, [isSubmitting]);

    const debouncedId = useDebounce(values.id, 500);
    const userColumns: ViewAllColumn<UserRow>[] = [
        { key: "id", header: "User ID" },
        { key: "name", header: "Name" },
        { key: "email", header: "Email" },
        { key: "role", header: "Role" },
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
                toast.error("You do not have permission to view or search for users.");
                resetToNextId();
                return;
            }

            setIsIdLoading(true);
            try {
                const cached = users.find((item) => String(item.id) === debouncedId);
                const u = cached || (await api.get(`${USERS}/${debouncedId}`)).data.data;

                if (!u) {
                    toast.error("User not found");
                    resetToNextId();
                    return;
                }

                if (!cached) addUserToCache(u);
                reset(mapUserToForm(u));
                setIsNewMode(false);
                setIsEditing(false);
                toast.success("User found");
            } catch (error: unknown) {
                const apiError = error as ApiError;
                toast.error(
                    apiError.response?.status === 403
                        ? apiError.response?.data?.message || "Access denied. You do not have permission."
                        : "User not found"
                );
                resetToNextId();
            } finally {
                setIsIdLoading(false);
            }
        };

        void fetchDebouncedId();
    }, [debouncedId, nextId, canView, users, rolesData]);

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
                User Registration
            </h1>

            <form onSubmit={handleSubmit(onSubmit)} noValidate>
                {/* Top Section */}
                <div className="flex flex-col md:flex-row justify-between items-start gap-10">
                    <div className="flex-1 w-full space-y-1.5">
                        <LabeledField
                            type={isIdLoading ? "text" : "number"}
                            label="User ID"
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
                            label="Name"
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
                        <LabeledField
                            type="email"
                            label="Email"
                            value={values.email}
                            onChange={(e) =>
                                setValue("email", e.target.value, {
                                    shouldDirty: true,
                                    shouldValidate: true,
                                })
                            }
                            error={errors.email?.message}
                            disabled={!isEditing}
                        />
                        <LabeledField
                            type="password"
                            label="Password"
                            placeholder={!isNewMode ? "Leave blank to keep same" : ""}
                            value={values.password || ""}
                            onChange={(e) =>
                                setValue("password", e.target.value, {
                                    shouldDirty: true,
                                    shouldValidate: true,
                                })
                            }
                            error={errors.password?.message}
                            disabled={!isEditing}
                        />
                        <LabeledSelect
                            label="Role"
                            options={roleOptions}
                            value={values.role}
                            onChange={(val) =>
                                setValue("role", val, {
                                    shouldDirty: true,
                                    shouldValidate: true,
                                })
                            }
                            error={errors.role?.message}
                            disabled={!isEditing || !!isSelfUpdate}
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
                            onClick={() => fetchAllUsers()}
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
                            Extra Permissions
                        </span>
                        {isSelfUpdate && (
                            <span className="text-xs text-red-500 font-medium ml-2">
                                (You cannot modify your own role or permissions)
                            </span>
                        )}
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
                                        const lockedValues =
                                            rolesData
                                                ?.find((r: any) => String(r.id) === values.role)
                                                ?.permissions?.map((p: any) =>
                                                    String(p.permission?.id || p.permissionId || p.id)
                                                ) || [];

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
                                                        const isLocked = lockedValues.includes(pid);
                                                        const isChecked =
                                                            values.permissionIds?.includes(pid) ||
                                                            isLocked;
                                                        return (
                                                            <td key={action} className={tdClass}>
                                                                <input
                                                                    type="checkbox"
                                                                    disabled={
                                                                        !isEditing ||
                                                                        isLocked ||
                                                                        isSelfUpdate
                                                                    }
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
                                                                    title={
                                                                        isLocked
                                                                            ? "Inherited from Role"
                                                                            : ""
                                                                    }
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
                title="All Users"
                rows={users}
                columns={userColumns}
                searchKeys={["id", "name", "email", "role"]}
                isLoading={isUsersLoading}
                error={usersError}
                onClose={() => setIsViewAllOpen(false)}
                onRowSelect={(item) => {
                    reset(mapUserToForm(item));
                    setIsNewMode(false);
                    setIsEditing(false);
                    setIsViewAllOpen(false);
                }}
                onDelete={() => undefined}
            />
        </section>
    );
}
