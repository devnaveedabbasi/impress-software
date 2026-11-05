import "dotenv/config";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.js";

// 1. Local Database Client
const localPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const localAdapter = new PrismaPg(localPool);
export const prismaLocal = new PrismaClient({ adapter: localAdapter });

// 2. Cloud Database Client
let prismaCloud = null;
if (process.env.CLOUD_DATABASE_URL) {
  const cloudPool = new pg.Pool({
    connectionString: process.env.CLOUD_DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000,
  });
  const cloudAdapter = new PrismaPg(cloudPool);
  prismaCloud = new PrismaClient({ adapter: cloudAdapter });
}

export { prismaCloud };

let activeClient = prismaLocal;
let activeDatabase = "local";
let databaseMonitor;

function isConnectionError(error) {
  return [
    "ECONNREFUSED",
    "ECONNRESET",
    "ETIMEDOUT",
    "ENETUNREACH",
    "EHOSTUNREACH",
    "P1001",
    "P1002",
  ].includes(error?.code);
}

export async function checkCloudHealth() {
  if (!prismaCloud) return false;

  try {
    await prismaCloud.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    if (!isConnectionError(error)) {
      console.error("[Database] Live DB health check failed:", error.message);
    }
    return false;
  }
}

export async function refreshActiveDatabase() {
  const cloudAvailable = await checkCloudHealth();
  const nextClient = cloudAvailable ? prismaCloud : prismaLocal;
  const nextDatabase = cloudAvailable ? "live" : "local";

  if (activeDatabase !== nextDatabase) {
    activeClient = nextClient;
    activeDatabase = nextDatabase;
    console.log(`[Database] Switched active database to ${nextDatabase.toUpperCase()}`);
  }

  return { client: activeClient, name: activeDatabase };
}

export function getActiveDatabaseClient() {
  return activeClient;
}

export function getActiveDatabaseName() {
  return activeDatabase;
}

export async function startDatabaseMonitor(intervalMs = 10000) {
  await refreshActiveDatabase();
  if (databaseMonitor || !prismaCloud) return;

  databaseMonitor = setInterval(() => {
    refreshActiveDatabase().catch((error) => {
      console.error("[Database] Failed to refresh active database:", error.message);
    });
  }, intervalMs);
  databaseMonitor.unref?.();
}

const activePrisma = new Proxy(
  {},
  {
    get(_target, property) {
      if (typeof property === "symbol") return undefined;

      return new Proxy(
        {},
        {
          get(_modelTarget, modelMethod) {
            return (...args) => {
              const model = activeClient[property];
              return model[modelMethod](...args).catch(async (error) => {
                if (activeDatabase !== "live" || !isConnectionError(error)) {
                  throw error;
                }

                activeClient = prismaLocal;
                activeDatabase = "local";
                console.error("[Database] Live DB unavailable; switched to LOCAL");
                return prismaLocal[property][modelMethod](...args);
              });
            };
          },
        }
      );
    },
  }
);

export default activePrisma;
