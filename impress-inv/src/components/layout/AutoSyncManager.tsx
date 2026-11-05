"use client";

import { useEffect, useRef } from "react";
import toast from "react-hot-toast";
import api from "@/lib/axios";
import { SYNC_EXECUTE, SYNC_HEALTH } from "@/utlis/apiRoutes";

export function AutoSyncManager() {
  const syncingRef = useRef(false);

  useEffect(() => {
    const appConfig = (window as Window & {
      appConfig?: { isElectron?: boolean };
    }).appConfig;
    const isElectron = Boolean(appConfig?.isElectron);
    if (!isElectron) return;

    const syncAfterReconnect = async () => {
      if (!navigator.onLine || syncingRef.current || !localStorage.getItem("token")) {
        return;
      }

      syncingRef.current = true;
      toast("Internet connected. Checking Live DB...", { icon: "🌐" });

      try {
        const { data: health } = await api.get(SYNC_HEALTH);
        if (!health.success || !health.data?.connected) {
          toast.error("Internet is available, but Live DB is still unreachable.");
          return;
        }

        toast.success("Live DB connected. Sync started...");
        const { data } = await api.post(SYNC_EXECUTE);
        if (data.success) {
          toast.success("Data synchronized successfully.");
        }
      } catch (error: unknown) {
        const message =
          typeof error === "object" &&
          error !== null &&
          "response" in error &&
          typeof error.response === "object" &&
          error.response !== null &&
          "data" in error.response &&
          typeof error.response.data === "object" &&
          error.response.data !== null &&
          "message" in error.response.data &&
          typeof error.response.data.message === "string"
            ? error.response.data.message
            : "Automatic sync failed.";
        toast.error(message);
      } finally {
        syncingRef.current = false;
      }
    };

    window.addEventListener("online", syncAfterReconnect);
    return () => window.removeEventListener("online", syncAfterReconnect);
  }, []);

  return null;
}
