"use client";

import { useEffect, useState } from "react";
import api from "@/lib/axios";
import { userSchema } from "@/lib/validations/account";
import { useForm } from "@/hooks/useForm";
import { usePermissions } from "@/hooks/usePermissions";
import toast from "react-hot-toast";
import { ROLES, USERS, PERMISSIONS } from "@/utlis/apiRoutes";
import useDebounce from "@/hooks/useDebounce";

import { LabeledField } from "@/components/ui/LabeledField";
import { LabeledSelect } from "@/components/ui/LabeledSelect";
import { Select } from "@/components/ui/Select";
import { ViewAllResource, type ViewAllColumn } from "@/components/ui/ViewAllModal";

type ViewAllRow = { id: number; [key: string]: unknown };

const initialValues = { id: "", name: "", email: "", password: "", role: "", permissionIds: [] as string[] };

export default function AddUserPage() {
    const [isNewMode, setIsNewMode] = useState(true);
    const [isEditing, setIsEditing] = useState(true);

    const [rolesData, setRolesData] = useState<any[]>([]);
    const [permissionsData, setPermissionsData] = useState<any>(null);

    const { hasPermission, user: currentUser } = usePermissions();
    const canCreate = hasPermission("user", "create");
    const canUpdate = hasPermission("user", "update");
    const canView = hasPermission("user", "view");
    const userColumns: ViewAllColumn<ViewAllRow>[] = [
        { key: "id", header: "User ID" },
        { key: "name", header: "Name" },
        { key: "email", header: "Email" },
        { key: "role", header: "Role" },
    ];

    const fetchData = async () => {
        try {
            const [rolesRes, permsRes] = await Promise.all([
                api.get(ROLES),
                api.get(PERMISSIONS)
            ]);
            setRolesData(rolesRes.data.data);
            setPermissionsData(permsRes.data.data);
        } catch (error) {
            console.error("Failed to fetch data", error);
        }
    };

    const fetchNextId = async () => {
        try {
            const { data } = await api.get(`${USERS}/next-id`);
            setValues({ ...initialValues, id: String(data.data.nextId) });
            setIsNewMode(true);
            setIsEditing(true);
        } catch (error) {
            console.error("Failed to fetch next user ID", error);
        }
    };

    useEffect(() => {
        fetchNextId();
        fetchData();
    }, []);

    const roleOptions = [
        { label: "Select a role", value: "" },
        ...(rolesData?.map((r: any) => ({ label: r.name, value: String(r.id) })) || []),
    ];

    const formatLabel = (str: string) => {
        if (!str) return "";
        return str.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
    };

    const permissionOptions = permissionsData
        ? Object.values(permissionsData).flatMap((module: any) =>
            module.permissions.map((p: any) => ({
                label: formatLabel(p.name),
                value: String(p.id),
                group: formatLabel(module.operation),
            }))
        )
        : [];

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
        validationSchema: userSchema,
        onSubmit: async (data) => {
            const payload = {
                name: data.name,
                email: data.email,
                password: data.password,
                roleId: data.role,
                permissionIds: data.permissionIds.map(Number),
            };

            try {
                if (isNewMode) {
                    const response = await api.post(USERS, payload);
                    toast.success(response.data.message || "User created successfully");
                } else {
                    const response = await api.put(`${USERS}/${data.id}`, payload);
                    toast.success(response.data.message || "User updated successfully");
                }
                fetchNextId();
            } catch (error: any) {
                toast.error(error.response?.data?.message || "Failed to save user");
                throw error;
            }
        },
    });

    const isSelfUpdate = !isNewMode && !!currentUser && String(currentUser.id) === String(values.id);

    const handleIdBlur = async (selectedId = values.id) => {
        if (!selectedId) return;

        if (String(selectedId) === "1") {
            toast.error("Admin user cannot be modified");
            fetchNextId();
            return;
        }

        if (!canView) {
            toast.error("You do not have permission to view or search for users.");
            setValues({ ...initialValues, id: selectedId });
            setIsNewMode(true);
            setIsEditing(true);
            return;
        }

        try {
            const { data } = await api.get(`${USERS}/${selectedId}`);
            if (data.data) {
                const u = data.data;
                setValues({
                    id: String(u.id),
                    name: u.name,
                    email: u.email,
                    password: "", // Cannot fetch password hash, leave blank so user can change it or keep old
                    role: String(rolesData.find(r => r.name === u.role)?.id || ""),
                    permissionIds: u.permissions?.map((p: any) => String(p.id)) || [],
                });
                setIsNewMode(false);
                setIsEditing(false);
                toast.success("User found");
            } else {
                toast.error("User not found");
                setValues({ ...initialValues, id: selectedId });
                setIsNewMode(true);
                setIsEditing(true);
            }
        } catch (error: any) {
            if (error.response?.status === 403) {
                toast.error(error.response?.data?.message || "Access denied. You do not have permission.");
            } else {
                toast.error("Invalid User ID");
            }
            setValues({ ...initialValues, id: selectedId });
            setIsNewMode(true);
            setIsEditing(true);
        }
    };

    const [searchQuery, setSearchQuery] = useState("");
    const debouncedSearchQuery = useDebounce(searchQuery, 300);

    const filteredPermissions = permissionsData ? Object.entries(permissionsData).reduce((acc: any, [key, module]: [string, any]) => {
        const groupName = formatLabel(module.operation);
        const searchLower = debouncedSearchQuery.trim().toLowerCase();
        
        if (groupName.toLowerCase().includes(searchLower)) {
            acc[key] = module;
            return acc;
        }
        
        const matchedPerms = module.permissions.filter((p: any) => formatLabel(p.name).toLowerCase().includes(searchLower));
        if (matchedPerms.length > 0) {
            acc[key] = { ...module, permissions: matchedPerms };
        }
        return acc;
    }, {}) : null;

    const btnClass = "bg-white border border-zinc-400 px-6 py-1.5 text-[15px] text-black hover:bg-zinc-50 active:bg-zinc-100 min-w-[85px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center";

    return (
        <section className="mx-auto mt-10 w-full max-w-4xl bg-[#f0f0f0] p-8 shadow-sm">
            <h1 className="mb-10 text-center text-4xl text-black tracking-wide">User Registration</h1>

            <form onSubmit={handleSubmit} noValidate>
                {/* Top Section */}
                <div className="flex flex-col md:flex-row justify-between items-start gap-10">
                    <div className="flex-1 w-full space-y-1.5">
                        <LabeledField
                            type="number"
                            label="User ID"
                            value={values.id || ""}
                            onChange={handleInputChange("id")}
                            onBlur={() => void handleIdBlur()}
                            error={errors.id}
                            wrapperClassName="max-w-[200px]"
                        />
                        <LabeledField
                            label="Name"
                            value={values.name}
                            onChange={handleInputChange("name")}
                            error={errors.name}
                            disabled={!isEditing}
                        />
                        <LabeledField
                            type="email"
                            label="Email"
                            value={values.email}
                            onChange={handleInputChange("email")}
                            error={errors.email}
                            disabled={!isEditing}
                        />
                        <LabeledField
                            type="password"
                            label="Password"
                            placeholder={!isNewMode ? "Leave blank to keep same" : ""}
                            value={values.password}
                            onChange={handleInputChange("password")}
                            error={errors.password}
                            disabled={!isEditing}
                        />
                        <LabeledSelect
                            label="Role"
                            options={roleOptions}
                            value={values.role}
                            onChange={(e) => handleSelectChange("role")(e)}
                            error={errors.role}
                            disabled={!isEditing || !!isSelfUpdate}
                        />
                    </div>

                    {/* Action Buttons */}
                    <div className="grid grid-cols-1 gap-2 shrink-0">
                        <button type="button" onClick={fetchNextId} className={btnClass} disabled={isSubmitting || !canCreate}>New</button>
                        <ViewAllResource
                            endpoint={USERS}
                            title="All Users"
                            columns={userColumns}
                            searchKeys={["id", "name", "email", "role"]}
                            canView={canView}
                            onSelectId={(id) => {
                                const selectedId = String(id);
                                setValues((prev) => ({ ...prev, id: selectedId }));
                                void handleIdBlur(selectedId);
                            }}
                        />
                        <button type="submit" className={btnClass} disabled={!isEditing || isSubmitting || (isNewMode ? !canCreate : !canUpdate)}>Save</button>
                        <button type="button" onClick={() => setIsEditing(true)} className={btnClass} disabled={isEditing || isNewMode || !canUpdate}>Edit</button>
                    </div>
                </div>

                {/* Information Divider */}
                <div className="flex items-center justify-between gap-3 mb-4 mt-6">
                    <div className="flex items-center gap-3 flex-1">
                        <span className="text-[14px] text-zinc-900 font-normal whitespace-nowrap">Extra Permissions</span>
                        {isSelfUpdate && <span className="text-xs text-red-500 font-medium ml-2">(You cannot modify your own role or permissions)</span>}
                        <div className="flex-1 h-[1px] bg-zinc-500"></div>
                    </div>
                    <input 
                        type="text" 
                        placeholder="Search permissions..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                            }
                        }}
                        className="border border-zinc-300 px-3 py-1 outline-none text-sm w-64 text-black"
                    />
                </div>

                {/* Permissions Section */}
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
                                {Object.values(filteredPermissions).length > 0 ? Object.values(filteredPermissions).map((module: any) => {
                                    const groupName = formatLabel(module.operation);
                                    const lockedValues = rolesData?.find((r: any) => String(r.id) === values.role)?.permissions?.map((p: any) => String(p.permission.id)) || [];
                                    
                                    const getPerm = (action: string) => module.permissions.find((p: any) => p.name === action);

                                    return (
                                        <tr key={module.operation} className="border-b border-zinc-200 hover:bg-zinc-50">
                                            <td className="px-4 py-2 font-medium border-r border-zinc-200">{groupName}</td>
                                            {["view", "create", "update", "delete"].map((action, index) => {
                                                const p = getPerm(action);
                                                const isLast = index === 3;
                                                const tdClass = `px-4 py-2 text-center ${!isLast ? 'border-r border-zinc-200' : ''}`;
                                                
                                                if (!p) return <td key={action} className={`${tdClass} text-zinc-400`}>-</td>;
                                                
                                                const pid = String(p.id);
                                                const isLocked = lockedValues.includes(pid);
                                                const isChecked = values.permissionIds.includes(pid) || isLocked;
                                                return (
                                                    <td key={action} className={tdClass}>
                                                        <input 
                                                            type="checkbox" 
                                                            disabled={!isEditing || isLocked || isSelfUpdate}
                                                            checked={isChecked}
                                                            onChange={(e) => {
                                                                if (e.target.checked) {
                                                                    handleSelectChange("permissionIds")([...values.permissionIds, pid]);
                                                                } else {
                                                                    handleSelectChange("permissionIds")(values.permissionIds.filter(id => id !== pid));
                                                                }
                                                            }}
                                                            className="cursor-pointer mx-auto w-4 h-4 accent-zinc-800"
                                                            title={isLocked ? "Inherited from Role" : ""}
                                                        />
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                }) : (
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
                    {errors.permissionIds && <p className="p-4 mt-2 text-xs text-red-500">{errors.permissionIds}</p>}
                </div>
            </form>
        </section>
    );
}
