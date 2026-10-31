import { Router } from "express";
import inwardController from "../controllers/inward.controller.js";
import { inwardIdSchema, createInwardSchema, updateInwardSchema } from "../validations/inward.validation.js";
import { authorizeToken, checkPermission } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";

const router = Router();

router.use(authorizeToken);

router.route("/")
    .get(checkPermission("inward:view"), inwardController.getAllInwards)
    .post(checkPermission("inward:create"), validate(createInwardSchema), inwardController.createInward);

router.route("/next-id")
    .get(checkPermission("inward:view"), inwardController.getNextIdInward);

router.route("/report")
    .get(checkPermission("inward_quality_control_report:view"), inwardController.getInwardReport);

router.route("/:id")
    .get(checkPermission("inward:view"), validate(inwardIdSchema), inwardController.getByIdInward)
    .put(checkPermission("inward:update"), validate(updateInwardSchema), inwardController.updateInward)
    .delete(checkPermission("inward:delete"), validate(inwardIdSchema), inwardController.deleteInward);

export default router;
