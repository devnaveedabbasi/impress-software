import "dotenv/config";

import app from "./src/app.js";
import config from "./src/config/index.js";
import {
    getActiveDatabaseName,
    prismaLocal,
    startDatabaseMonitor,
} from "./src/config/prisma.js";
import { getLocalIp } from "./src/utils/getLocalIp.js";
import { startAutoSync } from "./src/services/sync.service.js";

const PORT = config.port;

function describeDatabase(connectionString) {
    if (!connectionString) return "not configured";

    try {
        const url = new URL(connectionString);
        return `${url.protocol}//${url.hostname}:${url.port || "default"}${url.pathname}`;
    } catch {
        return "configured (invalid connection string format)";
    }
}

async function startServer() {
    try {
        console.log(`[Database] Local target: ${describeDatabase(process.env.LOCAL_DATABASE_URL || process.env.DATABASE_URL)}`);
        console.log(`[Database] Cloud target: ${describeDatabase(process.env.CLOUD_DATABASE_URL)}`);
        await prismaLocal.$connect();
        await startDatabaseMonitor();

        console.log("Local database connected successfully");

        const localIp = getLocalIp();

        app.listen(PORT, "0.0.0.0", () => {
            console.log(`Server running on port ${PORT}`);
            console.log(`Network: http://${localIp}:${PORT}`);
            startAutoSync();
        });
    } catch (error) {
        console.error("Database connection failed:", error.message);
        console.error("Set LOCAL_DATABASE_URL or DATABASE_URL to the local PostgreSQL database.");
        process.exit(1);
    }
}

startServer();