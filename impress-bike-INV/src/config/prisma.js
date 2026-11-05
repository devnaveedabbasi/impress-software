import "dotenv/config";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.js";

function createPool(connectionString, name) {
  if (!connectionString) {
    throw new Error(`${name} database URL is not configured`);
  }

  const isLocal =
    connectionString.includes("localhost") ||
    connectionString.includes("127.0.0.1");

  return new pg.Pool({
    connectionString,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    keepAlive: true,
    max: 10,
  });
}

// DATABASE_URL (or LOCAL_DATABASE_URL) is the local database; cloud is only a sync target.
const primaryDatabaseUrl = process.env.LOCAL_DATABASE_URL || process.env.DATABASE_URL;
const localPool = createPool(primaryDatabaseUrl, "Primary");
const localAdapter = new PrismaPg(localPool);
export const prismaLocal = new PrismaClient({ adapter: localAdapter });

// Cloud client is optional and must be separate from the local database.
let prismaCloud = null;
if (process.env.CLOUD_DATABASE_URL && process.env.CLOUD_DATABASE_URL !== primaryDatabaseUrl) {
  const cloudPool = createPool(process.env.CLOUD_DATABASE_URL, "Cloud");
  const cloudAdapter = new PrismaPg(cloudPool);
  prismaCloud = new PrismaClient({ adapter: cloudAdapter });
}

export { prismaCloud };

let activeClient = prismaLocal;
let activeDatabase = "local";
let databaseMonitor;
let cloudHealthCache = null;
let cloudHealthCheckedAt = 0;
let cloudHealthCheck = null;

function isConnectionError(error) {
  const connectionCodes = [
    "ECONNREFUSED",
    "ECONNRESET",
    "ETIMEDOUT",
    "ENETUNREACH",
    "EHOSTUNREACH",
    "P1001",
    "P1002",
  ];
  const connectionMessage = /can't reach database server|connection (terminated|timeout|timed out|refused|reset)|could not connect|econn(refused|reset)|etimedout/i;

  for (let current = error; current; current = current.cause) {
    if (connectionCodes.includes(current.code) || connectionMessage.test(current.message || "")) {
      return true;
    }
  }
  return false;
}

export async function checkCloudHealth() {
  if (!prismaCloud) return false;
  if (cloudHealthCache !== null && Date.now() - cloudHealthCheckedAt < 60000) {
    return cloudHealthCache;
  }
  if (cloudHealthCheck) return cloudHealthCheck;

  cloudHealthCheck = (async () => {
    try {
      await prismaCloud.$queryRaw`SELECT 1`;
      cloudHealthCache = true;
    } catch (error) {
      cloudHealthCache = false;
      if (!isConnectionError(error)) {
        console.error("[Database] Cloud health check failed:", error.message);
      }
    } finally {
      cloudHealthCheckedAt = Date.now();
      cloudHealthCheck = null;
    }
    return cloudHealthCache;
  })();

  return cloudHealthCheck;
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

export async function startDatabaseMonitor(intervalMs = 60000) {
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
