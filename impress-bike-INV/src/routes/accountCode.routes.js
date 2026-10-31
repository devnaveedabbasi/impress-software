import { Router } from "express";
import accountCodeController from "../controllers/accountCode.controller.js";
import { authorizeToken, checkPermission } from "../middlewares/auth.middleware.js";
const router = Router();

router.use(authorizeToken)

router.get("/", checkPermission("account_code:view"), accountCodeController.getAllAccountCodes);
router.get("/next-id", checkPermission("account_code:view"), accountCodeController.getNextId);
router.get("/:id", checkPermission("account_code:view"), accountCodeController.getByIdAccountCode);
router.post("/", checkPermission("account_code:create"), accountCodeController.createAccountCode);
router.put("/:id", checkPermission("account_code:update"), accountCodeController.updateAccountCode);
router.delete("/:id", checkPermission("account_code:delete"), accountCodeController.deleteAccountCode);

export default router;