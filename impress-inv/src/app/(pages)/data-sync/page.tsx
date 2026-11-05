"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@iconify/react";
import toast from "react-hot-toast";
import api from "@/lib/axios";
import { SYNC_STATUS, SYNC_EXECUTE, SYNC_RESOLVE } from "@/utlis/apiRoutes";
import { useAppSelector } from "@/hooks/redux";

interface ConflictItem {
  id: number | string;
  modelName: string;
  local: Record<string, unknown>;
  cloud: Record<string, unknown>;
}

interface ModelStatus {
  modelName: string;
  localCount: number;
  cloudCount: number;
  syncedCount: number;
  onlyLocal: Record<string, unknown>[];
  onlyCloud: Record<string, unknown>[];
  conflicts: ConflictItem[];
}

interface SyncData {
  isOnline: boolean;
  localConnected: boolean;
  cloudConnected: boolean;
  lastSyncAt: string | null;
  message?: string;
  models: ModelStatus[];
  totalConflicts: number;
  totalPending: number;
}

export default function DataSyncPage() {
  const router = useRouter();
  const { isSoftware } = useAppSelector((state) => state.app);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncData, setSyncData] = useState<SyncData | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  // 1. Guard: Only allowed in Desktop Software mode
  useEffect(() => {
    if (typeof window !== "undefined") {
      const isElec = Boolean((window as any).appConfig?.isElectron);
      if (!isElec) {
        toast.error("Data Sync is only available in Desktop Software mode.");
        router.push("/");
      }
    }
  }, [router]);

  // 2. Fetch Sync Status
  const fetchStatus = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const { data } = await api.get(SYNC_STATUS);
      if (data.success) {
        setSyncData(data.data);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to fetch sync status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSoftware) {
      fetchStatus();
      const interval = window.setInterval(fetchStatus, 30000);
      return () => window.clearInterval(interval);
    }
  }, [isSoftware]);

  // 3. Trigger Full Sync
  const handleExecuteSync = async () => {
    setSyncing(true);
    try {
      const { data } = await api.post(SYNC_EXECUTE);
      if (data.success) {
        toast.success("Safe records synchronized successfully!");
        setSyncData(data.data.currentStatus);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Sync execution failed");
    } finally {
      setSyncing(false);
    }
  };

  // 4. Resolve Conflict
  const handleResolve = async (
    modelName: string,
    id: number | string,
    action: "overwrite_cloud" | "overwrite_local" | "save_as_new"
  ) => {
    const key = `${modelName}-${id}-${action}`;
    setResolvingId(key);
    try {
      const { data } = await api.post(SYNC_RESOLVE, { modelName, id, action });
      if (data.success) {
        toast.success(data.data.message || "Conflict resolved!");
        await fetchStatus(false);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to resolve conflict");
    } finally {
      setResolvingId(null);
    }
  };

  if (!isSoftware) {
    return null;
  }

  // Extract all conflicts
  const allConflicts: ConflictItem[] =
    syncData?.models?.flatMap((m) => m.conflicts) || [];

  return (
    <div className="w-full max-w-5xl rounded-2xl bg-white p-6 shadow-xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-zinc-200 pb-5 gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-zinc-900">
            <Icon icon="mdi:cloud-sync" className="h-7 w-7 text-primary-600" />
            Data Synchronization Hub
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Two-way sync: Local Computer ↔ Live Cloud Database. New and changed records
            are synchronized automatically every 5 minutes.
          </p>
        </div>

        {/* Status Badge & Actions */}
        <div className="flex items-center gap-3">
          <div
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
              syncData?.isOnline
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}
          >
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                syncData?.isOnline ? "bg-emerald-500 animate-pulse" : "bg-red-500"
              }`}
            />
            {syncData?.isOnline ? "Live DB Connected" : "Live DB Offline"}
          </div>

          <button
            type="button"
            onClick={() => fetchStatus()}
            disabled={loading || syncing}
            title="Refresh Status"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 hover:bg-zinc-100 text-zinc-600 transition"
          >
            <Icon
              icon="mdi:refresh"
              className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
            />
          </button>

          <button
            type="button"
            onClick={handleExecuteSync}
            disabled={!syncData?.isOnline || syncing || loading}
            className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-primary-700 disabled:opacity-50 transition"
          >
            <Icon
              icon="mdi:sync"
              className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`}
            />
            <span>{syncing ? "Syncing..." : "Sync Now"}</span>
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
          <span className="font-semibold text-zinc-700">Local DB:</span>{" "}
          <span className="text-emerald-700">
            {syncData?.localConnected ? "Connected" : "Disconnected"}
          </span>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
          <span className="font-semibold text-zinc-700">Live DB:</span>{" "}
          <span className={syncData?.cloudConnected ? "text-emerald-700" : "text-red-700"}>
            {syncData?.cloudConnected ? "Connected" : "Disconnected"}
          </span>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
          <span className="font-semibold text-zinc-700">Last sync:</span>{" "}
          <span className="text-zinc-600">
            {syncData?.lastSyncAt
              ? new Date(syncData.lastSyncAt).toLocaleString()
              : "Not synced yet"}
          </span>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
            Pending Non-Conflicts
          </div>
          <div className="mt-1 text-2xl font-bold text-zinc-800">
            {loading ? "..." : syncData?.totalPending || 0}
          </div>
          <div className="mt-1 text-[11px] text-zinc-400">
            New entries ready to push or pull automatically
          </div>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
          <div className="text-xs font-medium text-amber-700 uppercase tracking-wider">
            Duplicate Conflicts
          </div>
          <div className="mt-1 text-2xl font-bold text-amber-900">
            {loading ? "..." : syncData?.totalConflicts || 0}
          </div>
          <div className="mt-1 text-[11px] text-amber-600">
            Records with same ID but different contents
          </div>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
          <div className="text-xs font-medium text-emerald-700 uppercase tracking-wider">
            Cloud Connection
          </div>
          <div className="mt-1 text-sm font-semibold text-emerald-900 truncate">
            {syncData?.isOnline ? "Live PostgreSQL Active" : "No Internet / Unreachable"}
          </div>
          <div className="mt-1 text-[11px] text-emerald-600">
            Two-way automatic sync is active; use Sync Now for a manual sync.
          </div>
        </div>
      </div>

      {/* Conflict Resolution Section */}
      <div className="mt-8">
        <h2 className="flex items-center gap-2 text-base font-bold text-zinc-800">
          <Icon icon="mdi:alert-circle-outline" className="h-5 w-5 text-amber-600" />
          Pending Conflicts Requiring User Decision ({allConflicts.length})
        </h2>

        {allConflicts.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-zinc-200 p-8 text-center text-sm text-zinc-500">
            <Icon icon="mdi:check-circle-outline" className="mx-auto h-8 w-8 text-emerald-500 mb-1" />
            No conflicts detected! All database records match cleanly.
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {allConflicts.map((conf) => {
              const overwriteKey = `${conf.modelName}-${conf.id}-overwrite_cloud`;
              const overwriteLocalKey = `${conf.modelName}-${conf.id}-overwrite_local`;
              const saveNewKey = `${conf.modelName}-${conf.id}-save_as_new`;
              const isResolving = resolvingId !== null;

              return (
                <div
                  key={`${conf.modelName}-${conf.id}`}
                  className="overflow-hidden rounded-xl border border-amber-200 bg-white shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-100 bg-amber-50/60 px-4 py-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-amber-900">
                        {conf.modelName}
                      </p>
                      <p className="mt-0.5 text-[11px] text-amber-700">
                        Record ID: <span className="font-semibold">#{conf.id}</span>
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2" aria-label="Conflict actions">
                      <button
                        type="button"
                        onClick={() =>
                          handleResolve(conf.modelName, conf.id, "overwrite_cloud")
                        }
                        disabled={isResolving}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-2 text-xs font-semibold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {resolvingId === overwriteKey && (
                          <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                        )}
                        {resolvingId === overwriteKey ? "Updating" : "Use Local"}
                        <span className="hidden sm:inline">→ Cloud</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleResolve(conf.modelName, conf.id, "overwrite_local")}
                        disabled={isResolving}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {resolvingId === overwriteLocalKey && (
                          <span className="h-3 w-3 animate-spin rounded-full border-2 border-blue-300 border-t-blue-700" />
                        )}
                        {resolvingId === overwriteLocalKey ? "Updating" : "Use Cloud"}
                        <span className="hidden sm:inline">→ Local</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleResolve(conf.modelName, conf.id, "save_as_new")}
                        disabled={isResolving}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {resolvingId === saveNewKey && (
                          <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                        )}
                        {resolvingId === saveNewKey ? "Saving" : "Save As New"}
                      </button>
                    </div>
                  </div>

                  {/* Side-by-side comparison */}
                  <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
                    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <div className="text-xs font-bold text-zinc-700">
                          Local Computer
                        </div>
                        <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-semibold text-zinc-600">
                          Source A
                        </span>
                      </div>
                      <pre className="max-h-64 overflow-auto rounded border border-zinc-200 bg-white p-2 text-[11px] text-zinc-600 font-mono">
                        {JSON.stringify(conf.local, null, 2)}
                      </pre>
                    </div>

                    <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <div className="text-xs font-bold text-blue-900">
                          Live Cloud Database
                        </div>
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                          Source B
                        </span>
                      </div>
                      <pre className="max-h-64 overflow-auto rounded border border-blue-200 bg-white p-2 text-[11px] text-zinc-600 font-mono">
                        {JSON.stringify(conf.cloud, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Models Status Breakdown Table */}
      <div className="mt-8">
        <h2 className="text-base font-bold text-zinc-800 mb-3">
          Table-wise Sync Summary
        </h2>
        <div className="overflow-x-auto rounded-xl border border-zinc-200">
          <table className="min-w-full divide-y divide-zinc-200 text-left text-xs">
            <thead className="bg-zinc-50 font-semibold text-zinc-600">
              <tr>
                <th className="px-4 py-3">Table Name</th>
                <th className="px-4 py-3">Local Count</th>
                <th className="px-4 py-3">Cloud Count</th>
                <th className="px-4 py-3">Synced Identical</th>
                <th className="px-4 py-3">Local Only</th>
                <th className="px-4 py-3">Cloud Only</th>
                <th className="px-4 py-3">Conflicts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-zinc-400">
                    Loading database status...
                  </td>
                </tr>
              ) : (
                syncData?.models?.map((m) => (
                  <tr key={m.modelName} className="hover:bg-zinc-50">
                    <td className="px-4 py-2.5 font-medium text-zinc-900 capitalize">
                      {m.modelName}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-700">{m.localCount}</td>
                    <td className="px-4 py-2.5 text-zinc-700">{m.cloudCount}</td>
                    <td className="px-4 py-2.5 text-emerald-600 font-medium">
                      {m.syncedCount}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-600">{m.onlyLocal.length}</td>
                    <td className="px-4 py-2.5 text-zinc-600">{m.onlyCloud.length}</td>
                    <td className="px-4 py-2.5">
                      {m.conflicts.length > 0 ? (
                        <span className="rounded bg-red-100 px-1.5 py-0.5 font-bold text-red-700">
                          {m.conflicts.length}
                        </span>
                      ) : (
                        <span className="text-zinc-400">0</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
