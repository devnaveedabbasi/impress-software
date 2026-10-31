import express from "express";
import permissionController from "../controllers/permission.controller.js";
import { authorizeToken, checkPermission } from "../middlewares/auth.middleware.js";
const router = express.Router();

router.use(authorizeToken)


router.get("/", checkPermission("permission:view", "user:create", "user:update"), permissionController.getPermissions);

export default router;