import { Router } from "express";
import purchaseOrderController from "../controllers/purchase-order.controller.js";
import { purchaseOrderIdSchema, createPurchaseOrderSchema, updatePurchaseOrderSchema } from "../validations/purchase-order.validation.js";
import { authorizeToken, checkPermission } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";

const router = Router();

router.use(authorizeToken);

router.route("/")
    .get(checkPermission("purchase_order:view", "inward_quality_control:view", "inward_quality_control:create"), purchaseOrderController.getAllPurchaseOrders)
    .post(checkPermission("purchase_order:create"), validate(createPurchaseOrderSchema), purchaseOrderController.createPurchaseOrder);

router.route("/next-id")
    .get(checkPermission("purchase_order:view", "purchase_order:create"), purchaseOrderController.getNextIdPurchaseOrder);

router.route("/balance-report")
    .get(checkPermission("purchase_order:view", "inward_quality_control:view", "inward_quality_control_report:view"), purchaseOrderController.getPurchaseOrderBalanceReport);

router.route("/:id")
    .get(checkPermission("purchase_order:view", "inward_quality_control:view", "inward_quality_control:create"), validate(purchaseOrderIdSchema), purchaseOrderController.getByIdPurchaseOrder)
    .put(checkPermission("purchase_order:update"), validate(updatePurchaseOrderSchema), purchaseOrderController.updatePurchaseOrder)
    .delete(checkPermission("purchase_order:delete"), validate(purchaseOrderIdSchema), purchaseOrderController.deletePurchaseOrder);

export default router;
