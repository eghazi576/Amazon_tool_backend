import { keepaService } from "../../services/keepa/keepaService.js";
import { usageService } from "../../services/usage/usageService.js";
import { keepaProductSchema } from "../../validations/keepa/keepaValidation.js";
import { sendSuccess, AppError } from "../../utils/response.js";

export const keepaController = {
  /**
   * POST /api/keepa/product
   * Counts against the caller's daily quota: 20 ASIN + 20 brand searches. Brand
   * Intelligence sends context:"brand"; everything else is an ASIN search.
   */
  async fetchProduct(req, res, next) {
    try {
      const dto  = keepaProductSchema.parse(req.body);
      const kind = req.body.context === "brand" ? "brand" : "asin";

      const usage = await usageService.getUsage(req.userId, req.userEmail);
      const remaining = kind === "brand" ? usage.brand.remaining : usage.asin.remaining;
      if (!usage.unlimited && remaining <= 0) {
        throw new AppError(
          `Daily ${kind === "brand" ? "brand" : "ASIN"} search limit reached (${usageService.DAILY_LIMIT}/day). Try again tomorrow.`,
          429, "DAILY_LIMIT_REACHED",
        );
      }

      const result   = await keepaService.fetchProduct(dto);
      const newUsage = await usageService.record(req.userId, req.userEmail, kind);
      return sendSuccess(res, { ...result, usage: newUsage });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/keepa/usage — today's search counts and limits for the caller.
   */
  async usage(req, res, next) {
    try {
      const usage = await usageService.getUsage(req.userId, req.userEmail);
      return sendSuccess(res, usage);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/keepa/graph?asin=<ASIN>&domain=<n>&range=<days>
   * Streams Keepa's rendered chart PNG. Auth-gated because it spends API tokens.
   */
  async graph(req, res, next) {
    try {
      const asin = String(req.query.asin || "").trim().toUpperCase();
      if (!/^[A-Z0-9]{10}$/.test(asin)) throw new AppError("Invalid ASIN", 400);
      const domain = Number(req.query.domain) || 1;
      const range  = Number(req.query.range)  || 90;

      const png = await keepaService.graphImage({ asin, domain, range });

      res.set("Content-Type", "image/png");
      // Cache in the browser for an hour so re-renders and revisits do not spend
      // fresh tokens on the same chart.
      res.set("Cache-Control", "private, max-age=3600");
      return res.send(png);
    } catch (err) {
      next(err);
    }
  },
};
