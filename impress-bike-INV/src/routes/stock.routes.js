import { Router } from "express";
import { authorizeToken, checkPermission } from "../middlewares/auth.middleware.js";
import stockController from "../controllers/stock.controller.js";
import stockReportController from "../controllers/stock-report.controller.js";

const router = Router();

router.use(authorizeToken);

router.get("/ledger", checkPermission("item_ledger:view"), stockController.getItemLedger);
router.get("/register", checkPermission("stock_register:view"), stockReportController.getStockRegister);
router.get("/position", checkPermission("stock_ledger:view"), stockReportController.getStockPosition);
router.get("/movements", checkPermission("stock_ledger:view"), stockReportController.getStockMovements);
router.get("/shortage", checkPermission("shortage_report:view"), stockReportController.getShortageReport);
router.get("/issues", checkPermission("issue_report:view"), stockReportController.getIssueReport);

export default router;
