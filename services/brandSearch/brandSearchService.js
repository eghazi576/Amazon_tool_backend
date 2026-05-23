import { brandSearchModel } from "../../model/brandSearch/brandSearchModel.js";

export const brandSearchService = {
  save:        (userId, data)              => brandSearchModel.create(userId, data),
  getHistory:  (userId, { limit, offset }) => brandSearchModel.findByUser(userId, { limit, offset }),
  getCount:    (userId)                    => brandSearchModel.countByUser(userId),
  deleteOne:   (id, userId)               => brandSearchModel.deleteOne(id, userId),
  deleteAll:   (userId)                   => brandSearchModel.deleteAll(userId),

  // Admin
  getAllAdmin:   ({ limit, offset, search, decision }) =>
    brandSearchModel.findAll({ limit, offset, search, decision }),
  countAllAdmin: ({ search, decision } = {}) =>
    brandSearchModel.countAll({ search, decision }),
};
