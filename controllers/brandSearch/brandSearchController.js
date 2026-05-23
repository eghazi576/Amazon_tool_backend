import { brandSearchService } from "../../services/brandSearch/brandSearchService.js";
import { sendSuccess } from "../../utils/response.js";
import { z } from "zod";

const paginationSchema = z.object({
  limit:  z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const saveSchema = z.object({
  asin:                  z.string().length(10),
  brandName:             z.string().min(1),
  brandWebsite:          z.string().optional(),
  category:              z.string().optional(),
  decision:              z.enum(["APPROVED", "REJECTED"]),
  score:                 z.number(),
  maxScore:              z.number(),
  scorePct:              z.number(),
  rejected:              z.boolean(),
  rejectionReasons:      z.array(z.string()).default([]),
  explanation:           z.string().optional(),
  hasRegisteredBusiness: z.boolean(),
  hazmatHeavyCatalog:    z.boolean(),
  adultOrHighRisk:       z.boolean(),
  massAccountTakedowns:  z.boolean(),
  lastSaleWithin30Days:  z.boolean(),
  ipComplaintsLast12Mo:  z.number().default(0),
  ipAlertRedFlags:       z.boolean().default(false),
  fbaSellersPerAsin:     z.number().nullable().optional(),
  monthlySalesPerAsin:   z.number().nullable().optional(),
  mapViolationSensitive: z.boolean().default(false),
});

export const brandSearchController = {
  async save(req, res, next) {
    try {
      const dto    = saveSchema.parse(req.body);
      const record = await brandSearchService.save(req.userId, dto);
      return sendSuccess(res, record, "Brand evaluation saved", 201);
    } catch (err) { next(err); }
  },

  async getHistory(req, res, next) {
    try {
      const { limit, offset } = paginationSchema.parse(req.query);
      const [entries, total]  = await Promise.all([
        brandSearchService.getHistory(req.userId, { limit, offset }),
        brandSearchService.getCount(req.userId),
      ]);
      return sendSuccess(res, { entries, total, limit, offset });
    } catch (err) { next(err); }
  },

  async deleteOne(req, res, next) {
    try {
      await brandSearchService.deleteOne(req.params.id, req.userId);
      return sendSuccess(res, null, "Deleted");
    } catch (err) { next(err); }
  },

  async deleteAll(req, res, next) {
    try {
      await brandSearchService.deleteAll(req.userId);
      return sendSuccess(res, null, "All brand history cleared");
    } catch (err) { next(err); }
  },
};
