"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import api from "@/lib/axios";
import { adminSchema, type AdminFormValues } from "@/lib/validations/account";
import { usePermissions } from "@/hooks/usePermissions";
import toast from "react-hot-toast";
import { ADMINS, PERMISSIONS } from "@/utlis/apiRoutes";
import useDebounce from "@/hooks/useDebounce";

import { LabeledField } from "@/components/ui/LabeledField";
import { ViewAllModal, type ViewAllColumn } from "@/components/ui/ViewAllModal";
import { Button } from "@/components/ui/Button";

type AdminRow = {
    id: number;
    name: string;
    email: string;
    role: "SUPER_ADMIN" | "ADMIN";
    roleLabel: string;
    permissions?: Array<{ id: number; name: string; operation: string }>;
    [key: string]: unknown;
};

type ApiError = {
    response?: {
        status?: number;
        data?: { message?: string };
    };
};

const initialValues: AdminFormValues = {
    id: "",
    name: "",
    email: "",
    password: "",
    role: "ADMIN",
    permissionIds: [],
};

const formatLabel = (str: string) =>
    str
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(" ");

// Only a Super Admin can open this page: it creates admins and decides which permissions an admin has.
export default function AdminsPage() {
    const { isSuperAdmin, user: currentUser } = usePermissions();

    const [isNewMode, setIsNewMode] = useState(true);
    const [isEditing, setIsEditing] = useState(true);
    const [permissionsData, setPermissionsData] = useState<any>(null);

    const [isIdLoading, setIsIdLoading] = useState(true);
    const [nextId, setNextId] = useState("");
    const [isViewAllOpen, setIsViewAllOpen] = useState(false);
    const [admins, setAdmins] = useState<AdminRow[]>([]);
    const [hasLoadedAdmins, setHasLoadedAdmins] = useState(false);
    const [isAdminsLoading, setIsAdminsLoading] = useState(false);
    const [adminsError, setAdminsError] = useState("");
    const skipNextIdLookup = useRef(false);

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
    } = useForm<AdminFormValues>({ defaultValues: initialValues });
    const values = watch();

    // An error goes away as soon as the user changes that field, it does not stay red until the next Save
    useEffect(() => {
        const subscription = watch((_, { name }) => {
            if (name) clearErrors(name.split(".")[0] as keyof AdminFormValues);
        });
        return () => subscription.unsubscribe();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [watch, clearErrors]);
    const [selectedPermissionIds, setSelectedPermissionIds] = useState<string[]>([]);

    useEffect(() => {
        setSelectedPermissionIds(values.permissionIds || []);
    }, [values.id]);

    const permissionDependencies: Record<string, string[]> = {
        "city:create": ["province:view"],
        "city:update": ["province:view"],
        "dealer:create": ["province:view", "city:view"],
        "dealer:update": ["province:view", "city:view"],
        "vendor:create": ["province:view", "city:view"],
        "vendor:update": ["province:view", "city:view"],
        "inventory:create": ["category:view", "department:view", "station:view", "color:view"],
        "inventory:update": ["category:view", "department:view", "station:view", "color:view"],
    };

    const permissionEntries = permissionsData
        ? Object.values(permissionsData).flatMap((module: any) =>
              module.permissions.map((permission: any) => ({
                  ...permission,
                  key: `${module.operation}:${permission.name}`,
              }))
          )
        : [];
    const permissionIdsByKey = new Map(
        permissionEntries.map((permission: any) => [permission.key, String(permission.id)])
    );

    const expandPermissionIds = (permissionIds: string[]) => {
        const expanded = new Set(permissionIds);
        let changed = true;
        while (changed) {
            changed = false;
            for (const permission of permissionEntries) {
                if (!expanded.has(String(permission.id))) continue;
                for (const dependency of permissionDependencies[permission.key] || []) {
                    const dependencyId = permissionIdsByKey.get(dependency);
                    if (dependencyId && !expanded.has(dependencyId)) {
                        expanded.add(dependencyId);
                        changed = true;
                    }
                }
            }
        }
        return Array.from(expanded);
    };

    const removePermissionIds = (permissionIds: string[], removedIds: string[]) => {
        const remaining = new Set(permissionIds);
        const removed = new Set(removedIds);
        let changed = true;
        while (changed) {
            changed = false;
            for (const permission of permissionEntries) {
                if (!remaining.has(String(permission.id))) continue;
                const dependencies = (permissionDependencies[permission.key] || [])
                    .map((key) => permissionIdsByKey.get(key))
                    .filter((id): id is string => Boolean(id));
                if (dependencies.some((id) => removed.has(id))) {
                    remaining.delete(String(permission.id));
                    removed.add(String(permission.id));
                    changed = true;
                }
            }
        }
        return Array.from(remaining);
    };

    const togglePermission = (permissionId: string, checked: boolean) => {
        setSelectedPermissionIds((current) => {
            const next = checked
                ? expandPermissionIds([...current, permissionId])
                : removePermissionIds(current, [permissionId]);
            setValue("permissionIds", next, { shouldDirty: true, shouldValidate: true });
            return next;
        });
    };

    // Unselect par sirf di gayi IDs hatti hain, dependency cascade nahi hoti
    const togglePermissionGroup = (permissionIds: string[], checked: boolean) => {
        setSelectedPermissionIds((current) => {
            const next = checked
                ? expandPermissionIds([...current, ...permissionIds])
                : current.filter((id) => !permissionIds.includes(id));
            setValue("permissionIds", next, { shouldDirty: true, shouldValidate: true });
            return next;
        });
    };

    const fetchPermissions = async () => {
        try {
            const { data } = await api.get(PERMISSIONS);
            setPermissionsData(data.data || null);
        } catch (error) {
            console.error("Failed to fetch permissions", error);
        }
    };

    const fetchNextId = async () => {
        setIsIdLoading(true);
        try {
            const { data } = await api.get(`${ADMINS}/next-id`, { params: { _ts: Date.now() } });
            const fetchedNextId = String(data.data.nextId);
            setNextId(fetchedNextId);
            skipNextIdLookup.current = true;
            reset({ ...initialValues, id: fetchedNextId });
            setIsNewMode(true);
            setIsEditing(true);
        } catch (error) {
            console.error("Failed to fetch next admin ID", error);
        } finally {
            setIsIdLoading(false);
        }
    };

    const mapAdminToForm = (a: AdminRow): AdminFormValues => ({
        id: String(a.id),
        name: a.name || "",
        email: a.email || "",
        password: "",
        role: a.role,
        permissionIds: (a.permissions || []).map((p) => String(p.id)),
    });

    const fetchAllAdmins = async (openModal = true, force = false) => {
        if (openModal) setIsViewAllOpen(true);
        if (hasLoadedAdmins && !force) return;

        setIsAdminsLoading(true);
        setAdminsError("");
        try {
            const { data } = await api.get(ADMINS);
            setAdmins(data.data || []);
            setHasLoadedAdmins(true);
        } catch (error: unknown) {
            const apiError = error as ApiError;
            setAdminsError(apiError.response?.data?.message || "Failed to fetch admins");
        } finally {
            setIsAdminsLoading(false);
        }
    };

    useEffect(() => {
        if (!isSuperAdmin) return;
        void fetchNextId();
        void fetchPermissions();
        void fetchAllAdmins(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isSuperAdmin]);

    const onSubmit = async (data: AdminFormValues) => {
        const validationResult = adminSchema.safeParse(data);
        if (!validationResult.success) {
            clearErrors();
            validationResult.error.issues.forEach((issue) => {
                const field = issue.path[0];
                if (typeof field === "string") {
                    setError(field as any, { type: "manual", message: issue.message });
                }
            });
            return;
        }

        const payload = {
            name: data.name,
            email: data.email,
            password: data.password,
            role: "ADMIN",
            permissionIds: data.permissionIds.map(Number),
        };

        try {
            const response = isNewMode
                ? await api.post(ADMINS, payload)
                : await api.put(`${ADMINS}/${data.id}`, payload);

            toast.success(response.data.message || "Admin saved successfully");
            setHasLoadedAdmins(false);
            await fetchAllAdmins(false, true);
            // After Save the record stays on the screen (it does not jump to the next new one: the New button does that).
            // Only the next number is read again, quietly, so a new record still gets the right number.
            setValue("password", ""); // the password is never kept on the screen
            setIsNewMode(false);
            setIsEditing(false);
            skipNextIdLookup.current = true;
            void api
                .get(`${ADMINS}/next-id`, { params: { _ts: Date.now() } })
                .then(({ data }) => setNextId(String(data.data.nextId)))
                .catch(() => {
                    skipNextIdLookup.current = false;
                });
        } catch (error: unknown) {
            const apiError = error as ApiError;
            toast.error(apiError.response?.data?.message || "Failed to save admin");
        }
    };

    const debouncedId = useDebounce(values.id, 500);
    const adminColumns: ViewAllColumn<AdminRow>[] = [
        { key: "id", header: "Admin ID" },
        { key: "name", header: "Name" },
        { key: "email", header: "Email" },
        { key: "roleLabel", header: "Role" },
    ];

    useEffect(() => {
        const lookup = async () => {
            if (!debouncedId || !isSuperAdmin) return;
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

            setIsIdLoading(true);
            try {
                const cached = admins.find((item) => String(item.id) === debouncedId);
                const found: AdminRow | undefined = cached || (await api.get(`${ADMINS}/${debouncedId}`)).data.data;
                if (!found) {
                    toast.error("Admin not found");
                    resetToNextId();
                    return;
                }
                reset(mapAdminToForm(found));
                setIsNewMode(false);
                setIsEditing(false);
                toast.success("Admin found");
            } catch {
                toast.error("Admin not found");
                resetToNextId();
            } finally {
                setIsIdLoading(false);
            }
        };

        void lookup();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debouncedId, nextId, admins, isSuperAdmin]);

    const filteredPermissions = permissionsData
        ? Object.entries(permissionsData).reduce((acc: any, [key, module]: [string, any]) => {
              const groupName = formatLabel(module.operation);
              const searchLower = debouncedSearchQuery.trim().toLowerCase();

              if (groupName.toLowerCase().includes(searchLower)) {
                  acc[key] = module;
                  return acc;
              }

              const matched = module.permissions.filter((p: any) => formatLabel(p.name).toLowerCase().includes(searchLower));
              if (matched.length > 0) acc[key] = { ...module, permissions: matched };
              return acc;
          }, {})
        : null;

    // Select All sirf filtered permissions par kaam kare
    const filteredPermissionIds = filteredPermissions
        ? Object.values(filteredPermissions).flatMap((module: any) =>
              module.permissions.map((permission: any) => String(permission.id))
          )
        : [];

    const allPermissionsSelected =
        filteredPermissionIds.length > 0 &&
        filteredPermissionIds.every((id) => selectedPermissionIds.includes(id));

    if (!isSuperAdmin) {
        return (
            <section className="mx-auto mt-10 w-full max-w-4xl bg-form-bg p-8 text-center shadow-sm">
                <h1 className="mb-4 text-center text-4xl text-black tracking-wide">Admins</h1>
                <p className="text-sm text-red-500">Only a super admin can manage admins.</p>
            </section>
        );
    }

    return (
        <section className="mx-auto mt-10 w-full max-w-4xl bg-form-bg p-8 shadow-sm">
            <h1 className="mb-10 text-center text-4xl text-black tracking-wide">Admin Registration</h1>

            <form
                onSubmit={(event) => {
                    // Clear stale manual errors, otherwise handleSubmit blocks onSubmit forever
                    clearErrors();
                    void handleSubmit(onSubmit)(event);
                }}
                noValidate
            >
                <div className="flex flex-col md:flex-row justify-between items-start gap-10">
                    <div className="flex-1 w-full space-y-1.5">
                        <LabeledField
                            type={isIdLoading ? "text" : "number"}
                            label="Admin ID"
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
                            onChange={(e) => setValue("name", e.target.value, { shouldDirty: true, shouldValidate: true })}
                            error={errors.name?.message}
                            disabled={!isEditing}
                        />
                        <LabeledField
                            type="email"
                            label="Email"
                            value={values.email}
                            onChange={(e) => setValue("email", e.target.value, { shouldDirty: true, shouldValidate: true })}
                            error={errors.email?.message}
                            disabled={!isEditing}
                        />
                        <LabeledField
                            type="password"
                            label="Password"
                            placeholder={!isNewMode ? "Leave blank to keep same" : ""}
                            value={values.password || ""}
                            onChange={(e) => setValue("password", e.target.value, { shouldDirty: true, shouldValidate: true })}
                            error={errors.password?.message}
                            disabled={!isEditing}
                        />
                        <div className="w-full">
                            <span className="mb-1 block text-sm text-zinc-600">Role</span>
                            <div className="rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
                                Admin
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap md:flex-col gap-2 shrink-0">
                        <Button
                            type="button"
                            variant="secondary"
                            shape="rounded"
                            onClick={fetchNextId}
                            disabled={isSubmitting}
                            className="border border-zinc-400 bg-white px-6 hover:bg-zinc-50"
                        >
                            New
                        </Button>
                        <Button
                            type="button"
                            variant="secondary"
                            shape="rounded"
                            onClick={() => fetchAllAdmins()}
                            disabled={isSubmitting}
                            className="border border-zinc-400 bg-white px-6 hover:bg-zinc-50"
                        >
                            View All
                        </Button>
                        <Button
                            type="button"
                            variant="secondary"
                            shape="rounded"
                            onClick={() => setIsEditing(true)}
                            disabled={isEditing || isNewMode}
                            className="border border-zinc-400 bg-white px-6 hover:bg-zinc-50"
                        >
                            Edit
                        </Button>
                        <Button
                            type="submit"
                            variant="secondary"
                            shape="rounded"
                            isLoading={isSubmitting}
                            disabled={!isEditing}
                            className="border border-zinc-400 bg-white px-8 hover:bg-zinc-50"
                        >
                            Save
                        </Button>
                    </div>
                </div>

                <div className="flex items-center justify-between gap-3 mb-4 mt-6">
                    <div className="flex items-center gap-3 flex-1">
                        <span className="text-[14px] text-zinc-900 font-normal whitespace-nowrap">Permissions</span>
                        <div className="flex-1 h-[1px] bg-zinc-500"></div>
                    </div>
                    <input
                        type="text"
                        placeholder="Search permissions..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") e.preventDefault();
                        }}
                        className="border border-zinc-300 px-3 py-1 outline-none text-sm w-64 text-black bg-white"
                    />
                    <label className="flex items-center gap-2 whitespace-nowrap text-sm text-zinc-700">
                        <input
                            type="checkbox"
                            checked={allPermissionsSelected}
                            onChange={(e) => togglePermissionGroup(filteredPermissionIds, e.target.checked)}
                            disabled={!isEditing || !permissionsData || filteredPermissionIds.length === 0}
                            className="h-4 w-4 accent-zinc-800"
                        />
                        Select all
                    </label>
                </div>

                <div className="bg-white border border-zinc-300 min-h-[200px] overflow-x-auto">
                    {filteredPermissions ? (
                        <table className="w-full text-left text-sm text-zinc-700 border-collapse">
                            <thead className="bg-zinc-100 border-b border-zinc-300">
                                <tr>
                                    <th className="px-4 py-2 font-semibold border-r border-zinc-300 w-1/3">Module</th>
                                    <th className="px-4 py-2 font-semibold text-center border-r border-zinc-300">View</th>
                                    <th className="px-4 py-2 font-semibold text-center border-r border-zinc-300">Create</th>
                                    <th className="px-4 py-2 font-semibold text-center border-r border-zinc-300">Update</th>
                                    <th className="px-4 py-2 font-semibold text-center">Delete</th>
                                </tr>
                            </thead>
                            <tbody>
                                {Object.values(filteredPermissions).length > 0 ? (
                                    Object.values(filteredPermissions).map((module: any) => {
                                        const modulePermissionIds = module.permissions.map((permission: any) =>
                                            String(permission.id)
                                        );
                                        const isModuleSelected =
                                            modulePermissionIds.length > 0 &&
                                            modulePermissionIds.every((id: string) =>
                                                selectedPermissionIds.includes(id)
                                            );

                                        return (
                                            <tr key={module.operation} className="border-b border-zinc-200 hover:bg-zinc-50">
                                                {/* Module TD: click par poora module toggle */}
                                                <td
                                                    className="px-4 py-2 font-medium border-r border-zinc-200 cursor-pointer select-none"
                                                    onClick={() => {
                                                        if (!isEditing) return;
                                                        togglePermissionGroup(modulePermissionIds, !isModuleSelected);
                                                    }}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="checkbox"
                                                            checked={isModuleSelected}
                                                            readOnly
                                                            disabled={!isEditing}
                                                            className="h-4 w-4 accent-zinc-800 pointer-events-none"
                                                        />
                                                        {formatLabel(module.operation)}
                                                    </div>
                                                </td>

                                                {["view", "create", "update", "delete"].map((action, index) => {
                                                    const p = module.permissions.find(
                                                        (item: any) => item.name === action
                                                    );
                                                    const tdClass = `px-4 py-2 text-center ${
                                                        index !== 3 ? "border-r border-zinc-200" : ""
                                                    }`;

                                                    if (!p) {
                                                        return (
                                                            <td key={action} className={`${tdClass} text-zinc-400`}>
                                                                -
                                                            </td>
                                                        );
                                                    }

                                                    const pid = String(p.id);
                                                    const isChecked = selectedPermissionIds.includes(pid);
                                                    return (
                                                        // Operation TD: click par sirf yeh single permission toggle
                                                        <td
                                                            key={action}
                                                            className={`${tdClass} cursor-pointer select-none`}
                                                            onClick={() => {
                                                                if (!isEditing) return;
                                                                togglePermission(pid, !isChecked);
                                                            }}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                disabled={!isEditing}
                                                                checked={isChecked}
                                                                readOnly
                                                                className="mx-auto w-4 h-4 accent-zinc-800 pointer-events-none"
                                                            />
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan={5} className="py-4 text-center text-sm text-zinc-500">
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
                        <p className="p-4 mt-2 text-xs text-red-500">{errors.permissionIds.message}</p>
                    )}
                </div>
            </form>

            <ViewAllModal
                key={isViewAllOpen ? "open" : "closed"}
                isOpen={isViewAllOpen}
                title="All Admins"
                rows={admins}
                columns={adminColumns}
                searchKeys={["id", "name", "email", "roleLabel"]}
                isLoading={isAdminsLoading}
                error={adminsError}
                onClose={() => setIsViewAllOpen(false)}
                onRowSelect={(item) => {
                    reset(mapAdminToForm(item));
                    setIsNewMode(false);
                    setIsEditing(false);
                    setIsViewAllOpen(false);
                }}
                onDelete={() => undefined}
            />
        </section>
    );
}