import "dotenv/config";

import app from "./src/app.js";
import config from "./src/config/index.js";
import prisma  from "./src/config/prisma.js";
import { getLocalIp } from "./src/utils/getLocalIp.js";
import { startAutoSync } from "./src/services/sync.service.js";

const PORT = config.port;

async function startServer() {
    try {
        await prisma.$connect();

        console.log("Primary database connected successfully");

        const localIp = getLocalIp();

        app.listen(PORT, "0.0.0.0", () => {
            console.log(`Server running on port ${PORT}`);
            console.log(`Network: http://${localIp}:${PORT}`);
            startAutoSync();
        });
    } catch (error) {
        console.error("Database connection failed:", error.message);
        console.error(
            "Check Render DATABASE_URL: it must be the PostgreSQL connection string, not the frontend/API URL."
        );
        process.exit(1);
    }
}

startServer();