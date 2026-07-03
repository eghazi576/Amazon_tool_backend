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
};
