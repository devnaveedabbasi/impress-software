import { Router } from "express";
import colorController from "../controllers/color.controller.js";
import { authorizeToken, checkPermission } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { createColorSchema, updateColorSchema, colorIdSchema } from "../validations/color.validation.js";

const router = Router();

router.use(authorizeToken);

// Inventory users need the color list for the inventory form dropdown
router.get("/", checkPermission("color:view", "inventory:view", "inventory:create", "inventory:update", "issue_from_line:view", "issue_from_line:create", "issue_from_line:update"), colorController.getAllColors);
router.get("/next-id", checkPermission("color:view", "color:create"), colorController.getNextIdColor);
router.get("/:id", checkPermission("color:view"), validate(colorIdSchema), colorController.getByIdColor);
router.post("/", checkPermission("color:create"), validate(createColorSchema), colorController.createColor);
router.put("/:id", checkPermission("color:update"), validate(updateColorSchema), colorController.updateColor);
router.delete("/:id", checkPermission("color:delete"), validate(colorIdSchema), colorController.deleteColor);

export default router;
