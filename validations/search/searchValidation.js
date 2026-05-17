import { z } from "zod";

export const saveSearchSchema = z.object({
  asin:             z.string().length(10, "ASIN must be exactly 10 characters").toUpperCase(),
  title:            z.string().optional().nullable(),
  brand:            z.string().optional().nullable(),
  image:            z.string().url().optional().nullable(),
  category:         z.string().optional().nullable(),
  sellingPrice:     z.number().positive().optional().nullable(),
  medianPrice:      z.number().positive().optional().nullable(),
  profit:           z.number().optional().nullable(),
  roi:              z.number().optional().nullable(),
  margin:           z.number().optional().nullable(),
  decision:         z.enum(["EXCELLENT", "GOOD", "AVERAGE", "BAD", "REJECT"]).optional().nullable(),
  score:            z.number().int().optional().nullable(),
  maxScore:         z.number().int().optional().nullable(),
  pct:              z.number().optional().nullable(),
  referralFee:      z.number().optional().nullable(),
  fbaFee:           z.number().optional().nullable(),
  storageFee:       z.number().optional().nullable(),
  totalFees:        z.number().optional().nullable(),
  cogs:             z.number().optional().nullable(),
  breakEven:        z.number().optional().nullable(),
  rejectionReasons: z.array(z.string()).optional().default([]),
  currentRank:      z.number().int().optional().nullable(),
  avgRank90:        z.number().int().optional().nullable(),
  currentRating:    z.number().optional().nullable(),
  currentReviewCount: z.number().int().optional().nullable(),
  currentFbaCount:  z.number().int().optional().nullable(),
  monthlySalesEstimate: z.number().int().optional().nullable(),
  monthlyRevenue:   z.number().optional().nullable(),
  isHazmat:         z.boolean().optional().default(false),
  amazonIsSeller:   z.boolean().optional().default(false),
});

export const historyQuerySchema = z.object({
  limit:  z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});
