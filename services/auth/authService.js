import bcrypt        from "bcryptjs";
import { createHash, randomBytes } from "crypto";
import { authModel }  from "../../model/auth/authModel.js";
import { signToken, signRefreshToken, verifyRefreshToken } from "../../utils/jwt.js";
import { AppError }   from "../../utils/response.js";
import { env }        from "../../config/env.js";

const adminEmails = env.ADMIN_EMAILS
  ? env.ADMIN_EMAILS.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)
  : [];

const isAdmin = (email) => adminEmails.includes(email?.toLowerCase());

const hashToken = (token) => createHash("sha256").update(token).digest("hex");

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function issueTokenPair(user, cleanupExpired = false) {
  const accessToken  = signToken({ userId: user.id, email: user.email });
  const rawRefresh   = randomBytes(40).toString("hex");
  const tokenHash    = hashToken(rawRefresh);
  const expiresAt    = new Date(Date.now() + REFRESH_TTL_MS);

  const ops = [authModel.createRefreshToken({ userId: user.id, tokenHash, expiresAt })];
  if (cleanupExpired) ops.push(authModel.deleteExpiredUserRefreshTokens(user.id));
  await Promise.all(ops);

  return { accessToken, refreshToken: rawRefresh };
}

export const authService = {
  async register({ email, password }) {
    const existing = await authModel.findByEmail(email);
    if (existing) throw new AppError("Email already in use", 409, "EMAIL_IN_USE");

    const hashed = await bcrypt.hash(password, 12);
    const user   = await authModel.create({ email, password: hashed });
    const { accessToken, refreshToken } = await issueTokenPair(user);

    return { user: { ...user, isAdmin: isAdmin(user.email) }, accessToken, refreshToken };
  },

  async login({ email, password }) {
    const user = await authModel.findByEmail(email);
    if (!user) throw new AppError("Invalid email or password", 401, "INVALID_CREDENTIALS");

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) throw new AppError("Invalid email or password", 401, "INVALID_CREDENTIALS");

    const { accessToken, refreshToken } = await issueTokenPair(user, true);
    const { password: _, ...safeUser } = user;

    return { user: { ...safeUser, isAdmin: isAdmin(safeUser.email) }, accessToken, refreshToken };
  },

  async refresh(rawRefreshToken) {
    verifyRefreshToken(rawRefreshToken);
    const tokenHash = hashToken(rawRefreshToken);
    const stored    = await authModel.findRefreshToken(tokenHash);

    if (!stored || stored.expiresAt < new Date())
      throw new AppError("Invalid or expired refresh token", 401, "INVALID_REFRESH_TOKEN");

    const user = await authModel.findById(stored.userId);
    if (!user) throw new AppError("User not found", 404, "USER_NOT_FOUND");

    // Rotate: delete old, issue new pair
    await authModel.deleteRefreshToken(stored.id);
    const { accessToken, refreshToken } = await issueTokenPair(user);

    return { user: { ...user, isAdmin: isAdmin(user.email) }, accessToken, refreshToken };
  },

  async getProfile(userId) {
    const user = await authModel.findById(userId);
    if (!user) throw new AppError("User not found", 404, "USER_NOT_FOUND");
    return { ...user, isAdmin: isAdmin(user.email) };
  },

  /**
   * Permanently delete the account and everything attached to it.
   *
   * The current password is required. A session cookie alone is not enough: if
   * someone walks up to an unlocked laptop, or an XSS steals a session, account
   * destruction should still need something they do not have. This is the same
   * reason GitHub and Google ask you to re-authenticate before a destructive act.
   *
   * The cascade in prisma/schema.prisma does the rest -- searches, brand
   * evaluations and refresh tokens all go with the user row.
   */
  async deleteAccount(userId, password) {
    const user = await authModel.findByIdWithPassword(userId);
    if (!user) throw new AppError("User not found", 404, "USER_NOT_FOUND");

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) throw new AppError("Password is incorrect", 401, "INVALID_CREDENTIALS");

    await authModel.deleteUser(userId);
    return {};
  },

  async logout(rawRefreshToken) {
    if (rawRefreshToken) {
      const tokenHash = hashToken(rawRefreshToken);
      const stored    = await authModel.findRefreshToken(tokenHash).catch(() => null);
      if (stored) await authModel.deleteRefreshToken(stored.id);
    }
    return {};
  },

  async forgotPassword({ email }) {
    const user = await authModel.findByEmail(email);
    if (user) {
      const rawToken   = randomBytes(32).toString("hex");
      const tokenHash  = hashToken(rawToken);
      const expiry     = new Date(Date.now() + 60 * 60 * 1000);
      await authModel.setResetToken(user.id, tokenHash, expiry);
      const resetUrl = `/reset-password?token=${rawToken}`;
      // This log used to print the email AND the raw reset token. Anyone who could
      // read the dev log -- a shared terminal, a CI transcript, a screen share --
      // could take over the account: the token in that URL is the only thing
      // standing between them and a password change. The link is still printed
      // because there is no mail sender yet and the flow is untestable without it,
      // but the identity is gone from the line.
      if (env.NODE_ENV !== "production") {
        console.log(`[DEV] Password reset requested for [REDACTED]. Link: ${resetUrl}`);
      }
    }
    return {};
  },

  async resetPassword({ token, password }) {
    const tokenHash = hashToken(token);
    const user = await authModel.findByResetToken(tokenHash);
    if (!user) throw new AppError("Invalid or expired reset token", 400, "INVALID_RESET_TOKEN");

    const hashed = await bcrypt.hash(password, 12);
    await authModel.updatePasswordAndClearToken(user.id, hashed);
    // Revoke all refresh tokens — password changed, all sessions invalidated
    await authModel.deleteUserRefreshTokens(user.id);
    return {};
  },
};
