import { Router } from "express";
import { authController } from "../../controllers/auth/authController.js";
import { requireAuth } from "../../middlewares/requireAuth.js";

const router = Router();

// Public sign-up is disabled: accounts are provisioned by an admin from the
// dashboard (POST /api/admin/users). Login only for everyone else.
router.post("/register", (_req, res) =>
  res.status(403).json({ error: "Public sign-up is disabled. Ask an administrator for an account." }));
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
