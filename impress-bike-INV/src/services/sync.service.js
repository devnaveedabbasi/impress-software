import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  checkCloudHealth,
  prismaLocal,
  prismaCloud,
  getActiveDatabaseName,
} from "../config/prisma.js";

export { checkCloudHealth };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const META_FILE = path.join(__dirname, "../../sync_meta.json");

function loadSyncMeta() {
  try {
    if (fs.existsSync(META_FILE)) {
      const data = JSON.parse(fs.readFileSync(META_FILE, "utf8"));
      return data;
    }
  } catch (err) {
    console.warn("[Sync] Could not read sync_meta.json:", err.message);
  }
  return { lastSyncAt: null, lastFullScanAt: null };
}

function saveSyncMeta(meta) {
  try {
    fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2), "utf8");
  } catch (err) {
    console.warn("[Sync] Could not save sync_meta.json:", err.message);
  }
}

const syncMeta = loadSyncMeta();
let lastSyncAt = syncMeta.lastSyncAt;
let autoSyncTimer = null;
let syncInProgress = null;

export const SYNC_MODELS = [
  "role",
  "permission",
  "rolePermission",
  "user",
  "userPermission",
  "category",
  "department",
  "station",
  "color",
  "province",
  "city",
  "vendor",
  "dealer",
  "accountCode",
  "inventory",
  "inventoryStock", // must come after "inventory", "station" and "color" (foreign keys)
  "quotation",
  "purchaseOrder",
  "inward",
  "inwardItem", // must come after "inward" and "inventory" (foreign keys)
  "saleGatePass",
  "saleGatePassItem", // must come after "saleGatePass" and "inventory" (foreign keys)
  "rejectionReturnToVendor",
  "rejectionReturnItem", // must come after "rejectionReturnToVendor" and "inventory" (foreign keys)
  "storeIssue", // must come after "department" and "color" (foreign keys)
  "storeIssueItem", // must come after "storeIssue" and "inventory" (foreign keys)
  "itemReturn", // must come after "department" (foreign key)
  "itemReturnItem", // must come after "itemReturn" and "inventory" (foreign keys)
  "stockMovement", // must come after "inventory" (foreign key)
  "stockTransfer", // must come after "inventory" (foreign key)
  "stockTransferItem", // must come after "stockTransfer" and "inventory" (foreign keys)
  "rejectionReceivedFromDealer", // must come after "dealer" (foreign key)
  "rejectionReceivedItem", // must come after "rejectionReceivedFromDealer" and "inventory" (foreign keys)
];

const COMPOSITE_KEYS = {
  rolePermission: ["roleId", "permissionId"],
  userPermission: ["userId", "permissionId"],
};

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

// Session state must never be synced between databases: a user's login token belongs to the session that
// created it. Copying it would overwrite a fresh token with an older one and log the user out.
const SESSION_FIELDS = { user: ["token"] };

function withoutSessionFields(modelName, item) {
  const fields = SESSION_FIELDS[modelName];
  if (!fields) return item;
  const result = { ...item };
  for (const field of fields) delete result[field];
  return result;
}

function withoutIdentityAndDates(modelName, item) {
  const result = withoutSessionFields(modelName, item);
  const copy = { ...result };
  delete copy.id;
  delete copy.createdAt;
  delete copy.updatedAt;
  for (const field of COMPOSITE_KEYS[modelName] || []) {
    delete copy[field];
  }
  return copy;
}

function comparable(item, modelName) {
  const result = { ...withoutSessionFields(modelName, item) };
  delete result.createdAt;
  delete result.updatedAt;
  return JSON.stringify(result);
}

function updatedAt(item) {
  return item.updatedAt ? new Date(item.updatedAt).getTime() : 0;
}

// Repair Postgres sequence so auto-increment IDs stay synchronized
async function repairSequence(client, modelName) {
  if (COMPOSITE_KEYS[modelName]) return;
  const capitalized = modelName.charAt(0).toUpperCase() + modelName.slice(1);
  try {
    await client.$executeRawUnsafe(`
      SELECT setval(
        pg_get_serial_sequence('"${capitalized}"', 'id'),
        COALESCE((SELECT MAX(id) FROM "${capitalized}"), 1),
        EXISTS(SELECT 1 FROM "${capitalized}")
      )
    `);
  } catch {
    // Ignore non-serial tables
  }
}

