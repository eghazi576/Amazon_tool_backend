import prisma from "../../db/prisma.js";

const SCORING_KEY       = "scoring_config";
const BRAND_SCORING_KEY = "brand_scoring_config";

const DEFAULT_BRAND_CONFIG = {
  approvalPct: 70, minFbaSellers: 3, maxFbaSellers: 5,
  minMonthlySales: 100, maxIpComplaints: 1,
  weights: {
    website: 10, registeredBusiness: 10, noHazmat: 10,
    noAdultRisk: 10, noTakedowns: 10, brandActive: 10,
    noIPComplaints: 10, noCounterfeit: 5, fbaSellers: 5,
    salesVelocity: 5,
  },
};

const DEFAULT_CONFIG = {
  // Hard rejection thresholds
  maxBsr:         50000,
  minMonthlySales: 100,
  minRoi:          20,
  minFbaSellers:    3,
  maxFbaSellers:   15,
  minRating:      4.3,
  minReviews:     100,
  minPrice:         8,
  // Decision thresholds (%)
  excellentPct: 80,
  goodPct:      60,
  averagePct:   40,
  // Criterion weights
  weights: {
    notSeasonal:     10,
    sales:           10,
    noRankSpikes:    10,
    roi:             10,
    profit:          10,
    bbRotates:       10,
    noAmazon:        10,
    storageFee:       5,
    mapAllows:        5,
    fbaCount:         5,
    noRepricers:      5,
    sellerRotation:   5,
    rating:           5,
    reviews:          2,
    minPrice:         2,
  },
};

export const adminModel = {
  getAllSearches: ({ limit, offset }) =>
    prisma.asinSearch.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: { user: { select: { email: true } } },
    }),

  countAllSearches: () => prisma.asinSearch.count(),

  getStats: async () => {
    const [totalUsers, totalSearches, recentSearches] = await Promise.all([
      prisma.user.count(),
      prisma.asinSearch.count(),
      prisma.asinSearch.count({
        where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      }),
    ]);
    return { totalUsers, totalSearches, recentSearches };
  },

  getScoringConfig: async () => {
    const row = await prisma.appConfig.findUnique({ where: { key: SCORING_KEY } });
    return row ? row.value : DEFAULT_CONFIG;
  },

  saveScoringConfig: async (config) => {
    await prisma.appConfig.upsert({
      where:  { key: SCORING_KEY },
      update: { value: config },
      create: { key: SCORING_KEY, value: config },
    });
    return config;
  },

  getDefaultConfig: () => DEFAULT_CONFIG,

  getBrandScoringConfig: async () => {
    const row = await prisma.appConfig.findUnique({ where: { key: BRAND_SCORING_KEY } });
    return row ? row.value : DEFAULT_BRAND_CONFIG;
  },

  saveBrandScoringConfig: async (config) => {
    await prisma.appConfig.upsert({
      where:  { key: BRAND_SCORING_KEY },
      update: { value: config },
      create: { key: BRAND_SCORING_KEY, value: config },
    });
    return config;
  },

  getDefaultBrandConfig: () => DEFAULT_BRAND_CONFIG,
};
