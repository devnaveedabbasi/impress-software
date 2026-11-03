import { prismaLocal, prismaCloud } from "../config/prisma.js";

// List of syncable tables in dependency order (Parent tables first, then children)
export const SYNC_MODELS = [
  "role",
  "permission",
  "rolePermission",
  "user",
  "userPermission",
  "category",
  "department",
  "station",
  "city",
  "province",
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

// Helper: check if cloud DB is reachable
export async function checkCloudHealth() {
  if (!prismaCloud) return false;
  try {
    await prismaCloud.$queryRaw`SELECT 1`;
    return true;
  } catch (err) {
    return false;
  }
}

// Compare Local vs Cloud records for a model
export async function getModelComparison(modelName) {
  const localItems = await prismaLocal[modelName].findMany({ orderBy: { id: "asc" } });
  let cloudItems = [];
  try {
    cloudItems = await prismaCloud[modelName].findMany({ orderBy: { id: "asc" } });
  } catch (err) {
    console.error(`Failed to fetch cloud records for ${modelName}:`, err.message);
  }

  const cloudMap = new Map(cloudItems.map((item) => [item.id, item]));
  const localMap = new Map(localItems.map((item) => [item.id, item]));

  const conflicts = [];
  const onlyLocal = [];
  const onlyCloud = [];
  let syncedCount = 0;

  for (const [id, localItem] of localMap.entries()) {
    if (cloudMap.has(id)) {
      const cloudItem = cloudMap.get(id);
      const isIdentical = JSON.stringify({ ...localItem, createdAt: undefined, updatedAt: undefined }) ===
                          JSON.stringify({ ...cloudItem, createdAt: undefined, updatedAt: undefined });
      if (isIdentical) {
        syncedCount++;
      } else {
        conflicts.push({
          id,
          modelName,
          local: localItem,
          cloud: cloudItem,
        });
      }
    } else {
      onlyLocal.push(localItem);
    }
  }

  for (const [id, cloudItem] of cloudMap.entries()) {
    if (!localMap.has(id)) {
      onlyCloud.push(cloudItem);
    }
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

// Full Status across all models
export async function getFullSyncStatus() {
  const isOnline = await checkCloudHealth();
  if (!isOnline) {
    return {
      isOnline: false,
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
    try {
      const comp = await getModelComparison(model);
      modelsStatus.push(comp);
      totalConflicts += comp.conflicts.length;
      totalPending += comp.onlyLocal.length + comp.onlyCloud.length;
    } catch (err) {
      console.error(`Error comparing model ${model}:`, err);
    }
  }

  return {
    isOnline: true,
    models: modelsStatus,
    totalConflicts,
    totalPending,
  };
}

// Auto-Sync safe non-conflicting records
export async function syncSafeRecords() {
  const isOnline = await checkCloudHealth();
  if (!isOnline) throw new Error("Cloud database is offline. Cannot sync.");

  const results = {};

  for (const model of SYNC_MODELS) {
    const comp = await getModelComparison(model);
    let pushedToCloud = 0;
    let pulledToLocal = 0;

    // 1. Push onlyLocal to Cloud
    for (const item of comp.onlyLocal) {
      try {
        await prismaCloud[model].create({ data: item });
        pushedToCloud++;
      } catch (err) {
        console.error(`Push error on ${model} id=${item.id}:`, err.message);
      }
    }

    // 2. Pull onlyCloud to Local
    for (const item of comp.onlyCloud) {
      try {
        await prismaLocal[model].create({ data: item });
        pulledToLocal++;
      } catch (err) {
        console.error(`Pull error on ${model} id=${item.id}:`, err.message);
      }
    }

    results[model] = {
      pushedToCloud,
      pulledToLocal,
      remainingConflicts: comp.conflicts.length,
    };
  }

  return results;
}

// Resolve a specific conflict
export async function resolveConflict({ modelName, id, action }) {
  const isOnline = await checkCloudHealth();
  if (!isOnline) throw new Error("Cloud database is offline.");

  const localItem = await prismaLocal[modelName].findUnique({ where: { id: Number(id) } });
  const cloudItem = await prismaCloud[modelName].findUnique({ where: { id: Number(id) } });

  if (!localItem || !cloudItem) {
    throw new Error("Item not found on either Local or Cloud database");
  }

  if (action === "overwrite_cloud") {
    const { id: _, createdAt: __, updatedAt: ___, ...updateData } = localItem;
    await prismaCloud[modelName].update({
      where: { id: Number(id) },
      data: updateData,
    });
    return { success: true, message: `Cloud ${modelName} ID ${id} overwritten with Local data.` };
  } else if (action === "overwrite_local") {
    const { id: _, createdAt: __, updatedAt: ___, ...updateData } = cloudItem;
    await prismaLocal[modelName].update({
      where: { id: Number(id) },
      data: updateData,
    });
    return { success: true, message: `Local ${modelName} ID ${id} overwritten with Cloud data.` };
  } else if (action === "save_as_new") {
    const { id: _, createdAt: __, updatedAt: ___, ...newData } = localItem;
    const createdInCloud = await prismaCloud[modelName].create({
      data: newData,
    });

    await prismaLocal[modelName].update({
      where: { id: Number(id) },
      data: { ...newData, id: createdInCloud.id },
    });

    return {
      success: true,
      message: `Local entry saved as new in Cloud with ID ${createdInCloud.id}.`,
      newId: createdInCloud.id,
    };
  } else {
    throw new Error("Invalid resolution action: " + action);
  }
}
