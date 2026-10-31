import "dotenv/config";

import app from "./src/app.js";
import config from "./src/config/index.js";
import prisma  from "./src/config/prisma.js";
import { getLocalIp } from "./src/utils/getLocalIp.js";

const PORT = config.port;

async function startServer() {
    try {
        await prisma.$connect();

        console.log("Database connected successfully");

        const localIp = getLocalIp();

        app.listen(PORT, "0.0.0.0", () => {
            console.log(`Server running on port ${PORT}`);
            console.log(`Network: http://${localIp}:${PORT}`);
        });
    } catch (error) {
        console.error("Database connection failed:", error.message);
        process.exit(1);
    }
}

startServer();