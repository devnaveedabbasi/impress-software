import { Router } from "express";
import quotationController from "../controllers/quotation.controller.js";
import { authorizeToken, checkPermission } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { createQuotationSchema, updateQuotationSchema, quotationIdSchema } from "../validations/quotation.validation.js";

const router = Router();

router.use(authorizeToken);

router.get("/", checkPermission("quotation:view"), quotationController.getAllQuotations);
router.get("/next-id", checkPermission("quotation:view"), quotationController.getNextIdQuotation);
router.get("/:id", checkPermission("quotation:view"), validate(quotationIdSchema), quotationController.getByIdQuotation);
router.post("/", checkPermission("quotation:create"), validate(createQuotationSchema), quotationController.createQuotation);
router.put("/:id", checkPermission("quotation:update"), validate(updateQuotationSchema), quotationController.updateQuotation);
router.delete("/:id", checkPermission("quotation:delete"), validate(quotationIdSchema), quotationController.deleteQuotation);

export default router;
