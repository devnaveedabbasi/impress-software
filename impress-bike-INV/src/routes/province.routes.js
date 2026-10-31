import express from "express";
import provinceController from "../controllers/province.controller.js";
import { authorizeToken, checkPermission } from "../middlewares/auth.middleware.js";
const router = express.Router();

router.use(authorizeToken)

router.route("/").get(checkPermission("province:view"), provinceController.getAllProvinces);
router.route("/next-id").get(checkPermission("province:view"), provinceController.getNextIdProvince);
router.route("/:id").get(checkPermission("province:view"), provinceController.getByIdProvince);
router.route("/").post(checkPermission("province:create"), provinceController.createProvince);
router.route("/:id").put(checkPermission("province:update"), provinceController.updateProvince);
router.route("/:id").delete(checkPermission("province:delete"), provinceController.deleteProvince);

export default router;
