import bcrypt        from "bcryptjs";
import { randomBytes } from "crypto";
import { authModel }  from "../../model/auth/authModel.js";
import { signToken }  from "../../utils/jwt.js";
import { AppError }   from "../../utils/response.js";
import { env }        from "../../config/env.js";

const adminEmails = env.ADMIN_EMAILS
  ? env.ADMIN_EMAILS.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)
  : [];

const isAdmin = (email) => adminEmails.includes(email?.toLowerCase());

export const authService = {
  /**
   * Register a new user.
   * @param {{ email: string, password: string }} dto
   */
  async register({ email, password }) {
    const existing = await authModel.findByEmail(email);
    if (existing) {
      throw new AppError("Email already in use", 409, "EMAIL_IN_USE");
    }

    const hashed = await bcrypt.hash(password, 12);
    const user   = await authModel.create({ email, password: hashed });
    const token  = signToken({ userId: user.id, email: user.email });

    return { user: { ...user, isAdmin: isAdmin(user.email) }, token };
  },

  /**
   * Login an existing user.
   * @param {{ email: string, password: string }} dto
   */
  async login({ email, password }) {
    const user = await authModel.findByEmail(email);
    if (!user) {
      throw new AppError("Invalid email or password", 401, "INVALID_CREDENTIALS");
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new AppError("Invalid email or password", 401, "INVALID_CREDENTIALS");
    }

    const token = signToken({ userId: user.id, email: user.email });
    const { password: _, resetPasswordToken: __, resetPasswordExpiry: ___, updatedAt: ____, ...safeUser } = user;

    return { user: { ...safeUser, isAdmin: isAdmin(safeUser.email) }, token };
  },

  /**
   * Get authenticated user profile.
   * @param {string} userId
   */
  async getProfile(userId) {
    const user = await authModel.findById(userId);
    if (!user) {
      throw new AppError("User not found", 404, "USER_NOT_FOUND");
    }
    return { ...user, isAdmin: isAdmin(user.email) };
  },

  /**
   * Logout — stateless JWT, so just acknowledge. Client must clear token.
   */
  async logout() {
    return {};
  },

  /**
   * Generate a reset token and store it. Returns token for dev use.
   * In production this would send an email instead.
   * @param {{ email: string }} dto
   */
  async forgotPassword({ email }) {
    const user = await authModel.findByEmail(email);
    if (user) {
      const token  = randomBytes(32).toString("hex");
      const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await authModel.setResetToken(user.id, token, expiry);
      // In production: send this link via email instead of logging.
      const resetUrl = `/reset-password?token=${token}`;
      if (process.env.NODE_ENV !== "production") {
        console.log(`[DEV] Password reset link for ${email}: ${resetUrl}`);
      }
    }
    // Always return the same response — don't reveal whether email exists.
    return {};
  },

  /**
   * Validate reset token and update password.
   * @param {{ token: string, password: string }} dto
   */
  async resetPassword({ token, password }) {
    const user = await authModel.findByResetToken(token);
    if (!user) {
      throw new AppError("Invalid or expired reset token", 400, "INVALID_RESET_TOKEN");
    }
    const hashed = await bcrypt.hash(password, 12);
    await authModel.updatePasswordAndClearToken(user.id, hashed);
    return {};
  },
};
