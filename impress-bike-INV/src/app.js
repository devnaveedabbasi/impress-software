import express from "express";
import cors from "cors";
import errorHandler from "./middlewares/errorHandler.middleware.js";
import logger from "./middlewares/logger.middleware.js";
import { runWithClientType } from "./config/prisma.js";

const app = express();

const corsOptions = {
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
};

app.use(cors(corsOptions));

// The desktop software marks its requests; everything else is treated as web (see config/prisma.js)
app.use((req, res, next) => {
  const isDesktop = String(req.headers["x-requested-with"] || "").toLowerCase() === "impress-desktop";
  runWithClientType(isDesktop, next);
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(logger);

// Health check
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Inventorys Management API is running",
  });
});

app.get("/check", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Running",
  });
});

import routes from "./routes/index.js";

app.use("/api", routes);

// Global Error Handler
app.use(errorHandler);
export default app;