import { z } from "zod";

export const keepaProductSchema = z.object({
  asin: z
    .string({ required_error: "ASIN is required" })
    .regex(/^[A-Z0-9]{10}$/i, "ASIN must be exactly 10 alphanumeric characters"),
  domain:            z.number().int().min(1).max(10).default(1),
  cogs:              z.number().min(0).default(0),
  manualWeightG:     z.number().min(0).default(0),
  manualReferralRate: z.number().min(0).max(100).nullable().default(null),
});
