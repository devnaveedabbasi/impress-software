import express from "express";
import cors from "cors";
import errorHandler from "./middlewares/errorHandler.middleware.js";
import logger from "./middlewares/logger.middleware.js";

const app = express();

const corsOptions = {
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
};

app.use(cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Inventory Management API is running",
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
app.use(logger);
export default app;