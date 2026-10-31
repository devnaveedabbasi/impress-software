import { Router } from "express";
import vendorController from "../controllers/vendor.controller.js";
import { authorizeToken, checkPermission } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { createVendorSchema, updateVendorSchema, vendorIdSchema } from "../validations/vendor.validation.js";

const router = Router();

router.use(authorizeToken);

router.get("/", checkPermission("vendor:view"), vendorController.getAllVendors);
router.get("/next-id", checkPermission("vendor:view"), vendorController.getNextIdVendor);
router.get("/:id", checkPermission("vendor:view"), validate(vendorIdSchema), vendorController.getByIdVendor);
router.post("/", checkPermission("vendor:create"), validate(createVendorSchema), vendorController.createVendor);
router.put("/:id", checkPermission("vendor:update"), validate(updateVendorSchema), vendorController.updateVendor);
router.delete("/:id", checkPermission("vendor:delete"), validate(vendorIdSchema), vendorController.deleteVendor);

export default router;
