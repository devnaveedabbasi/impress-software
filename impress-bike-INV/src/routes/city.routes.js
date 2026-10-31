import { Router } from "express";
import cityController from "../controllers/city.controller.js";
import { authorizeToken, checkPermission } from "../middlewares/auth.middleware.js";
const router = Router();

router.use(authorizeToken)

router.get("/", checkPermission("city:view"), cityController.getAllCities);
router.get("/next-id", checkPermission("city:view"), cityController.getNextIdCity);
router.get("/:id", checkPermission("city:view"), cityController.getByIdCity);
router.get("/province/:provinceId", checkPermission("city:view"), cityController.getByProvinceId);
router.post("/", checkPermission("city:create"), cityController.createCity);
router.put("/:id", checkPermission("city:update"), cityController.updateCity);
router.delete("/:id", checkPermission("city:delete"), cityController.deleteCity);
export default router;