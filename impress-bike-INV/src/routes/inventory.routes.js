import { Router } from "express";
import inventoryController from "../controllers/inventory.controller.js";
import { authorizeToken, checkPermission } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { createInventorySchema, updateInventorySchema, inventoryIdSchema } from "../validations/inventory.validation.js";

const router = Router();

router.use(authorizeToken);

router.get(
    "/",
    checkPermission(
        "inventory:view",
        "inward_quality_control:view",
        "inward_quality_control:create",
        "inward_quality_control_report:view",
        "sale_gate_pass:view",
        "sale_gate_pass:create",
        "sale_gate_pass:update",
        "rejection_return_to_vendor:view",
        "rejection_return_to_vendor:create",
        "rejection_return_to_vendor:update",
        "issue_from_line:view",
        "issue_from_line:create",
        "issue_from_line:update",
        "item_return_from_department:view",
        "item_return_from_department:create",
        "item_return_from_department:update"
    ),
    inventoryController.getAllInventories
);
router.get("/next-id", checkPermission("inventory:view"), inventoryController.getNextIdInventory);
router.get("/:id", checkPermission("inventory:view"), validate(inventoryIdSchema), inventoryController.getByIdInventory);
router.post("/", checkPermission("inventory:create"), validate(createInventorySchema), inventoryController.createInventory);
router.put("/:id", checkPermission("inventory:update"), validate(updateInventorySchema), inventoryController.updateInventory);
router.delete("/:id", checkPermission("inventory:delete"), validate(inventoryIdSchema), inventoryController.deleteInventory);

export default router;
