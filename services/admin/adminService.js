import { adminModel } from "../../model/admin/adminModel.js";

export const adminService = {
  getAllSearches: ({ limit, offset }) =>
    adminModel.getAllSearches({ limit, offset }),

  countAllSearches: () =>
    adminModel.countAllSearches(),

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
