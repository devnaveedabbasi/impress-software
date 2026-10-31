"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Icon } from "@iconify/react";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import { useRouter } from "next/navigation";
import api from "@/lib/axios";
import { LOGOUT } from "@/utlis/apiRoutes";
import toast from "react-hot-toast";
import { logoutUser } from "@/store/slices/auth";

export function ProfileDropdown({
  isOpen,
  setIsOpen
}: {
  isOpen: boolean;
  setIsOpen: (val: boolean) => void;
}) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { user } = useAppSelector((state) => state.auth);

  const dispatch = useAppDispatch();
  const router = useRouter();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    try {
      await api.post(LOGOUT);
      dispatch(logoutUser());
      toast.success("Logged out successfully");
      router.push("/auth/login");
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || "Logout failed";
      toast.error(errorMessage);
      console.error("Logout Error:", errorMessage);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-full p-1 pr-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 focus:outline-none"
      >
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-100 text-primary-600">
          <Icon icon="mdi:user" className="h-4 w-4" />
        </div>
        <span className="hidden sm:inline-block">{user?.name || "Profile"}</span>
        <Icon
          icon="mdi:chevron-down"
          className={`h-4 w-4 text-zinc-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-64 origin-top-right rounded-xl  bg-white  z-50">
          <div className="p-2">
            <div className="mb-2 flex flex-col gap-0.5 rounded-lg  px-1 py-2">
              <span className="text-sm font-semibold text-zinc-900">{user?.name || "User"}</span>
              <span className="text-xs font-medium text-zinc-500 truncate">{user?.email || "user@example.com"}</span>
            </div>

            <div className="flex flex-col gap-1">
              <Link
                href="/profile"
                className="flex items-center gap-2 px-1 py-2 text-sm text-zinc-700 hover:bg-zinc-100"
                onClick={() => setIsOpen(false)}
              >
                <Icon icon="mdi:account-outline" className="h-5 w-5 text-zinc-400" />
                Profile Details
              </Link>

              <Link
                href="/change-password"
                className="flex items-center gap-2 px-1 py-2 text-sm text-zinc-700 hover:bg-zinc-100"
                onClick={() => setIsOpen(false)}
              >
                <Icon icon="mdi:lock-outline" className="h-5 w-5 text-zinc-400" />
                Change Password
              </Link>
            </div>

            <div className="mt-2 border-t border-zinc-100 pt-2">
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-3 rounded-lg px-1 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
              >
                <Icon icon="mdi:logout" className="h-5 w-5 text-red-500" />
                Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
