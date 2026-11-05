import { Router } from "express";
import {
  getSyncHealth,
  getSyncStatus,
  runSync,
  resolveSyncConflict,
} from "../controllers/sync.controller.js";
import { authorizeToken } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(authorizeToken);

router.get("/health", getSyncHealth);
router.get("/status", getSyncStatus);
router.post("/execute", runSync);
router.post("/resolve", resolveSyncConflict);

export default router;
