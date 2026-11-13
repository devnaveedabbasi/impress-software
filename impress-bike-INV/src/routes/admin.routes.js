import { Router } from "express";
import adminController from "../controllers/admin.controller.js";
import { authorizeToken, authorizeSuperAdmin } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { adminIdSchema, createAdminSchema, updateAdminSchema } from "../validations/admin.validation.js";

const router = Router();

// Only a Super Admin can see or manage admins
router.use(authorizeToken, authorizeSuperAdmin);

router.get("/", adminController.getAllAdmins);
router.get("/next-id", adminController.getNextId);
router.get("/:id", validate(adminIdSchema), adminController.getAdminById);
router.post("/", validate(createAdminSchema), adminController.createAdmin);
router.put("/:id", validate(updateAdminSchema), adminController.updateAdmin);
router.delete("/:id", validate(adminIdSchema), adminController.deleteAdmin);

export default router;
