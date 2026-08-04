import bcrypt from "bcryptjs";
import { adminModel } from "../../model/admin/adminModel.js";
import { AppError } from "../../utils/response.js";

export const adminService = {
  // ── User management ───────────────────────────────────────────────────────
  listUsers: () => adminModel.listUsers(),

  createUser: async ({ email, password }) => {
    const existing = await adminModel.findUserByEmail(email);
    if (existing) throw new AppError("Email already in use", 409, "EMAIL_IN_USE");
    const hashed = await bcrypt.hash(password, 12);
    return adminModel.createUser({ email, password: hashed });
  },

  deleteUser: (id) => adminModel.deleteUser(id),

  getAllSearches: ({ limit, offset, search, decision, dateFrom, dateTo }) =>
    adminModel.getAllSearches({ limit, offset, search, decision, dateFrom, dateTo }),

  countAllSearches: ({ search, decision, dateFrom, dateTo } = {}) =>
    adminModel.countAllSearches({ search, decision, dateFrom, dateTo }),

  getStats: () =>
    adminModel.getStats(),

  getScoringConfig: () =>
    adminModel.getScoringConfig(),

  saveScoringConfig: (config) =>
    adminModel.saveScoringConfig(config),

  getDefaultConfig: () =>
    adminModel.getDefaultConfig(),

  getBrandScoringConfig: () =>
    adminModel.getBrandScoringConfig(),

  saveBrandScoringConfig: (config) =>
    adminModel.saveBrandScoringConfig(config),

  getDefaultBrandConfig: () =>
    adminModel.getDefaultBrandConfig(),
};
