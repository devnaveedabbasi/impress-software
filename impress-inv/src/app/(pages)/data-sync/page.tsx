"use client";

import { useEffect, useState, useMemo } from "react";
import { Icon } from "@iconify/react";
import toast from "react-hot-toast";
import api from "@/lib/axios";
import { SYNC_STATUS, SYNC_EXECUTE, SYNC_RESOLVE } from "@/utlis/apiRoutes";

interface ConflictItem {
  id: number | string;
  modelName: string;
  local: Record<string, unknown>;
  cloud: Record<string, unknown>;
  localUpdatedAt?: string | null;
  cloudUpdatedAt?: string | null;
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
  activeDatabase?: string;
  lastSyncAt: string | null;
  message?: string;
  models: ModelStatus[];
  totalConflicts: number;
  totalPending: number;
}

interface PendingItem {
  key: string;
  id: number | string;
  modelName: string;
  direction: "local_to_cloud" | "cloud_to_local" | "conflict";
  directionLabel: string;
  summary: string;
  data: Record<string, unknown>;
  updatedAt?: string;
}

function getItemSummary(modelName: string, item: Record<string, unknown> | null | undefined): string {
  if (!item) return "-";
  if (item.name && typeof item.name === "string") return item.name;
  if (item.vendorName && typeof item.vendorName === "string") return item.vendorName;
  if (item.itemName && typeof item.itemName === "string") return item.itemName;
  if (item.dealarShipName && typeof item.dealarShipName === "string") return item.dealarShipName;
  if (item.headName && typeof item.headName === "string") return item.headName;
  if (item.email && typeof item.email === "string") return item.email;
  if (item.detail && typeof item.detail === "string") return item.detail;
  if (item.remarks && typeof item.remarks === "string") return item.remarks;
  if (item.accountName && typeof item.accountName === "string") return item.accountName;

  const keys = Object.keys(item).filter((k) => k !== "id" && k !== "createdAt" && k !== "updatedAt");
  if (keys.length > 0 && typeof item[keys[0]] === "string") {
    return String(item[keys[0]]);
  }
  return `Record #${item.id || "-"}`;
}

