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
export default prismaLocal;
