"use client";

import { useEffect, useState } from "react";
import api from "@/lib/axios";
import { roleSchema, type RoleFormValues } from "@/lib/validations/account";
import { useForm } from "@/hooks/useForm";
import { usePermissions } from "@/hooks/usePermissions";
import toast from "react-hot-toast";
import { PERMISSIONS, ROLES } from "@/utlis/apiRoutes";
import useDebounce from "@/hooks/useDebounce";

import { LabeledField } from "@/components/ui/LabeledField";
import { Select } from "@/components/ui/Select";
import { ViewAllResource, type ViewAllColumn } from "@/components/ui/ViewAllModal";

type ViewAllRow = { id: number; [key: string]: unknown };

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
    const roleColumns: ViewAllColumn<ViewAllRow>[] = [
        { key: "id", header: "Role ID" },
        { key: "name", header: "Role Name" },
    ];

    const fetchPermissions = async () => {
        try {
            const { data } = await api.get(PERMISSIONS);
            setPermissionsData(data.data);
        } catch (error) {
            console.error("Failed to fetch permissions", error);
        }
    };

    const fetchNextId = async () => {
        try {
            const { data } = await api.get(`${ROLES}/next-id`);
            setValues({ ...initialValues, id: String(data.data.nextId) });
            setIsNewMode(true);
            setIsEditing(true);
        } catch (error) {
            console.error("Failed to fetch next role ID", error);
        }
    };

    useEffect(() => {
        fetchNextId();
        fetchPermissions();
    }, []);

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
        validationSchema: roleSchema,
        onSubmit: async (data) => {
            const payload = {
                name: data.name,
                permissionIds: data.permissionIds.map(Number),
            };

            try {
                if (isNewMode) {
                    const response = await api.post(ROLES, payload);
                    toast.success(response.data.message || "Role created successfully");
                } else {
                    const response = await api.put(`${ROLES}/${data.id}`, payload);
                    toast.success(response.data.message || "Role updated successfully");
                }
                fetchNextId();
            } catch (error: any) {
                toast.error(error.response?.data?.message || "Failed to save role");
                throw error;
            }
        },
    });

    const handleIdBlur = async (selectedId = values.id) => {
        if (!selectedId) return;

        if (!canView) {
            toast.error("You do not have permission to view or search for roles.");
            setValues({ ...initialValues, id: selectedId });
            setIsNewMode(true);
            setIsEditing(true);
            return;
        }

        try {
            const { data } = await api.get(`${ROLES}/${selectedId}`);
            if (data.data) {
                const r = data.data;
                setValues({
                    id: String(r.id),
                    name: r.name,
                    permissionIds: r.permissions?.map((p: any) => String(p.permission.id)) || [],
                });
                setIsNewMode(false);
                setIsEditing(false);
                toast.success("Role found");
            } else {
                toast.error("Role not found");
                setValues({ ...initialValues, id: selectedId });
                setIsNewMode(true);
                setIsEditing(true);
            }
        } catch (error: any) {
            if (error.response?.status === 403) {
                toast.error(error.response?.data?.message || "Access denied. You do not have permission.");
            } else {
                toast.error("Invalid Role ID");
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
            <h1 className="mb-10 text-center text-4xl text-black tracking-wide">Role Management</h1>

            <form onSubmit={handleSubmit} noValidate>
                {/* Top Section */}
                <div className="flex flex-col md:flex-row justify-between items-start gap-10">
                    <div className="flex-1 w-full space-y-1.5">
                        <LabeledField
                            type="number"
                            label="Role ID"
                            value={values.id || ""}
                            onChange={handleInputChange("id")}
                            onBlur={() => void handleIdBlur()}
                            error={errors.id}
                            wrapperClassName="max-w-[200px]"
                        />
                        <LabeledField
                            label="Role Name"
                            value={values.name}
                            onChange={handleInputChange("name")}
                            error={errors.name}
                            disabled={!isEditing}
                        />
                    </div>

                    {/* Action Buttons */}
                    <div className="grid grid-cols-1 gap-2 shrink-0">
                        <button type="button" onClick={fetchNextId} className={btnClass} disabled={isSubmitting || !canCreate}>New</button>
                        <ViewAllResource
                            endpoint={ROLES}
                            title="All Roles"
                            columns={roleColumns}
                            searchKeys={["id", "name"]}
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
                        <span className="text-[14px] text-zinc-900 font-normal whitespace-nowrap">Permissions</span>
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
                                                const isChecked = values.permissionIds.includes(pid);
                                                return (
                                                    <td key={action} className={tdClass}>
                                                        <input 
                                                            type="checkbox" 
                                                            disabled={!isEditing}
                                                            checked={isChecked}
                                                            onChange={(e) => {
                                                                if (e.target.checked) {
                                                                    handleSelectChange("permissionIds")([...values.permissionIds, pid]);
                                                                } else {
                                                                    handleSelectChange("permissionIds")(values.permissionIds.filter((id: string) => id !== pid));
                                                                }
                                                            }}
                                                            className="cursor-pointer mx-auto w-4 h-4 accent-zinc-800"
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
