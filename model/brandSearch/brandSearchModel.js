import prisma from "../../db/prisma.js";

export const brandSearchModel = {
  create: (userId, data) =>
    prisma.brandSearch.create({
      data: {
        userId,
        asin:                 data.asin,
        brandName:            data.brandName,
        brandWebsite:         data.brandWebsite || null,
        category:             data.category     || null,
        decision:             data.decision,
        score:                data.score,
        maxScore:             data.maxScore,
        scorePct:             data.scorePct,
        rejected:             data.rejected,
        rejectionReasons:     data.rejectionReasons ?? [],
        explanation:          data.explanation  || null,
        hasRegisteredBusiness: data.hasRegisteredBusiness,
        hazmatHeavyCatalog:   data.hazmatHeavyCatalog,
        adultOrHighRisk:      data.adultOrHighRisk,
        massAccountTakedowns: data.massAccountTakedowns,
        lastSaleWithin30Days: data.lastSaleWithin30Days,
        ipComplaintsLast12Mo: data.ipComplaintsLast12Mo ?? 0,
        ipAlertRedFlags:      data.ipAlertRedFlags      ?? false,
        fbaSellersPerAsin:    data.fbaSellersPerAsin    ?? null,
        monthlySalesPerAsin:  data.monthlySalesPerAsin  ?? null,
        mapViolationSensitive: data.mapViolationSensitive ?? false,
      },
    }),

  findByUser: (userId, { limit, offset }) =>
    prisma.brandSearch.findMany({
      where:   { userId },
      orderBy: { createdAt: "desc" },
      take:    limit,
      skip:    offset,
    }),

  countByUser: (userId) =>
    prisma.brandSearch.count({ where: { userId } }),

  deleteOne: (id, userId) =>
    prisma.brandSearch.deleteMany({ where: { id, userId } }),

  deleteAll: (userId) =>
    prisma.brandSearch.deleteMany({ where: { userId } }),

  // Admin — all users with filters
  findAll: ({ limit, offset, search, decision }) => {
    const where = buildAdminWhere({ search, decision });
    return prisma.brandSearch.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: { user: { select: { email: true } } },
    });
  },

  countAll: ({ search, decision } = {}) => {
    const where = buildAdminWhere({ search, decision });
    return prisma.brandSearch.count({ where });
  },
};

function buildAdminWhere({ search, decision } = {}) {
  const where = {};
  if (search) {
    where.OR = [
      { asin:      { contains: search, mode: "insensitive" } },
      { brandName: { contains: search, mode: "insensitive" } },
      { user:      { email: { contains: search, mode: "insensitive" } } },
    ];
  }
  if (decision) where.decision = decision;
  return where;
}
