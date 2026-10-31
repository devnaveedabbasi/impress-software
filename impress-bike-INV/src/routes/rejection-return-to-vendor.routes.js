import { Router } from "express";
import { authorizeToken } from "../middlewares/auth.middleware.js";
import rejectionReturnController from "../controllers/rejection-return-to-vendor.controller.js";

const router = Router();

router.use(authorizeToken);

router
    .route("/")
    .get(rejectionReturnController.getAllRejectionReturns)
    .post(rejectionReturnController.createRejectionReturn);

router
    .route("/next-id")
    .get(rejectionReturnController.getNextIdRejectionReturn);

router
    .route("/:id")
    .get(rejectionReturnController.getByIdRejectionReturn)
    .put(rejectionReturnController.updateRejectionReturn)
    .delete(rejectionReturnController.deleteRejectionReturn);

export default router;
