import { Router } from "express";
import { authorizeToken, checkPermission } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import rejectionReceivedController from "../controllers/rejection-received-from-dealer.controller.js";
import {
    createRejectionReceivedSchema,
    updateRejectionReceivedSchema,
    rejectionReceivedIdSchema,
} from "../validations/rejection-received-from-dealer.validation.js";

const router = Router();

router.use(authorizeToken);

router
    .route("/")
    .get(checkPermission("rejection_received_from_dealer:view"), rejectionReceivedController.getAllRejectionReceiveds)
    .post(checkPermission("rejection_received_from_dealer:create"), validate(createRejectionReceivedSchema), rejectionReceivedController.createRejectionReceived);

router
    .route("/next-id")
    .get(checkPermission("rejection_received_from_dealer:view", "rejection_received_from_dealer:create"), rejectionReceivedController.getNextIdRejectionReceived);

router
    .route("/:id")
    .get(checkPermission("rejection_received_from_dealer:view"), validate(rejectionReceivedIdSchema), rejectionReceivedController.getByIdRejectionReceived)
    .put(checkPermission("rejection_received_from_dealer:update"), validate(updateRejectionReceivedSchema), rejectionReceivedController.updateRejectionReceived)
    .delete(checkPermission("rejection_received_from_dealer:delete"), validate(rejectionReceivedIdSchema), rejectionReceivedController.deleteRejectionReceived);

export default router;
