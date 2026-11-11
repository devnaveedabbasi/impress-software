import { Router } from "express";
import { authorizeToken, checkPermission } from "../middlewares/auth.middleware.js";
import stockController from "../controllers/stock.controller.js";

const router = Router();

router.use(authorizeToken);

router.get("/ledger", checkPermission("item_ledger:view"), stockController.getItemLedger);

export default router;
