import prisma from "../../db/prisma.js";

export const authModel = {
  /**
   * Find user by email.
   * @param {string} email
   */
  findByEmail: (email) =>
    prisma.user.findUnique({ where: { email } }),

  /**
   * Find user by ID.
   * @param {string} id
   */
  findById: (id) =>
    prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, createdAt: true },
    }),

  /**
   * Create a new user.
   * @param {{ email: string, password: string }} data
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
      where: { id },
      data: { resetPasswordToken: token, resetPasswordExpiry: expiry },
    }),

  /**
   * Find user by a valid (not-expired) reset token.
   */
  findByResetToken: (token) =>
    prisma.user.findFirst({
      where: {
        resetPasswordToken:  token,
        resetPasswordExpiry: { gt: new Date() },
      },
    }),

  /**
   * Update password and clear the reset token.
   */
  updatePasswordAndClearToken: (id, hashedPassword) =>
    prisma.user.update({
      where: { id },
      data: {
        password:            hashedPassword,
        resetPasswordToken:  null,
        resetPasswordExpiry: null,
      },
      select: { id: true, email: true, createdAt: true },
    }),
};
