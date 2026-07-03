import prisma from "../../db/prisma.js";

const SEARCH_SELECT = {
  id: true, createdAt: true, asin: true, title: true, brand: true, image: true,
  category: true, sellingPrice: true, medianPrice90d: true, profitPerUnit: true,
  roiPct: true, marginPct: true, referralFee: true, fbaFee: true, storageFee: true,
  totalFees: true, cogs: true, breakEvenPrice: true, decision: true, score: true,
  maxScore: true, scorePct: true, rejectionReasons: true, currentBsr: true,
  avgBsr90d: true, rating: true, reviewCount: true, fbaSellerCount: true,
  monthlySalesEst: true, monthlyRevenue: true, isHazmat: true, amazonIsSeller: true,
};

export const searchModel = {
  /**
   * Save a new ASIN search record.
   */
  create: (userId, data) =>
    prisma.asinSearch.create({
      data: {
        userId,
        asin:            data.asin,
        title:           data.title,
        brand:           data.brand,
        image:           data.image,
        category:        data.category,
        sellingPrice:    data.sellingPrice,
        medianPrice90d:  data.medianPrice,
        profitPerUnit:   data.profit,
        roiPct:          data.roi,
        marginPct:       data.margin,
        decision:        data.decision,
        score:           data.score,
        maxScore:        data.maxScore,
        scorePct:        data.pct,
        referralFee:     data.referralFee,
        fbaFee:          data.fbaFee,
        storageFee:      data.storageFee,
        totalFees:       data.totalFees,
        cogs:            data.cogs,
        breakEvenPrice:  data.breakEven,
        rejectionReasons: data.rejectionReasons ?? [],
        currentBsr:      data.currentRank,
        avgBsr90d:       data.avgRank90,
        rating:          data.currentRating,
        reviewCount:     data.currentReviewCount,
        fbaSellerCount:  data.currentFbaCount,
        monthlySalesEst: data.monthlySalesEstimate,
        monthlyRevenue:  data.monthlyRevenue,
        isHazmat:        data.isHazmat ?? false,
        amazonIsSeller:  data.amazonIsSeller ?? false,
      },
      select: SEARCH_SELECT,
    }),

  /**
   * Get paginated history for a user.
   */
  findByUser: (userId, { limit, offset }) =>
    prisma.asinSearch.findMany({
      where:   { userId },
      orderBy: { createdAt: "desc" },
      take:    limit,
      skip:    offset,
      select:  SEARCH_SELECT,
    }),

  /**
   * Count total searches for a user.
   */
  countByUser: (userId) =>
    prisma.asinSearch.count({ where: { userId } }),

  /**
   * Delete a single search by ID (only if it belongs to the user).
   */
  deleteOne: (id, userId) =>
    prisma.asinSearch.deleteMany({ where: { id, userId } }),

  /**
   * Delete all searches for a user.
   */
  deleteAll: (userId) =>
    prisma.asinSearch.deleteMany({ where: { userId } }),
};
