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

        console.log("Local database connected successfully (startup/fallback client)");
        console.log(`[Database] Active request database: ${getActiveDatabaseName().toUpperCase()}`);

        const localIp = getLocalIp();

        const server = app.listen(PORT, "0.0.0.0", () => {
            console.log(`Server running on port ${PORT}`);
            console.log(`Network: http://${localIp}:${PORT}`);
            startAutoSync();
        });
        server.on("error", (error) => {
            if (error.code === "EADDRINUSE") {
                console.error(
                    `[Server] Port ${PORT} is already in use. Stop the existing PM2/server process before running nodemon.`
                );
            } else {
                console.error("[Server] HTTP server error:", error);
            }
            process.exitCode = 1;
        });
    } catch (error) {
        console.error("Database connection failed:", error.message);
        console.error("Set LOCAL_DATABASE_URL/DATABASE_URL for desktop or CLOUD_DATABASE_URL for Render.");
        process.exit(1);
    }
}

startServer();