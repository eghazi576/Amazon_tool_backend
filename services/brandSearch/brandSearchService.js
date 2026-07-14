import { AppError } from "../../utils/response.js";
import { brandSearchModel } from "../../model/brandSearch/brandSearchModel.js";

export const brandSearchService = {
  save:        (userId, data)              => brandSearchModel.create(userId, data),
  getHistory:  (userId, { limit, offset }) => brandSearchModel.findByUser(userId, { limit, offset }),
  getCount:    (userId)                    => brandSearchModel.countByUser(userId),
  // 404 when nothing matched, rather than a misleading 200. See searchService.
  async deleteOne(id, userId) {
    const { count } = await brandSearchModel.deleteOne(id, userId);
    if (count === 0) throw new AppError("Entry not found", 404, "NOT_FOUND");
  },
  deleteAll:   (userId)                   => brandSearchModel.deleteAll(userId),

  // Admin
  getAllAdmin:   ({ limit, offset, search, decision }) =>
    brandSearchModel.findAll({ limit, offset, search, decision }),
  countAllAdmin: ({ search, decision } = {}) =>
    brandSearchModel.countAll({ search, decision }),
};
