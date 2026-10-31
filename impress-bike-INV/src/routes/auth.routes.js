import { Router } from "express";
import authController from "../controllers/auth.controller.js";
import { authorizeToken } from "../middlewares/auth.middleware.js";
const router = Router();

router.post('/register', authController.register);
router.post('/login', authController.login);

router.use(authorizeToken)
router.patch('/change-password', authController.changePassword);
router.post('/logout', authController.logout);
router.get('/me', authController.getCurrentUser);
router.put('/update-profile', authController.updateProfile);

export default router;
