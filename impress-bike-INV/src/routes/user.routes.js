import express from "express";
import userController from "../controllers/user.controller.js";
import { authorizeToken, checkPermission } from "../middlewares/auth.middleware.js";
const router = express.Router();
router.use(authorizeToken)


router.post("/", checkPermission("user:create"), userController.createUser);
router.get("/", checkPermission("user:view"), userController.getAllUsers);

router.get("/next-id", checkPermission("user:view"), userController.getNextId);
router.get("/:id", checkPermission("user:view"), userController.getUserById);
router.put("/:id", checkPermission("user:update"), userController.updateUser);
router.delete("/:id", checkPermission("user:delete"), userController.deleteUser);
router.patch("/:id/change-password", checkPermission("user:update"), userController.changePassword);

export default router;