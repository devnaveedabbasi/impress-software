"use client";

import { useEffect, useState } from "react";
import api from "@/lib/axios";
import { USER_DETAILS, UPDATE_PROFILE } from "@/utlis/apiRoutes";
import toast from "react-hot-toast";

interface UserProfile {
    id: number;
    name: string;
    email: string;
    role: string | null;
    permissions: any[];
}

export default function ProfilePage() {
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isFetching, setIsFetching] = useState(true);

    const fetchProfile = async () => {
        try {
            const { data } = await api.get(USER_DETAILS);
            if (data.data) {
                setProfile(data.data);
                setName(data.data.name || "");
                setEmail(data.data.email || "");
            }
        } catch (error) {
            console.error("Failed to load profile", error);
            toast.error("Failed to load profile data");
        } finally {
            setIsFetching(false);
        }
    };

    useEffect(() => {
        fetchProfile();
    }, []);

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const { data } = await api.put(UPDATE_PROFILE, { name, email });
            toast.success(data.message || "Profile updated successfully");
            setProfile(prev => prev ? { ...prev, name, email } : null);
        } catch (error: any) {
            toast.error(error.response?.data?.message || "Failed to update profile");
        } finally {
            setIsLoading(false);
        }
    };

    const groupedPermissions = profile?.permissions?.reduce((acc: Record<string, string[]>, perm: any) => {
        const module = typeof perm === "string" ? perm.split(":")[0] : perm.name || perm.moduleName;
        const operation = typeof perm === "string" ? perm.split(":")[1] : perm.operation;

        if (module && operation) {
            if (!acc[module]) acc[module] = [];
            acc[module].push(operation);
        }
        return acc;
    }, {} as Record<string, string[]>) || {};

    if (isFetching) {
        return (
            <div className="flex h-[50vh] items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-black border-t-transparent"></div>
            </div>
        );
    }

    const btnClass = "bg-white border border-zinc-400 px-6 py-1.5 text-[15px] text-black hover:bg-zinc-50 active:bg-zinc-100 min-w-[85px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center";

    return (
        <section className="mx-auto mt-10 w-full max-w-5xl bg-[#f0f0f0] p-8 shadow-sm text-black">
            <h1 className="mb-8 text-center text-4xl text-black tracking-wide">Profile Details</h1>

            {/* Profile Info Section */}
            <div className="border border-zinc-300 p-6 bg-[#f0f0f0] mb-6">
                <div className="flex flex-wrap gap-x-8 gap-y-4 mb-4">
                    <div className="flex items-center gap-2">
                        <label className="text-sm font-medium w-16">Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e: any) => setName(e.target.value)}
                            className="border border-zinc-300 px-2 py-1 outline-none w-64 bg-white text-black"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="text-sm font-medium w-16">Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e: any) => setEmail(e.target.value)}
                            className="border border-zinc-300 px-2 py-1 outline-none w-64 bg-white text-black"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="text-sm font-medium w-16">Role</label>
                        <input
                            type="text"
                            value={profile?.role || "No Role"}
                            readOnly
                            className="border border-zinc-300 px-2 py-1 outline-none w-48 bg-white text-black font-medium"
                        />
                    </div>
                </div>
                <div className="flex justify-center mt-4">
                    <button
                        type="button"
                        onClick={handleUpdate}
                        disabled={isLoading || (name === profile?.name && email === profile?.email)}
                        className={btnClass}
                    >
                        {isLoading ? "Saving..." : "Update Profile"}
                    </button>
                </div>
            </div>

            {/* Permissions Table */}
            <div className="border border-zinc-300 p-6 bg-[#f0f0f0]">
                <h2 className="mb-4 text-lg font-bold text-black">Assigned Permissions</h2>

                {Object.keys(groupedPermissions).length === 0 ? (
                    <p className="text-zinc-600 text-sm">No permissions assigned.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse border border-zinc-400 bg-white text-black">
                            <thead>
                                <tr className="bg-[#e4e4e4] text-[13px]">
                                    <th className="border border-zinc-400 p-2 text-left w-48">Module</th>
                                    <th className="border border-zinc-400 p-2 text-left">Permissions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {Object.entries(groupedPermissions).map(([moduleName, operations]) => (
                                    <tr key={moduleName} className="text-[13px]">
                                        <td className="border border-zinc-400 p-2 font-semibold uppercase">
                                            {moduleName.replace(/_/g, ' ')}
                                        </td>
                                        <td className="border border-zinc-400 p-2">
                                            <div className="flex flex-wrap gap-1">
                                                {operations.map(op => (
                                                    <span
                                                        key={op}
                                                        className="inline-block bg-[#e4e4e4] border border-zinc-300 px-2 py-0.5 text-[12px] font-medium text-black"
                                                    >
                                                        {op}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </section>
    );
}
