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

// The primary database is local in desktop mode and the live database on Render.
// CLOUD_DATABASE_URL remains available for two-way sync when both databases exist.
const isProduction = process.env.NODE_ENV === "production";
const primaryDatabaseUrl = isProduction
  ? process.env.CLOUD_DATABASE_URL || process.env.DATABASE_URL
  : process.env.DATABASE_URL || process.env.CLOUD_DATABASE_URL;
const localPool = createPool(primaryDatabaseUrl, "Primary");
const localAdapter = new PrismaPg(localPool);
export const prismaLocal = new PrismaClient({ adapter: localAdapter });

// Cloud client is optional when the API itself is running against the live DB.
let prismaCloud = null;
if (process.env.CLOUD_DATABASE_URL && process.env.CLOUD_DATABASE_URL !== primaryDatabaseUrl) {
  const cloudPool = createPool(process.env.CLOUD_DATABASE_URL, "Cloud");
  const cloudAdapter = new PrismaPg(cloudPool);
  prismaCloud = new PrismaClient({ adapter: cloudAdapter });
}

export { prismaCloud };
export default prismaLocal;
