import { Router } from "express";
import inventoryController from "../controllers/inventory.controller.js";
import { authorizeToken, checkPermission } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { createInventorySchema, updateInventorySchema, inventoryIdSchema } from "../validations/inventory.validation.js";

const router = Router();

router.use(authorizeToken);

router.get("/", checkPermission("inventory:view"), inventoryController.getAllInventories);
router.get("/next-id", checkPermission("inventory:view"), inventoryController.getNextIdInventory);
router.get("/:id", checkPermission("inventory:view"), validate(inventoryIdSchema), inventoryController.getByIdInventory);
router.post("/", checkPermission("inventory:create"), validate(createInventorySchema), inventoryController.createInventory);
router.put("/:id", checkPermission("inventory:update"), validate(updateInventorySchema), inventoryController.updateInventory);
router.delete("/:id", checkPermission("inventory:delete"), validate(inventoryIdSchema), inventoryController.deleteInventory);

export default router;
