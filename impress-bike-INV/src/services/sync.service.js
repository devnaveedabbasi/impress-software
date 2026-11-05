import { prismaLocal, prismaCloud } from "../config/prisma.js";

export const SYNC_MODELS = [
  "role",
  "permission",
  "rolePermission",
  "user",
  "userPermission",
  "category",
  "department",
  "station",
  "province",
  "city",
  "vendor",
  "dealer",
  "accountCode",
  "inventory",
  "quotation",
  "purchaseOrder",
  "inward",
  "saleGatePass",
  "rejectionReturnToVendor",
];

const COMPOSITE_KEYS = {
  rolePermission: ["roleId", "permissionId"],
  userPermission: ["userId", "permissionId"],
};

let lastSyncAt = null;
let autoSyncTimer = null;
let syncInProgress = null;

function getKey(modelName, item) {
  const fields = COMPOSITE_KEYS[modelName];
  if (fields) return fields.map((field) => `${field}:${item[field]}`).join("|");
  return String(item.id);
}

function getWhere(modelName, item) {
  const fields = COMPOSITE_KEYS[modelName];
  if (fields) {
    return {
      [fields.join("_")]: Object.fromEntries(
        fields.map((field) => [field, item[field]])
      ),
    };
  }
  return { id: item.id };
}

function withoutIdentityAndDates(modelName, item) {
  const result = { ...item };
  delete result.id;
  delete result.createdAt;
  delete result.updatedAt;
  for (const field of COMPOSITE_KEYS[modelName] || []) {
    delete result[field];
  }
  return result;
}

function comparable(item) {
  const result = { ...item };
  delete result.createdAt;
  delete result.updatedAt;
  return JSON.stringify(result);
}

function updatedAt(item) {
  return item.updatedAt ? new Date(item.updatedAt).getTime() : 0;
}

export async function checkCloudHealth() {
  if (!prismaCloud) return false;
  try {
    await prismaCloud.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error("Cloud database health check failed:", error.message);
    return false;
  }
}

export async function getModelComparison(modelName) {
  const localItems = await prismaLocal[modelName].findMany();
  const cloudItems = await prismaCloud[modelName].findMany();
  const cloudMap = new Map(cloudItems.map((item) => [getKey(modelName, item), item]));
  const localMap = new Map(localItems.map((item) => [getKey(modelName, item), item]));
  const conflicts = [];
  const onlyLocal = [];
  const onlyCloud = [];
  let syncedCount = 0;

  for (const [key, localItem] of localMap) {
    const cloudItem = cloudMap.get(key);
    if (!cloudItem) {
      onlyLocal.push(localItem);
      continue;
    }

    if (comparable(localItem) === comparable(cloudItem)) {
      syncedCount++;
    } else {
      conflicts.push({
        id: COMPOSITE_KEYS[modelName] ? key : localItem.id,
        modelName,
        local: localItem,
        cloud: cloudItem,
        localUpdatedAt: localItem.updatedAt || null,
        cloudUpdatedAt: cloudItem.updatedAt || null,
      });
    }
  }

  for (const [key, cloudItem] of cloudMap) {
    if (!localMap.has(key)) onlyCloud.push(cloudItem);
  }

  return {
    modelName,
    localCount: localItems.length,
    cloudCount: cloudItems.length,
    syncedCount,
    onlyLocal,
    onlyCloud,
    conflicts,
  };
}

export async function getFullSyncStatus() {
  const isOnline = await checkCloudHealth();
  if (!isOnline) {
    return {
      isOnline: false,
      localConnected: true,
      cloudConnected: false,
      lastSyncAt,
      message: "Cloud database offline or unreachable",
      models: [],
      totalConflicts: 0,
      totalPending: 0,
    };
  }

  const modelsStatus = [];
  let totalConflicts = 0;
  let totalPending = 0;
  for (const model of SYNC_MODELS) {
    const comparison = await getModelComparison(model);
    modelsStatus.push(comparison);
    totalConflicts += comparison.conflicts.length;
    totalPending += comparison.onlyLocal.length + comparison.onlyCloud.length;
  }

  return {
    isOnline: true,
    localConnected: true,
    cloudConnected: true,
    lastSyncAt,
    models: modelsStatus,
    totalConflicts,
    totalPending,
  };
}

async function createIfMissing(client, modelName, item) {
  await client[modelName].create({ data: item });
}

