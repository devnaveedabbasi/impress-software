import { Router } from "express";
import { authorizeToken } from "../middlewares/auth.middleware.js";
import saleGatePassController from "../controllers/sale-gate-pass.controller.js";

const router = Router();

router.use(authorizeToken);

router
    .route("/")
    .get(saleGatePassController.getAllSaleGatePasses)
    .post(saleGatePassController.createSaleGatePass);

router
    .route("/next-id")
    .get(saleGatePassController.getNextIdSaleGatePass);

router
    .route("/:id")
    .get(saleGatePassController.getByIdSaleGatePass)
    .put(saleGatePassController.updateSaleGatePass)
    .delete(saleGatePassController.deleteSaleGatePass);

export default router;
