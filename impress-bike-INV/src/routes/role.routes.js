import express from "express";
import roleController from "../controllers/role.controller.js";
import { authorizeToken, checkPermission } from "../middlewares/auth.middleware.js";
const router = express.Router();
router.use(authorizeToken)


router.post("/", checkPermission("role:create"), roleController.createRole);
router.get("/", checkPermission("role:view", "user:create", "user:update"), roleController.getRoles);

router.get("/next-id", checkPermission("role:view", "user:create", "user:update"), roleController.getNextId);
router.get("/:id", checkPermission("role:view", "user:create", "user:update"), roleController.getRoleById);
router.put("/:id", checkPermission("role:update"), roleController.updateRole);
router.delete("/:id", checkPermission("role:delete"), roleController.deleteRole);


export default router;