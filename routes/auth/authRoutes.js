import { Router } from "express";
import { authController } from "../../controllers/auth/authController.js";
import { requireAuth } from "../../middlewares/requireAuth.js";

const router = Router();

// Public routes
router.post("/register",        authController.register);
router.post("/login",           authController.login);
router.post("/refresh",         authController.refresh);
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password",  authController.resetPassword);

// Protected routes
router.get(   "/me",      requireAuth, authController.me);
router.post(  "/logout",  authController.logout);

// Right to erasure. Requires the current password in the body, not just a
// session -- see authService.deleteAccount().
router.delete("/account", requireAuth, authController.deleteAccount);

export default router;
