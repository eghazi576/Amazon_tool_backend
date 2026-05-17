import { authService } from "../../services/auth/authService.js";
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "../../validations/auth/authValidation.js";
import { sendSuccess } from "../../utils/response.js";

export const authController = {
  /**
   * POST /api/auth/register
   */
  async register(req, res, next) {
    try {
      const dto    = registerSchema.parse(req.body);
      const result = await authService.register(dto);
      return sendSuccess(res, result, "Account created successfully", 201);
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/auth/login
   */
  async login(req, res, next) {
    try {
      const dto    = loginSchema.parse(req.body);
      const result = await authService.login(dto);
      return sendSuccess(res, result, "Login successful");
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/auth/me
   */
  async me(req, res, next) {
    try {
      const user = await authService.getProfile(req.userId);
      return sendSuccess(res, { user });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/auth/logout
   */
  async logout(req, res, next) {
    try {
      await authService.logout();
      return sendSuccess(res, {}, "Logged out successfully");
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/auth/forgot-password
   */
  async forgotPassword(req, res, next) {
    try {
      const dto    = forgotPasswordSchema.parse(req.body);
      const result = await authService.forgotPassword(dto);
      return sendSuccess(res, result, "If that email exists, a reset link has been generated");
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/auth/reset-password
   */
  async resetPassword(req, res, next) {
    try {
      const dto = resetPasswordSchema.parse(req.body);
      await authService.resetPassword(dto);
      return sendSuccess(res, {}, "Password reset successfully");
    } catch (err) {
      next(err);
    }
  },
};
