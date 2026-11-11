import "dotenv/config";
import { AsyncLocalStorage } from "node:async_hooks";
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
    connectionTimeoutMillis: isLocal ? 10000 : 30000,
    idleTimeoutMillis: 30000,
    keepAlive: true,
    max: 10,
  });
}

// Desktop uses the local database as primary. Cloud-only deployments use the cloud
// database as primary when no local/database URL is configured.
const configuredLocalDatabaseUrl =
  process.env.LOCAL_DATABASE_URL || process.env.DATABASE_URL;
const cloudDatabaseUrl = process.env.CLOUD_DATABASE_URL;
const primaryDatabaseUrl = configuredLocalDatabaseUrl || cloudDatabaseUrl;
const isCloudPrimary = !configuredLocalDatabaseUrl && Boolean(cloudDatabaseUrl);
const localPool = createPool(primaryDatabaseUrl, "Primary");
const localAdapter = new PrismaPg(localPool);
export const prismaLocal = new PrismaClient({ adapter: localAdapter });

// Cloud client is optional and must be separate from the local database.
let prismaCloud = null;
if (isCloudPrimary) {
  prismaCloud = prismaLocal;
} else if (cloudDatabaseUrl && cloudDatabaseUrl !== primaryDatabaseUrl) {
  const cloudPool = createPool(cloudDatabaseUrl, "Cloud");
  const cloudAdapter = new PrismaPg(cloudPool);
  prismaCloud = new PrismaClient({ adapter: cloudAdapter });
}

export { prismaCloud };

let activeClient = prismaLocal;
let activeDatabase = isCloudPrimary ? "live" : "local";
let databaseMonitor;
let cloudHealthCache = null;
let cloudHealthCheckedAt = 0;
let cloudHealthCheck = null;

// Which database a request uses depends on who sends it:
//  - WEB (browser): always the LIVE (cloud) database. It never falls back to LOCAL.
//  - DESKTOP software: LIVE when it is reachable, otherwise LOCAL (offline mode).
// Work that does not come from an HTTP request (startup, sync, scripts) has no context and follows the
// desktop behaviour.
const requestContext = new AsyncLocalStorage();

export function runWithClientType(isDesktop, callback) {
  return requestContext.run({ isDesktop }, callback);
}

function isWebRequest() {
  const store = requestContext.getStore();
  return Boolean(store) && !store.isDesktop;
}

function resolveClient() {
  if (isWebRequest()) {
    // Web is always LIVE. LOCAL is used only when no cloud database is configured at all.
    return prismaCloud
      ? { client: prismaCloud, name: "live", isWeb: true }
      : { client: prismaLocal, name: "local", isWeb: true };
  }
  return { client: activeClient, name: activeDatabase, isWeb: false };
}

export function isConnectionError(error) {
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
  const cacheTtl = cloudHealthCache === true ? 30000 : 5000;
  if (cloudHealthCache !== null && Date.now() - cloudHealthCheckedAt < cacheTtl) {
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
  return resolveClient().client;
}

export function getActiveDatabaseName() {
  return resolveClient().name;
}

// The other database (LOCAL when LIVE is active and vice versa), or null when there is only one.
// Web requests never touch LOCAL, so for them there is no other database.
export function getInactiveDatabaseClient() {
  if (isWebRequest()) return null;
  if (!prismaCloud || prismaCloud === prismaLocal) return null;
  return activeClient === prismaLocal ? prismaCloud : prismaLocal;
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
              const { client, isWeb } = resolveClient();
              const model = client[property];
              return model[modelMethod](...args).catch(async (error) => {
                // Web requests never fall back to LOCAL, a LIVE failure is reported to the user
                if (isWeb || activeDatabase !== "live" || !isConnectionError(error)) {
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
