import { searchService } from "../../services/search/searchService.js";
import { saveSearchSchema, historyQuerySchema } from "../../validations/search/searchValidation.js";
import { sendSuccess } from "../../utils/response.js";

export const searchController = {
  /**
   * POST /api/search/save
   */
  async save(req, res, next) {
    try {
      const dto   = saveSearchSchema.parse(req.body);
      const entry = await searchService.save(req.userId, dto);
      return sendSuccess(res, { entry }, "Search saved", 201);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/search/history
   */
  async history(req, res, next) {
    try {
      const query  = historyQuerySchema.parse(req.query);
      const result = await searchService.getHistory(req.userId, query);
      return sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },

  /**
   * DELETE /api/search/clear/all
   */
  async clearAll(req, res, next) {
    try {
      await searchService.deleteAll(req.userId);
      return sendSuccess(res, null, "All history cleared");
    } catch (err) {
      next(err);
    }
  },

  /**
   * DELETE /api/search/:id
   */
  async deleteOne(req, res, next) {
    try {
      await searchService.deleteOne(req.params.id, req.userId);
      return sendSuccess(res, null, "Entry deleted");
    } catch (err) {
      next(err);
    }
  },
};
