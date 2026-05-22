import { adminService } from "../../services/admin/adminService.js";
import { sendSuccess } from "../../utils/response.js";
import { z } from "zod";

const paginationSchema = z.object({
  limit:  z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const adminController = {
  async getStats(req, res, next) {
    try {
      const stats = await adminService.getStats();
      return sendSuccess(res, stats);
    } catch (err) { next(err); }
  },

  async getAllSearches(req, res, next) {
    try {
      const { limit, offset } = paginationSchema.parse(req.query);
      const [entries, total] = await Promise.all([
        adminService.getAllSearches({ limit, offset }),
        adminService.countAllSearches(),
      ]);
      return sendSuccess(res, { entries, total, limit, offset });
    } catch (err) { next(err); }
  },

  async getScoringConfig(req, res, next) {
    try {
      const config = await adminService.getScoringConfig();
      return sendSuccess(res, config);
    } catch (err) { next(err); }
  },

  async saveScoringConfig(req, res, next) {
    try {
      const config = await adminService.saveScoringConfig(req.body);
      return sendSuccess(res, config, "Scoring config saved");
    } catch (err) { next(err); }
  },

  async resetScoringConfig(req, res, next) {
    try {
      const def = adminService.getDefaultConfig();
      const config = await adminService.saveScoringConfig(def);
      return sendSuccess(res, config, "Scoring config reset to defaults");
    } catch (err) { next(err); }
  },

  async getBrandScoringConfig(req, res, next) {
    try {
      const config = await adminService.getBrandScoringConfig();
      return sendSuccess(res, config);
    } catch (err) { next(err); }
  },

  async saveBrandScoringConfig(req, res, next) {
    try {
      const config = await adminService.saveBrandScoringConfig(req.body);
      return sendSuccess(res, config, "Brand scoring config saved");
    } catch (err) { next(err); }
  },

  async resetBrandScoringConfig(req, res, next) {
    try {
      const def = adminService.getDefaultBrandConfig();
      const config = await adminService.saveBrandScoringConfig(def);
      return sendSuccess(res, config, "Brand scoring config reset to defaults");
    } catch (err) { next(err); }
  },
};
