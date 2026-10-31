import { Router } from "express";
import purchaseOrderController from "../controllers/purchase-order.controller.js";
import { purchaseOrderIdSchema, createPurchaseOrderSchema, updatePurchaseOrderSchema } from "../validations/purchase-order.validation.js";
import { authorizeToken, checkPermission } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";

const router = Router();

router.use(authorizeToken);

router.route("/")
    .get(checkPermission("purchaseOrder:view"), purchaseOrderController.getAllPurchaseOrders)
    .post(checkPermission("purchaseOrder:create"), validate(createPurchaseOrderSchema), purchaseOrderController.createPurchaseOrder);

router.route("/next-id")
    .get(checkPermission("purchaseOrder:view"), purchaseOrderController.getNextIdPurchaseOrder);

router.route("/balance-report")
    .get(checkPermission("purchaseOrder:view"), purchaseOrderController.getPurchaseOrderBalanceReport);

router.route("/:id")
    .get(checkPermission("purchaseOrder:view"), validate(purchaseOrderIdSchema), purchaseOrderController.getByIdPurchaseOrder)
    .put(checkPermission("purchaseOrder:update"), validate(updatePurchaseOrderSchema), purchaseOrderController.updatePurchaseOrder)
    .delete(checkPermission("purchaseOrder:delete"), validate(purchaseOrderIdSchema), purchaseOrderController.deletePurchaseOrder);

export default router;
