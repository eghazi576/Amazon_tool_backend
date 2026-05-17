import { keepaService } from "../../services/keepa/keepaService.js";
import { keepaProductSchema } from "../../validations/keepa/keepaValidation.js";
import { sendSuccess } from "../../utils/response.js";

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
};
