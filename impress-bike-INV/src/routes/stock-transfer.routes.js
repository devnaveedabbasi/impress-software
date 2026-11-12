import { Router } from "express";
import { authorizeToken, checkPermission } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import stockTransferController from "../controllers/stock-transfer.controller.js";
import {
    createStockTransferSchema,
    updateStockTransferSchema,
    stockTransferIdSchema,
} from "../validations/stock-transfer.validation.js";

const router = Router();

router.use(authorizeToken);

router
    .route("/")
    .get(checkPermission("transfer_form:view"), stockTransferController.getAllStockTransfers)
    .post(checkPermission("transfer_form:create"), validate(createStockTransferSchema), stockTransferController.createStockTransfer);

router
    .route("/next-id")
    .get(checkPermission("transfer_form:view", "transfer_form:create"), stockTransferController.getNextIdStockTransfer);

router
    .route("/:id")
    .get(checkPermission("transfer_form:view"), validate(stockTransferIdSchema), stockTransferController.getByIdStockTransfer)
    .put(checkPermission("transfer_form:update"), validate(updateStockTransferSchema), stockTransferController.updateStockTransfer)
    .delete(checkPermission("transfer_form:delete"), validate(stockTransferIdSchema), stockTransferController.deleteStockTransfer);

export default router;
