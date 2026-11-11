import { Router } from "express";
import { authorizeToken, checkPermission } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import saleGatePassController from "../controllers/sale-gate-pass.controller.js";
import {
    createSaleGatePassSchema,
    updateSaleGatePassSchema,
    saleGatePassIdSchema,
} from "../validations/sale-gate-pass.validation.js";

const router = Router();

router.use(authorizeToken);

router
    .route("/")
    .get(checkPermission("sale_gate_pass:view"), saleGatePassController.getAllSaleGatePasses)
    .post(checkPermission("sale_gate_pass:create"), validate(createSaleGatePassSchema), saleGatePassController.createSaleGatePass);

router
    .route("/next-id")
    .get(checkPermission("sale_gate_pass:view", "sale_gate_pass:create"), saleGatePassController.getNextIdSaleGatePass);

router
    .route("/:id")
    .get(checkPermission("sale_gate_pass:view"), validate(saleGatePassIdSchema), saleGatePassController.getByIdSaleGatePass)
    .put(checkPermission("sale_gate_pass:update"), validate(updateSaleGatePassSchema), saleGatePassController.updateSaleGatePass)
    .delete(checkPermission("sale_gate_pass:delete"), validate(saleGatePassIdSchema), saleGatePassController.deleteSaleGatePass);

export default router;
