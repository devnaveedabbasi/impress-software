import { Router } from "express";
import { authorizeToken, checkPermission } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import itemReturnController from "../controllers/item-return.controller.js";
import {
    createItemReturnSchema,
    updateItemReturnSchema,
    itemReturnIdSchema,
} from "../validations/item-return.validation.js";

const router = Router();

router.use(authorizeToken);

router
    .route("/")
    .get(checkPermission("item_return_from_department:view"), itemReturnController.getAllItemReturns)
    .post(checkPermission("item_return_from_department:create"), validate(createItemReturnSchema), itemReturnController.createItemReturn);

router
    .route("/next-id")
    .get(checkPermission("item_return_from_department:view", "item_return_from_department:create"), itemReturnController.getNextIdItemReturn);

router
    .route("/:id")
    .get(checkPermission("item_return_from_department:view"), validate(itemReturnIdSchema), itemReturnController.getByIdItemReturn)
    .put(checkPermission("item_return_from_department:update"), validate(updateItemReturnSchema), itemReturnController.updateItemReturn)
    .delete(checkPermission("item_return_from_department:delete"), validate(itemReturnIdSchema), itemReturnController.deleteItemReturn);

export default router;
