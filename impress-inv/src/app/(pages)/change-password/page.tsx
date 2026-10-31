"use client";

import { useState } from "react";
import api from "@/lib/axios";
import { CHANGE_PASSWORD } from "@/utlis/apiRoutes";
import toast from "react-hot-toast";
import { Icon } from "@iconify/react";

export default function ChangePasswordPage() {
    const [oldPassword, setOldPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const [showOld, setShowOld] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (newPassword !== confirmPassword) {
            toast.error("New passwords do not match");
            return;
        }

        if (newPassword.length < 6) {
            toast.error("New password must be at least 6 characters long");
            return;
        }

        setIsLoading(true);
        try {
            const { data } = await api.patch(CHANGE_PASSWORD, { oldPassword, newPassword });
            toast.success(data.message || "Password changed successfully");
            setOldPassword("");
            setNewPassword("");
            setConfirmPassword("");
        } catch (error: any) {
            toast.error(error.response?.data?.message || "Failed to change password");
        } finally {
            setIsLoading(false);
        }
    };

    const btnClass = "bg-white border border-zinc-400 px-6 py-1.5 text-[15px] text-black hover:bg-zinc-50 active:bg-zinc-100 min-w-[85px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center mt-6";

    return (
        <section className="mx-auto mt-10 w-full max-w-lg bg-[#f0f0f0] p-8 shadow-sm text-black">
            <h1 className="mb-8 text-center text-4xl text-black tracking-wide">Change Password</h1>

            <form onSubmit={handleSubmit} className="border border-zinc-300 p-6 bg-[#f0f0f0]">
                <p className="mb-6 text-[13px] text-zinc-700 text-center font-medium">
                    Enter your current password and choose a new password.
                </p>

                <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-2">
                        <label className="text-[13px] font-medium w-36">Old Password</label>
                        <div className="relative flex-1">
                            <input
                                type={showOld ? "text" : "password"}
                                value={oldPassword}
                                onChange={(e: any) => setOldPassword(e.target.value)}
                                className="border border-zinc-300 px-2 py-1 outline-none w-full bg-white text-black pr-8"
                                placeholder="••••••••"
                            />
                            <button 
                                type="button" 
                                onClick={() => setShowOld(!showOld)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-zinc-100 rounded"
                            >
                                {showOld ? <Icon icon="mdi:eye-off-outline" className="h-5 w-5 text-zinc-500" /> : <Icon icon="mdi:eye-outline" className="h-5 w-5 text-zinc-500" />}
                            </button>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                        <label className="text-[13px] font-medium w-36">New Password</label>
                        <div className="relative flex-1">
                            <input
                                type={showNew ? "text" : "password"}
                                value={newPassword}
                                onChange={(e: any) => setNewPassword(e.target.value)}
                                className="border border-zinc-300 px-2 py-1 outline-none w-full bg-white text-black pr-8"
                                placeholder="••••••••"
                            />
                            <button 
                                type="button" 
                                onClick={() => setShowNew(!showNew)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-zinc-100 rounded"
                            >
                                {showNew ? <Icon icon="mdi:eye-off-outline" className="h-5 w-5 text-zinc-500" /> : <Icon icon="mdi:eye-outline" className="h-5 w-5 text-zinc-500" />}
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <label className="text-[13px] font-medium w-36">Confirm Password</label>
                        <div className="relative flex-1">
                            <input
                                type={showConfirm ? "text" : "password"}
                                value={confirmPassword}
                                onChange={(e: any) => setConfirmPassword(e.target.value)}
                                className="border border-zinc-300 px-2 py-1 outline-none w-full bg-white text-black pr-8"
                                placeholder="••••••••"
                            />
                            <button 
                                type="button" 
                                onClick={() => setShowConfirm(!showConfirm)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-zinc-100 rounded"
                            >
                                {showConfirm ? <Icon icon="mdi:eye-off-outline" className="h-5 w-5 text-zinc-500" /> : <Icon icon="mdi:eye-outline" className="h-5 w-5 text-zinc-500" />}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex justify-center">
                    <button
                        type="submit"
                        disabled={isLoading || !oldPassword || !newPassword || !confirmPassword}
                        className={btnClass}
                    >
                        Change Password
                    </button>
                </div>
            </form>
        </section>
    );
}
