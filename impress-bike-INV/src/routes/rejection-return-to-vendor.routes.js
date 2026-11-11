import { Router } from "express";
import { authorizeToken, checkPermission } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import rejectionReturnController from "../controllers/rejection-return-to-vendor.controller.js";
import {
    createRejectionReturnSchema,
    updateRejectionReturnSchema,
    rejectionReturnIdSchema,
} from "../validations/rejection-return-to-vendor.validation.js";

const router = Router();

router.use(authorizeToken);

router
    .route("/")
    .get(checkPermission("rejection_return_to_vendor:view"), rejectionReturnController.getAllRejectionReturns)
    .post(checkPermission("rejection_return_to_vendor:create"), validate(createRejectionReturnSchema), rejectionReturnController.createRejectionReturn);

router
    .route("/next-id")
    .get(checkPermission("rejection_return_to_vendor:view", "rejection_return_to_vendor:create"), rejectionReturnController.getNextIdRejectionReturn);

router
    .route("/:id")
    .get(checkPermission("rejection_return_to_vendor:view"), validate(rejectionReturnIdSchema), rejectionReturnController.getByIdRejectionReturn)
    .put(checkPermission("rejection_return_to_vendor:update"), validate(updateRejectionReturnSchema), rejectionReturnController.updateRejectionReturn)
    .delete(checkPermission("rejection_return_to_vendor:delete"), validate(rejectionReturnIdSchema), rejectionReturnController.deleteRejectionReturn);

export default router;