export default function DataSyncPage() {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncData, setSyncData] = useState<SyncData | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "local_to_cloud" | "cloud_to_local" | "conflict">("all");
  const [selectedItemDetails, setSelectedItemDetails] = useState<PendingItem | null>(null);

  // Fetch Sync Status
  const fetchStatus = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const { data } = await api.get(SYNC_STATUS);
      if (data.success) {
        setSyncData(data.data);
        console.log("[Sync] Status fetched successfully:", data.data);
      }
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { message?: string } } };
      console.error("[Sync] Error fetching status:", err);
      toast.error(apiErr.response?.data?.message || "Failed to fetch sync status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchStatus();
    const interval = window.setInterval(() => {
      void fetchStatus(false);
    }, 20000);
    return () => window.clearInterval(interval);
  }, []);

  // Trigger Full Two-Way Sync
  const handleExecuteSync = async () => {
    setSyncing(true);
    try {
      console.log("[Sync] Executing bidirectional synchronization...");
      const { data } = await api.post(SYNC_EXECUTE);
      if (data.success) {
        toast.success("Safe records synchronized successfully!");
        setSyncData(data.data.currentStatus);
        console.log("[Sync] Execute sync completed:", data.data);
      }
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { message?: string } } };
      console.error("[Sync] Execution failed:", err);
      toast.error(apiErr.response?.data?.message || "Sync execution failed");
    } finally {
      setSyncing(false);
    }
  };

  // Resolve Specific Conflict
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
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { message?: string } } };
      toast.error(apiErr.response?.data?.message || "Failed to resolve conflict");
    } finally {
      setResolvingId(null);
    }
  };

  // Flatten all pending un-synced operations across all tables
  const pendingItems = useMemo<PendingItem[]>(() => {
    if (!syncData?.models) return [];
    const items: PendingItem[] = [];

    for (const m of syncData.models) {
      // 1. Only in Local (New local records pending upload to cloud)
      for (const loc of m.onlyLocal) {
        const id = (loc.id as number | string) || JSON.stringify(loc);
        items.push({
          key: `local-${m.modelName}-${id}`,
          id,
          modelName: m.modelName,
          direction: "local_to_cloud",
          directionLabel: "Local Only → Pending Upload to Cloud",
          summary: getItemSummary(m.modelName, loc),
          data: loc,
          updatedAt: (loc.updatedAt as string) || (loc.createdAt as string),
        });
      }

      // 2. Only in Cloud (New cloud records pending download to local)
      for (const cld of m.onlyCloud) {
        const id = (cld.id as number | string) || JSON.stringify(cld);
        items.push({
          key: `cloud-${m.modelName}-${id}`,
          id,
          modelName: m.modelName,
          direction: "cloud_to_local",
          directionLabel: "Cloud Only → Pending Download to Local",
          summary: getItemSummary(m.modelName, cld),
          data: cld,
          updatedAt: (cld.updatedAt as string) || (cld.createdAt as string),
        });
      }

      // 3. Conflicts (Differing records between local and cloud)
      for (const conf of m.conflicts) {
        items.push({
          key: `conflict-${m.modelName}-${conf.id}`,
          id: conf.id,
          modelName: m.modelName,
          direction: "conflict",
          directionLabel: "Conflict → Data Mismatch",
          summary: getItemSummary(m.modelName, conf.local || conf.cloud),
          data: conf.local,
          updatedAt: conf.localUpdatedAt || conf.cloudUpdatedAt || undefined,
        });
      }
    }

    return items;
  }, [syncData]);

  const filteredPendingItems = useMemo(() => {
    if (activeTab === "all") return pendingItems;
    return pendingItems.filter((item) => item.direction === activeTab);
  }, [pendingItems, activeTab]);

  const allConflicts: ConflictItem[] =
    syncData?.models?.flatMap((m) => m.conflicts) || [];

  return (
    <div className="w-full max-w-6xl space-y-6">
      {/* 1. Main Header Card with Connection Statuses */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                <Icon icon="mdi:cloud-sync" className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-zinc-900">
                  Data Synchronization Hub
                </h1>
                <p className="text-xs text-zinc-500">
                  Real-time two-way sync: Local Computer ↔ Live Cloud Database.
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons & Status Badge */}
          <div className="flex flex-wrap items-center gap-3">
            {loading && !syncData ? (
              <div className="flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 border border-blue-200">
                <Icon icon="mdi:loading" className="h-3.5 w-3.5 animate-spin" />
                <span>Connecting / Checking Cloud...</span>
              </div>
            ) : syncData?.isOnline ? (
              <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Cloud Online & Ready</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 border border-amber-200">
                <Icon icon="mdi:cloud-off-outline" className="h-3.5 w-3.5 text-amber-600" />
                <span>Cloud Offline (Local Mode Active)</span>
              </div>
            )}

            <button
              type="button"
              onClick={() => fetchStatus()}
              disabled={loading || syncing}
              title="Refresh Status"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-50"
            >
              <Icon
                icon="mdi:refresh"
                className={`h-4 w-4 ${loading ? "animate-spin text-primary-600" : ""}`}
              />
            </button>

            <button
              type="button"
              onClick={handleExecuteSync}
              disabled={!syncData?.isOnline || syncing || loading}
              className="flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Icon
                icon="mdi:sync"
                className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`}
              />
              <span>{syncing ? "Syncing Both Ways..." : "Sync Now"}</span>
            </button>
          </div>
        </div>

        {/* Connection Status Row in Header */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4 text-xs">
          {/* Local DB */}
          <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50/70 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </span>
              <span className="font-semibold text-zinc-700">Local DB:</span>
            </div>
            {loading && !syncData ? (
              <span className="inline-flex items-center gap-1 text-zinc-500 font-medium">
                <Icon icon="mdi:loading" className="h-3 w-3 animate-spin" />
                Checking...
              </span>
            ) : (
              <span className="font-bold text-emerald-700">
                {syncData?.localConnected !== false ? "Connected" : "Disconnected"}
              </span>
            )}
          </div>

          {/* Live Cloud DB */}
          <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50/70 px-4 py-3">
            <div className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  loading && !syncData
                    ? "bg-blue-500 animate-pulse"
                    : syncData?.isOnline
                    ? "bg-emerald-500 animate-pulse"
                    : "bg-amber-500"
                }`}
              />
              <span className="font-semibold text-zinc-700">Live Cloud DB:</span>
            </div>
            {loading && !syncData ? (
              <span className="inline-flex items-center gap-1 font-semibold text-blue-600">
                <Icon icon="mdi:loading" className="h-3 w-3 animate-spin" />
                Connecting / Checking...
              </span>
            ) : syncData?.isOnline ? (
              <span className="font-bold text-emerald-700">Connected (Online)</span>
            ) : (
              <span className="font-bold text-amber-700">Offline / Cloud Unreachable</span>
            )}
          </div>

          {/* Active Database */}
          <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50/70 px-4 py-3">
            <div className="flex items-center gap-2">
              <Icon icon="mdi:database" className="h-4 w-4 text-zinc-500" />
              <span className="font-semibold text-zinc-700">Active DB Mode:</span>
            </div>
            {loading && !syncData ? (
              <span className="inline-flex items-center gap-1 text-zinc-500 font-medium">
                <Icon icon="mdi:loading" className="h-3 w-3 animate-spin" />
                Detecting...
              </span>
            ) : (
              <span className="rounded bg-zinc-200 px-2 py-0.5 font-bold uppercase text-zinc-800">
                {syncData?.activeDatabase || (syncData?.isOnline ? "LIVE" : "LOCAL")}
              </span>
            )}
          </div>

          {/* Last Synced */}
          <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50/70 px-4 py-3">
            <div className="flex items-center gap-2">
              <Icon icon="mdi:clock-outline" className="h-4 w-4 text-zinc-500" />
              <span className="font-semibold text-zinc-700">Last Synced:</span>
            </div>
            {loading && !syncData ? (
              <span className="text-zinc-400">Loading...</span>
            ) : (
              <span className="font-medium text-zinc-600 truncate max-w-[140px]" title={syncData?.lastSyncAt || "Not synced yet"}>
                {syncData?.lastSyncAt
                  ? new Date(syncData.lastSyncAt).toLocaleTimeString()
                  : "Not synced yet"}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 2. PENDING OPERATIONS TABLE - ALL UNSYNCED LOCAL & CLOUD CHANGES */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Icon icon="mdi:playlist-edit" className="h-6 w-6 text-amber-600" />
              <h2 className="text-lg font-bold text-zinc-900">
                Pending Unsynced Operations ({pendingItems.length})
              </h2>
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              Yeh tamam records abhi sync hona baqi hain. Jaise hi Sync complete hogi yeh table se automatically remove ho jayenge.
            </p>
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab("all")}
              className={`rounded-lg px-3 py-1.5 font-semibold transition ${
                activeTab === "all"
                  ? "bg-zinc-800 text-white"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              All ({pendingItems.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("local_to_cloud")}
              className={`rounded-lg px-3 py-1.5 font-semibold transition ${
                activeTab === "local_to_cloud"
                  ? "bg-amber-600 text-white"
                  : "bg-amber-50 text-amber-700 hover:bg-amber-100"
              }`}
            >
              Local ➔ Cloud ({pendingItems.filter((i) => i.direction === "local_to_cloud").length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("cloud_to_local")}
              className={`rounded-lg px-3 py-1.5 font-semibold transition ${
                activeTab === "cloud_to_local"
                  ? "bg-blue-600 text-white"
                  : "bg-blue-50 text-blue-700 hover:bg-blue-100"
              }`}
            >
              Cloud ➔ Local ({pendingItems.filter((i) => i.direction === "cloud_to_local").length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("conflict")}
              className={`rounded-lg px-3 py-1.5 font-semibold transition ${
                activeTab === "conflict"
                  ? "bg-red-600 text-white"
                  : "bg-red-50 text-red-700 hover:bg-red-100"
              }`}
            >
              Conflicts ({pendingItems.filter((i) => i.direction === "conflict").length})
            </button>
          </div>
        </div>

        {/* Table Content */}
        <div className="mt-4 overflow-x-auto">
          {loading && !syncData ? (
            <div className="rounded-xl border border-dashed border-zinc-200 py-12 text-center">
              <Icon
                icon="mdi:loading"
                className="mx-auto h-10 w-10 text-primary-600 animate-spin"
              />
              <p className="mt-2 text-sm font-semibold text-zinc-800">
                Connecting to Databases & Checking Status...
              </p>
              <p className="text-xs text-zinc-500">
                Live Cloud aur Local databases ke darmiyan status verify ho raha hai...
              </p>
            </div>
          ) : filteredPendingItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-200 py-12 text-center">
              <Icon
                icon="mdi:check-circle-outline"
                className="mx-auto h-12 w-12 text-emerald-500"
              />
              <p className="mt-2 text-sm font-semibold text-zinc-800">
                Sub Data Synced Hai!
              </p>
              <p className="text-xs text-zinc-500">
                Koi pending operation mojood nahi hai. Local aur Live database 100% matched hain.
              </p>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-zinc-200 text-left text-xs">
              <thead className="bg-zinc-50 font-semibold text-zinc-600">
                <tr>
                  <th className="px-4 py-3">Record ID</th>
                  <th className="px-4 py-3">Table / Entity</th>
                  <th className="px-4 py-3">Operation / Type</th>
                  <th className="px-4 py-3">Record Detail</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 bg-white">
                {filteredPendingItems.map((item) => (
                  <tr key={item.key} className="hover:bg-zinc-50/80 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-zinc-800">
                      #{item.id}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-semibold capitalize text-zinc-800">
                        {item.modelName}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {item.direction === "local_to_cloud" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 border border-amber-200">
                          <Icon icon="mdi:cloud-upload-outline" className="h-3.5 w-3.5" />
                          Local ➔ Push Cloud
                        </span>
                      )}
                      {item.direction === "cloud_to_local" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-800 border border-blue-200">
                          <Icon icon="mdi:cloud-download-outline" className="h-3.5 w-3.5" />
                          Cloud ➔ Pull Local
                        </span>
                      )}
                      {item.direction === "conflict" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-800 border border-red-200">
                          <Icon icon="mdi:alert-circle-outline" className="h-3.5 w-3.5" />
                          Modified Difference
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-zinc-900 max-w-xs truncate">
                      {item.summary}
                    </td>
                    <td className="px-4 py-3">
                      {syncing ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-primary-600">
                          <Icon icon="mdi:loading" className="h-3.5 w-3.5 animate-spin" />
                          Syncing...
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-semibold text-amber-600">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                          Pending Sync
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedItemDetails(item)}
                        className="rounded border border-zinc-200 px-2.5 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100 transition"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 3. Conflict Resolution Section (If conflicts exist) */}
      {allConflicts.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-base font-bold text-amber-900 mb-2">
            <Icon icon="mdi:alert-circle" className="h-5 w-5 text-amber-600" />
            Decision Required: Conflicts ({allConflicts.length})
          </h2>
          <p className="text-xs text-zinc-500 mb-4">
            Yeh records local aur live dono jagah same ID par alag data rakhte hain. Aap decide karein ke konsa data rakhna hai:
          </p>

          <div className="space-y-4">
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
                      <span className="rounded bg-amber-200 px-2 py-0.5 text-xs font-bold uppercase text-amber-900">
                        {conf.modelName} #{conf.id}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          handleResolve(conf.modelName, conf.id, "overwrite_cloud")
                        }
                        disabled={isResolving}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-50"
                      >
                        {resolvingId === overwriteKey ? "Updating..." : "Use Local → Cloud"}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          handleResolve(conf.modelName, conf.id, "overwrite_local")
                        }
                        disabled={isResolving}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-50 disabled:opacity-50"
                      >
                        {resolvingId === overwriteLocalKey ? "Updating..." : "Use Cloud → Local"}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          handleResolve(conf.modelName, conf.id, "save_as_new")
                        }
                        disabled={isResolving}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-primary-700 disabled:opacity-50"
                      >
                        {resolvingId === saveNewKey ? "Saving..." : "Save As New"}
                      </button>
                    </div>
                  </div>

                  {/* Comparison grids */}
                  <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 text-xs">
                    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                      <div className="mb-1 font-bold text-zinc-700">💻 Local Computer Data</div>
                      <pre className="max-h-48 overflow-auto rounded border border-zinc-200 bg-white p-2 text-[11px] font-mono text-zinc-600">
                        {JSON.stringify(conf.local, null, 2)}
                      </pre>
                    </div>
                    <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3">
                      <div className="mb-1 font-bold text-blue-900">☁️ Live Cloud Data</div>
                      <pre className="max-h-48 overflow-auto rounded border border-blue-200 bg-white p-2 text-[11px] font-mono text-zinc-600">
                        {JSON.stringify(conf.cloud, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. Table-wise Summary Breakdown */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-bold text-zinc-900 mb-3">
          All Database Tables Summary
        </h2>
        <div className="overflow-x-auto rounded-xl border border-zinc-200">
          <table className="min-w-full divide-y divide-zinc-200 text-left text-xs">
            <thead className="bg-zinc-50 font-semibold text-zinc-600">
              <tr>
                <th className="px-4 py-3">Table Name</th>
                <th className="px-4 py-3">Local Count</th>
                <th className="px-4 py-3">Cloud Count</th>
                <th className="px-4 py-3">Identical</th>
                <th className="px-4 py-3">Local Only (Pending Push)</th>
                <th className="px-4 py-3">Cloud Only (Pending Pull)</th>
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
                    <td className="px-4 py-2.5 font-medium text-emerald-600">
                      {m.syncedCount}
                    </td>
                    <td className="px-4 py-2.5">
                      {m.onlyLocal.length > 0 ? (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 font-bold text-amber-800">
                          {m.onlyLocal.length}
                        </span>
                      ) : (
                        <span className="text-zinc-400">0</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {m.onlyCloud.length > 0 ? (
                        <span className="rounded bg-blue-100 px-1.5 py-0.5 font-bold text-blue-800">
                          {m.onlyCloud.length}
                        </span>
                      ) : (
                        <span className="text-zinc-400">0</span>
                      )}
                    </td>
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

      {/* Inspect Item Modal */}
      {selectedItemDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
              <div>
                <h3 className="font-bold text-zinc-900 capitalize">
                  {selectedItemDetails.modelName} #{selectedItemDetails.id}
                </h3>
                <p className="text-xs text-zinc-500">
                  {selectedItemDetails.directionLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedItemDetails(null)}
                className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
              >
                <Icon icon="mdi:close" className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4">
              <div className="mb-2 text-xs font-semibold text-zinc-700">
                Payload / Record Fields:
              </div>
              <pre className="max-h-64 overflow-auto rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs font-mono text-zinc-800">
                {JSON.stringify(selectedItemDetails.data, null, 2)}
              </pre>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedItemDetails(null)}
                className="rounded-lg bg-zinc-800 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-700 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
