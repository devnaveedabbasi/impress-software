"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@iconify/react";
import toast from "react-hot-toast";
import api from "@/lib/axios";
import { SYNC_STATUS, SYNC_EXECUTE, SYNC_RESOLVE } from "@/utlis/apiRoutes";
import { useAppSelector } from "@/hooks/redux";

interface ConflictItem {
  id: number;
  modelName: string;
  local: any;
  cloud: any;
}

interface ModelStatus {
  modelName: string;
  localCount: number;
  cloudCount: number;
  syncedCount: number;
  onlyLocal: any[];
  onlyCloud: any[];
  conflicts: ConflictItem[];
}

interface SyncData {
  isOnline: boolean;
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
  const fetchStatus = async () => {
    setLoading(true);
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
    }
  }, [isSoftware]);

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
            Seamlessly mirror data between your Local Computer and Cloud Database.
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
            {syncData?.isOnline ? "Cloud Online" : "Cloud Offline"}
          </div>

          <button
            type="button"
            onClick={fetchStatus}
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
            {syncData?.isOnline ? "Render PostgreSQL Active" : "No Internet / Unreachable"}
          </div>
          <div className="mt-1 text-[11px] text-emerald-600">
            Automatic background safety active
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
              const saveNewKey = `${conf.modelName}-${conf.id}-save_as_new`;

              return (
                <div
                  key={`${conf.modelName}-${conf.id}`}
                  className="rounded-xl border border-amber-300 bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between border-b border-zinc-200 pb-3 gap-2">
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900 uppercase">
                      Table: {conf.modelName} &nbsp;|&nbsp; ID: #{conf.id}
                    </span>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          handleResolve(conf.modelName, conf.id, "overwrite_cloud")
                        }
                        disabled={resolvingId !== null}
                        className="rounded bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 transition"
                      >
                        {resolvingId === overwriteKey ? "Updating..." : "Overwrite Cloud"}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          handleResolve(conf.modelName, conf.id, "save_as_new")
                        }
                        disabled={resolvingId !== null}
                        className="rounded bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700 disabled:opacity-50 transition"
                      >
                        {resolvingId === saveNewKey ? "Saving..." : "Save As New Entry"}
                      </button>
                    </div>
                  </div>

                  {/* Side-by-side comparison */}
                  <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="rounded-lg bg-zinc-50 p-3 border border-zinc-200">
                      <div className="text-xs font-bold text-zinc-700 mb-1">
                        💻 Local Computer Data
                      </div>
                      <pre className="text-[11px] text-zinc-600 overflow-x-auto font-mono bg-white p-2 rounded border border-zinc-200">
                        {JSON.stringify(conf.local, null, 2)}
                      </pre>
                    </div>

                    <div className="rounded-lg bg-blue-50/50 p-3 border border-blue-200">
                      <div className="text-xs font-bold text-blue-900 mb-1">
                        ☁️ Cloud Database Data
                      </div>
                      <pre className="text-[11px] text-zinc-600 overflow-x-auto font-mono bg-white p-2 rounded border border-zinc-200">
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

