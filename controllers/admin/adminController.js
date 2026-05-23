import { adminService } from "../../services/admin/adminService.js";
import { brandSearchService } from "../../services/brandSearch/brandSearchService.js";
import { sendSuccess } from "../../utils/response.js";
import { z } from "zod";

const searchesQuerySchema = z.object({
  limit:    z.coerce.number().int().min(1).max(200).default(50),
  offset:   z.coerce.number().int().min(0).default(0),
  search:   z.string().trim().optional(),
  decision: z.enum(["EXCELLENT","GOOD","AVERAGE","BAD","REJECT"]).optional(),
  dateFrom: z.string().optional(),
  dateTo:   z.string().optional(),
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
      const { limit, offset, search, decision, dateFrom, dateTo } =
        searchesQuerySchema.parse(req.query);
      const filters = {
        search:   search   || undefined,
        decision: decision || undefined,
        dateFrom: dateFrom || undefined,
        dateTo:   dateTo   || undefined,
      };
      const [entries, total] = await Promise.all([
        adminService.getAllSearches({ limit, offset, ...filters }),
        adminService.countAllSearches(filters),
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

  async getAllBrandSearches(req, res, next) {
    try {
      const { limit, offset } = searchesQuerySchema.parse(req.query);
      const { search, decision } = req.query;
      const filters = {
        search:   search   || undefined,
        decision: decision || undefined,
      };
      const [entries, total] = await Promise.all([
        brandSearchService.getAllAdmin({ limit, offset, ...filters }),
        brandSearchService.countAllAdmin(filters),
      ]);
      return sendSuccess(res, { entries, total, limit, offset });
    } catch (err) { next(err); }
  },
};
