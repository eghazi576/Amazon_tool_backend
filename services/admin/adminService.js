import { adminModel } from "../../model/admin/adminModel.js";

export const adminService = {
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
