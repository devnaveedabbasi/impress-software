import { Router } from "express";
import categoryController from "../controllers/category.controller.js";
import { authorizeToken, checkPermission } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { createCategorySchema, updateCategorySchema, categoryIdSchema } from "../validations/category.validation.js";

const router = Router();

router.use(authorizeToken);

router.get("/", checkPermission("category:view"), categoryController.getAllCategories);
router.get("/next-id", checkPermission("category:view"), categoryController.getNextIdCategory);
router.get("/:id", checkPermission("category:view"), validate(categoryIdSchema), categoryController.getByIdCategory);
router.post("/", checkPermission("category:create"), validate(createCategorySchema), categoryController.createCategory);
router.put("/:id", checkPermission("category:update"), validate(updateCategorySchema), categoryController.updateCategory);
router.delete("/:id", checkPermission("category:delete"), validate(categoryIdSchema), categoryController.deleteCategory);

export default router;
