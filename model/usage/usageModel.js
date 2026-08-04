import prisma from "../../db/prisma.js";

export const usageModel = {
  today: (userId, day) =>
    prisma.dailyUsage.findUnique({ where: { userId_day: { userId, day } } }),

  increment: (userId, day, kind) =>
    prisma.dailyUsage.upsert({
      where:  { userId_day: { userId, day } },
      update: kind === "brand" ? { brandCount: { increment: 1 } } : { asinCount: { increment: 1 } },
      create: {
        userId, day,
        asinCount:  kind === "brand" ? 0 : 1,
        brandCount: kind === "brand" ? 1 : 0,
      },
    }),
};
