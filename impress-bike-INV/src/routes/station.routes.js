import { Router } from "express";
import stationController from "../controllers/station.controller.js";
import { authorizeToken, checkPermission } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { createStationSchema, updateStationSchema, stationIdSchema } from "../validations/station.validation.js";

const router = Router();

router.use(authorizeToken);

router.get("/", checkPermission("station:view"), stationController.getAllStations);
router.get("/next-id", checkPermission("station:view"), stationController.getNextIdStation);
router.get("/:id", checkPermission("station:view"), validate(stationIdSchema), stationController.getByIdStation);
router.post("/", checkPermission("station:create"), validate(createStationSchema), stationController.createStation);
router.put("/:id", checkPermission("station:update"), validate(updateStationSchema), stationController.updateStation);
router.delete("/:id", checkPermission("station:delete"), validate(stationIdSchema), stationController.deleteStation);

export default router;
