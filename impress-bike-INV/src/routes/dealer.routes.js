import { Router } from "express";
import dealerController from "../controllers/dealer.controller.js";
import { authorizeToken, checkPermission } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { createDealerSchema, updateDealerSchema, dealerIdSchema } from "../validations/dealer.validation.js";

const router = Router();

router.use(authorizeToken);

router.get("/", checkPermission("dealer:view"), dealerController.getAllDealers);
router.get("/next-id", checkPermission("dealer:view"), dealerController.getNextIdDealer);
router.get("/:id", checkPermission("dealer:view"), validate(dealerIdSchema), dealerController.getByIdDealer);
router.post("/", checkPermission("dealer:create"), validate(createDealerSchema), dealerController.createDealer);
router.put("/:id", checkPermission("dealer:update"), validate(updateDealerSchema), dealerController.updateDealer);
router.delete("/:id", checkPermission("dealer:delete"), validate(dealerIdSchema), dealerController.deleteDealer);

export default router;
