import { usageModel } from "../../model/usage/usageModel.js";
import { env } from "../../config/env.js";

const DAILY_LIMIT = 20;

const adminEmails = env.ADMIN_EMAILS
  ? env.ADMIN_EMAILS.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)
  : [];
const isAdmin = (email) => adminEmails.includes(email?.toLowerCase());
const todayStr = () => new Date().toISOString().slice(0, 10); // UTC YYYY-MM-DD

function shape(asin, brand) {
  return {
    asin:  { used: asin,  limit: DAILY_LIMIT, remaining: Math.max(0, DAILY_LIMIT - asin) },
    brand: { used: brand, limit: DAILY_LIMIT, remaining: Math.max(0, DAILY_LIMIT - brand) },
    unlimited: false,
  };
}

export const usageService = {
  DAILY_LIMIT,
  isAdmin,

  // Read-only: today's usage. Admins are unlimited.
  async getUsage(userId, email) {
    if (isAdmin(email)) {
      const inf = { used: 0, limit: null, remaining: null };
      return { asin: inf, brand: inf, unlimited: true };
    }
    const row = await usageModel.today(userId, todayStr());
    return shape(row?.asinCount ?? 0, row?.brandCount ?? 0);
  },

  // Increment one search of `kind` ("asin" | "brand") and return fresh usage.
  async record(userId, email, kind) {
    if (isAdmin(email)) return this.getUsage(userId, email);
    await usageModel.increment(userId, todayStr(), kind === "brand" ? "brand" : "asin");
    return this.getUsage(userId, email);
  },
};