async function updateRecord(client, modelName, item) {
  await client[modelName].update({
    where: getWhere(modelName, item),
    data: withoutIdentityAndDates(modelName, item),
  });
}

export async function syncSafeRecords() {
  if (syncInProgress) return syncInProgress;

  syncInProgress = syncSafeRecordsInternal();
  try {
    return await syncInProgress;
  } finally {
    syncInProgress = null;
  }
}

async function syncSafeRecordsInternal() {
  if (!(await checkCloudHealth())) {
    throw new Error("Cloud database is offline. Cannot sync.");
  }

  const results = {};
  for (const model of SYNC_MODELS) {
    const comparison = await getModelComparison(model);
    let pushedToCloud = 0;
    let pulledToLocal = 0;
    let updatedInCloud = 0;
    let updatedInLocal = 0;

    for (const item of comparison.onlyLocal) {
      await createIfMissing(prismaCloud, model, item);
      pushedToCloud++;
    }
    for (const item of comparison.onlyCloud) {
      await createIfMissing(prismaLocal, model, item);
      pulledToLocal++;
    }

    for (const conflict of comparison.conflicts) {
      const localTime = updatedAt(conflict.local);
      const cloudTime = updatedAt(conflict.cloud);
      if (localTime > cloudTime) {
        await updateRecord(prismaCloud, model, conflict.local);
        updatedInCloud++;
      } else if (cloudTime > localTime) {
        await updateRecord(prismaLocal, model, conflict.cloud);
        updatedInLocal++;
      }
    }

    results[model] = {
      pushedToCloud,
      pulledToLocal,
      updatedInCloud,
      updatedInLocal,
      remainingConflicts: comparison.conflicts.filter(
        (conflict) => updatedAt(conflict.local) === updatedAt(conflict.cloud)
      ).length,
    };
  }

  lastSyncAt = new Date().toISOString();
  console.info(`[Sync] Completed at ${lastSyncAt}`);
  return results;
}

export function getLastSyncAt() {
  return lastSyncAt;
}

export function startAutoSync(intervalMs = 5 * 60 * 1000) {
  if (autoSyncTimer) return;
  setTimeout(async () => {
    try {
      await syncSafeRecords();
    } catch (error) {
      console.error("[Sync] Initial automatic sync failed:", error.message);
    }
  }, 10000).unref?.();
  autoSyncTimer = setInterval(async () => {
    try {
      await syncSafeRecords();
    } catch (error) {
      console.error("[Sync] Automatic sync failed:", error.message);
    }
  }, intervalMs);
  autoSyncTimer.unref?.();
  console.info(`[Sync] Automatic two-way sync enabled every ${intervalMs / 60000} minutes`);
}

export async function resolveConflict({ modelName, id, action }) {
  if (!(await checkCloudHealth())) throw new Error("Cloud database is offline.");
  let identity;
  if (COMPOSITE_KEYS[modelName]) {
    identity = Object.fromEntries(
      String(id).split("|").map((part) => {
        const separator = part.indexOf(":");
        return [part.slice(0, separator), Number(part.slice(separator + 1))];
      })
    );
  } else {
    identity = { id: Number(id) };
  }
  const localItem = await prismaLocal[modelName].findUnique({ where: getWhere(modelName, identity) });
  const cloudItem = await prismaCloud[modelName].findUnique({ where: getWhere(modelName, identity) });
  if (!localItem || !cloudItem) throw new Error("Item not found on either database");

  if (action === "overwrite_cloud") {
    await updateRecord(prismaCloud, modelName, localItem);
    return { success: true, message: `Cloud ${modelName} ID ${id} overwritten with Local data.` };
  }
  if (action === "overwrite_local") {
    await updateRecord(prismaLocal, modelName, cloudItem);
    return { success: true, message: `Local ${modelName} ID ${id} overwritten with Cloud data.` };
  }
  if (action === "save_as_new") {
    if (COMPOSITE_KEYS[modelName]) {
      throw new Error("Save As New is not supported for composite-key records.");
    }
    const newItem = { ...withoutIdentityAndDates(modelName, localItem) };
    const createdInCloud = await prismaCloud[modelName].create({ data: newItem });
    await prismaLocal[modelName].update({
      where: { id: localItem.id },
      data: { ...newItem, id: createdInCloud.id },
    });
    return {
      success: true,
      message: `Local entry saved as new in Cloud with ID ${createdInCloud.id}.`,
      newId: createdInCloud.id,
    };
  }
  throw new Error("Invalid resolution action: " + action);
}
