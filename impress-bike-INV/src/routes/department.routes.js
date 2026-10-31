import { Router } from "express";
import departmentController from "../controllers/department.controller.js";
import { authorizeToken, checkPermission } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { createDepartmentSchema, updateDepartmentSchema, departmentIdSchema } from "../validations/department.validation.js";

const router = Router();

router.use(authorizeToken);

router.get("/", checkPermission("department:view"), departmentController.getAllDepartments);
router.get("/next-id", checkPermission("department:view"), departmentController.getNextIdDepartment);
router.get("/:id", checkPermission("department:view"), validate(departmentIdSchema), departmentController.getByIdDepartment);
router.post("/", checkPermission("department:create"), validate(createDepartmentSchema), departmentController.createDepartment);
router.put("/:id", checkPermission("department:update"), validate(updateDepartmentSchema), departmentController.updateDepartment);
router.delete("/:id", checkPermission("department:delete"), validate(departmentIdSchema), departmentController.deleteDepartment);

export default router;
