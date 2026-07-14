import prisma from "../../db/prisma.js";

export const authModel = {
  /**
   * Find user by email — returns only fields needed for login/auth.
   * Excludes resetPasswordToken to prevent accidental token leakage via logs.
   */
  findByEmail: (email) =>
    prisma.user.findUnique({
      where:  { email },
      select: { id: true, email: true, password: true, createdAt: true },
    }),

  /**
   * Find user by ID — public profile fields only.
   */
  findById: (id) =>
    prisma.user.findUnique({
      where:  { id },
      select: { id: true, email: true, createdAt: true },
    }),

  /**
   * Find a user by ID *including* the password hash.
   *
   * Deliberately separate from findById(), which never selects the password.
   * Only the delete-account flow uses this, and only to bcrypt.compare() the
   * confirmation the user typed. The hash never leaves this file's caller.
   */
  findByIdWithPassword: (id) =>
    prisma.user.findUnique({
      where:  { id },
      select: { id: true, email: true, password: true },
    }),

  /**
   * Delete a user and everything belonging to them.
   *
   * AsinSearch, BrandSearch and RefreshToken all declare
   * `onDelete: Cascade` on their user relation (prisma/schema.prisma), so this
   * single delete removes the account, every product lookup, every brand
   * evaluation and every session. There is nothing left to anonymise.
   */
  deleteUser: (id) =>
    prisma.user.delete({ where: { id }, select: { id: true } }),

  /**
   * Create a new user.
   */
  create: (data) =>
    prisma.user.create({
      data,
      select: { id: true, email: true, createdAt: true },
    }),

  /**
   * Store a reset token with expiry on a user.
   */
  setResetToken: (id, token, expiry) =>
    prisma.user.update({
      where:  { id },
      data:   { resetPasswordToken: token, resetPasswordExpiry: expiry },
      select: { id: true },
    }),

  /**
   * Find user by a valid (not-expired) reset token.
   * Returns only id — nothing else needed for the reset flow.
   */
  findByResetToken: (token) =>
    prisma.user.findFirst({
      where: {
        resetPasswordToken:  token,
        resetPasswordExpiry: { gt: new Date() },
      },
      select: { id: true },
    }),

  /**
   * Update password and clear the reset token.
   */
  updatePasswordAndClearToken: (id, hashedPassword) =>
    prisma.user.update({
      where:  { id },
      data: {
        password:            hashedPassword,
        resetPasswordToken:  null,
        resetPasswordExpiry: null,
      },
      select: { id: true },
    }),

  // ─── Refresh token CRUD ───────────────────────────────────────────────────

  createRefreshToken: (data) =>
    prisma.refreshToken.create({ data }),

  deleteExpiredUserRefreshTokens: (userId) =>
    prisma.refreshToken.deleteMany({
      where: { userId, expiresAt: { lt: new Date() } },
    }),

  findRefreshToken: (tokenHash) =>
    prisma.refreshToken.findUnique({ where: { tokenHash } }),

  deleteRefreshToken: (id) =>
    prisma.refreshToken.delete({ where: { id } }),

  deleteUserRefreshTokens: (userId) =>
    prisma.refreshToken.deleteMany({ where: { userId } }),
};
