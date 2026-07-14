import { authService } from "../../services/auth/authService.js";
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  deleteAccountSchema,
} from "../../validations/auth/authValidation.js";
import { sendSuccess } from "../../utils/response.js";
import { env } from "../../config/env.js";

const isProd = env.NODE_ENV === "production";

const COOKIE_BASE = {
  httpOnly: true,
  secure:   isProd,
  sameSite: "lax",
};

function setAuthCookies(res, accessToken, refreshToken) {
  res.cookie("access_token", accessToken, {
    ...COOKIE_BASE,
    maxAge: 15 * 60 * 1000, // 15 minutes
  });
  res.cookie("refresh_token", refreshToken, {
    ...COOKIE_BASE,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path:   "/api/auth",
  });
}

function clearAuthCookies(res) {
  res.clearCookie("access_token",  { ...COOKIE_BASE });
  res.clearCookie("refresh_token", { ...COOKIE_BASE, path: "/api/auth" });
}

export const authController = {
  async register(req, res, next) {
    try {
      const dto = registerSchema.parse(req.body);
      const { user, accessToken, refreshToken } = await authService.register(dto);
      setAuthCookies(res, accessToken, refreshToken);
      return sendSuccess(res, { user }, "Account created successfully", 201);
    } catch (err) { next(err); }
  },

  async login(req, res, next) {
    try {
      const dto = loginSchema.parse(req.body);
      const { user, accessToken, refreshToken } = await authService.login(dto);
      setAuthCookies(res, accessToken, refreshToken);
      return sendSuccess(res, { user }, "Login successful");
    } catch (err) { next(err); }
  },

  async refresh(req, res, next) {
    try {
      const rawRefreshToken = req.cookies?.refresh_token;
      const { user, accessToken, refreshToken } = await authService.refresh(rawRefreshToken);
      setAuthCookies(res, accessToken, refreshToken);
      return sendSuccess(res, { user }, "Token refreshed");
    } catch (err) { next(err); }
  },

  async me(req, res, next) {
    try {
      const user = await authService.getProfile(req.userId);
      return sendSuccess(res, { user });
    } catch (err) { next(err); }
  },

  async logout(req, res, next) {
    try {
      const rawRefreshToken = req.cookies?.refresh_token;
      await authService.logout(rawRefreshToken);
      clearAuthCookies(res);
      return sendSuccess(res, {}, "Logged out successfully");
    } catch (err) { next(err); }
  },

  async forgotPassword(req, res, next) {
    try {
      const dto = forgotPasswordSchema.parse(req.body);
      await authService.forgotPassword(dto);
      return sendSuccess(res, {}, "If that email exists, a reset link has been generated");
    } catch (err) { next(err); }
  },

  async resetPassword(req, res, next) {
    try {
      const dto = resetPasswordSchema.parse(req.body);
      await authService.resetPassword(dto);
      clearAuthCookies(res);
      return sendSuccess(res, {}, "Password reset successfully");
    } catch (err) { next(err); }
  },

  /**
   * Permanently delete the account and everything attached to it.
   *
   * The Privacy Policy promises this, so it has to exist as a real endpoint --
   * and it deletes rather than anonymises. The cascade in the schema takes the
   * searches, brand evaluations and sessions with it.
   */
  async deleteAccount(req, res, next) {
    try {
      const { password } = deleteAccountSchema.parse(req.body);
      await authService.deleteAccount(req.userId, password);
      clearAuthCookies(res);
      return sendSuccess(res, {}, "Account and all associated data permanently deleted");
    } catch (err) { next(err); }
  },
};
