import { keepaService } from "../../services/keepa/keepaService.js";
import { keepaProductSchema } from "../../validations/keepa/keepaValidation.js";
import { sendSuccess, AppError } from "../../utils/response.js";

export const keepaController = {
  /**
   * POST /api/keepa/product
   */
  async fetchProduct(req, res, next) {
    try {
      const dto    = keepaProductSchema.parse(req.body);
      const result = await keepaService.fetchProduct(dto);
      return sendSuccess(res, result);
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