// Model comparison: Supports Incremental (Delta) Sync & Full Deep Scan
export async function getModelComparison(modelName, options = { fullScan: false }) {
  const hasUpdatedAt = !COMPOSITE_KEYS[modelName];
  const isIncremental = !options.fullScan && Boolean(lastSyncAt) && hasUpdatedAt;

  // Ultra-fast counts without loading full tables into RAM
  let localCount = 0;
  let cloudCount = 0;
  try {
    localCount = await prismaLocal[modelName].count();
  } catch (err) {
    console.error(`[Sync] Failed to count local ${modelName}:`, err.message);
  }

  try {
    cloudCount = await prismaCloud[modelName].count();
  } catch (err) {
    console.error(`[Sync] Failed to count cloud ${modelName}:`, err.message);
  }

  let localItems = [];
  let cloudItems = [];

  if (isIncremental) {
    // Overlap buffer: 1 minute clock drift margin
    const sinceDate = new Date(new Date(lastSyncAt).getTime() - 60000);
    try {
      localItems = await prismaLocal[modelName].findMany({
        where: { updatedAt: { gte: sinceDate } },
      });
      cloudItems = await prismaCloud[modelName].findMany({
        where: { updatedAt: { gte: sinceDate } },
      });
    } catch (err) {
      console.warn(`[Sync] Incremental lookup failed on ${modelName}, falling back to full scan:`, err.message);
      localItems = await prismaLocal[modelName].findMany();
      cloudItems = await prismaCloud[modelName].findMany();
    }
  } else {
    localItems = await prismaLocal[modelName].findMany();
    cloudItems = await prismaCloud[modelName].findMany();
  }

  const cloudMap = new Map(cloudItems.map((item) => [getKey(modelName, item), item]));
  const localMap = new Map(localItems.map((item) => [getKey(modelName, item), item]));
  const conflicts = [];
  const onlyLocal = [];
  const onlyCloud = [];
  let syncedCount = 0;

  for (const [key, localItem] of localMap) {
    const cloudItem = cloudMap.get(key);
    if (!cloudItem) {
      // In incremental mode, check if item already exists on cloud to avoid false "onlyLocal"
      if (isIncremental) {
        const existsInCloud = await prismaCloud[modelName].findUnique({
          where: getWhere(modelName, localItem),
        });
        if (existsInCloud) {
          if (comparable(localItem, modelName) === comparable(existsInCloud, modelName)) {
            syncedCount++;
          } else {
            conflicts.push({
              id: COMPOSITE_KEYS[modelName] ? key : localItem.id,
              modelName,
              local: localItem,
              cloud: existsInCloud,
              localUpdatedAt: localItem.updatedAt || null,
              cloudUpdatedAt: existsInCloud.updatedAt || null,
            });
          }
          continue;
        }
      }
      onlyLocal.push(localItem);
      continue;
    }

    if (comparable(localItem, modelName) === comparable(cloudItem, modelName)) {
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
    if (!localMap.has(key)) {
      if (isIncremental) {
        const existsInLocal = await prismaLocal[modelName].findUnique({
          where: getWhere(modelName, cloudItem),
        });
        if (existsInLocal) continue;
      }
      onlyCloud.push(cloudItem);
    }
  }

  return {
    modelName,
    localCount,
    cloudCount,
    syncedCount,
    onlyLocal,
    onlyCloud,
    conflicts,
    isIncremental,
  };
}

export async function getFullSyncStatus(options = { fullScan: false }) {
  const isOnline = await checkCloudHealth();
  const activeDatabase = getActiveDatabaseName();
  if (!isOnline) {
    return {
      isOnline: false,
      localConnected: true,
      cloudConnected: false,
      activeDatabase,
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
    const comparison = await getModelComparison(model, options);
    modelsStatus.push(comparison);
    totalConflicts += comparison.conflicts.length;
    totalPending += comparison.onlyLocal.length + comparison.onlyCloud.length;
  }

  return {
    isOnline: true,
    localConnected: true,
    cloudConnected: true,
    activeDatabase,
    lastSyncAt,
    models: modelsStatus,
    totalConflicts,
    totalPending,
    isIncremental: !options.fullScan && Boolean(lastSyncAt),
  };
}

async function createIfMissing(client, modelName, item) {
  try {
    await client[modelName].create({ data: withoutSessionFields(modelName, item) });
  } catch (err) {
    // If already exists with unique constraint, try update
    if (err?.code === "P2002") {
      try {
        await client[modelName].update({
          where: getWhere(modelName, item),
          data: withoutIdentityAndDates(modelName, item),
        });
      } catch (updateErr) {
        console.error(`[Sync] Upsert error on ${modelName}:`, updateErr.message);
      }
    } else {
      console.error(`[Sync] Create error on ${modelName}:`, err.message);
    }
  }
}

async function updateRecord(client, modelName, item) {
  try {
    await client[modelName].update({
      where: getWhere(modelName, item),
      data: withoutIdentityAndDates(modelName, item),
    });
  } catch (err) {
    console.error(`[Sync] Update error on ${modelName}:`, err.message);
  }
}

// Chunk helper for batch processing
function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

export async function syncSafeRecords(options = { fullScan: false }) {
  if (syncInProgress) return syncInProgress;

  syncInProgress = syncSafeRecordsInternal(options);
  try {
    return await syncInProgress;
  } finally {
    syncInProgress = null;
  }
}

async function syncSafeRecordsInternal(options = { fullScan: false }) {
  if (!(await checkCloudHealth())) {
    return {
      skipped: true,
      reason: "Cloud database is offline; local mode remains active.",
    };
  }

  const results = {};
  for (const model of SYNC_MODELS) {
    const comparison = await getModelComparison(model, options);
    let pushedToCloud = 0;
    let pulledToLocal = 0;
    let updatedInCloud = 0;
    let updatedInLocal = 0;

    // Batch chunking: process 50 records at a time
    const localChunks = chunkArray(comparison.onlyLocal, 50);
    for (const chunk of localChunks) {
      for (const item of chunk) {
        await createIfMissing(prismaCloud, model, item);
        pushedToCloud++;
      }
    }

    const cloudChunks = chunkArray(comparison.onlyCloud, 50);
    for (const chunk of cloudChunks) {
      for (const item of chunk) {
        await createIfMissing(prismaLocal, model, item);
        pulledToLocal++;
      }
    }

    // Sequence repair on both clients after inserts
    if (pushedToCloud > 0) await repairSequence(prismaCloud, model);
    if (pulledToLocal > 0) await repairSequence(prismaLocal, model);

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
  saveSyncMeta({
    lastSyncAt,
    lastFullScanAt: options.fullScan ? lastSyncAt : syncMeta.lastFullScanAt,
  });

  console.info(`[Sync] Delta sync completed successfully at ${lastSyncAt}`);

  return results;
}

export function getLastSyncAt() {
  return lastSyncAt;
}

export function startAutoSync(intervalMs = 2 * 60 * 1000) {
  if (autoSyncTimer) return;
  setTimeout(async () => {
    try {
      await syncSafeRecords({ fullScan: false });
    } catch (error) {
      console.error("[Sync] Initial automatic delta sync failed:", error.message);
    }
  }, 10000).unref?.();

  autoSyncTimer = setInterval(async () => {
    try {
      await syncSafeRecords({ fullScan: false });
    } catch (error) {
      console.error("[Sync] Automatic delta sync failed:", error.message);
    }
  }, intervalMs);
  autoSyncTimer.unref?.();
  console.info(`[Sync] Automatic high-speed delta sync enabled every ${intervalMs / 60000} minutes`);
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
    await repairSequence(prismaCloud, modelName);

    await prismaLocal[modelName].update({
      where: { id: localItem.id },
      data: { ...newItem, id: createdInCloud.id },
    });
    await repairSequence(prismaLocal, modelName);

    return {
      success: true,
      message: `Local entry saved as new in Cloud with ID ${createdInCloud.id}.`,
      newId: createdInCloud.id,
    };
  }
  throw new Error("Invalid resolution action: " + action);
}
