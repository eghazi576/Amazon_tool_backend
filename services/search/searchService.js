import { AppError } from "../../utils/response.js";
import { searchModel } from "../../model/search/searchModel.js";

export const searchService = {
  /**
   * Save a search record.
   */
  async save(userId, dto) {
    const entry = await searchModel.create(userId, dto);
    return entry;
  },

  /**
   * Get paginated history for a user.
   */
  async getHistory(userId, { limit, offset }) {
    const [entries, total] = await Promise.all([
      searchModel.findByUser(userId, { limit, offset }),
      searchModel.countByUser(userId),
    ]);
    return { entries, total, limit, offset };
  },

  /**
   * Delete a single search entry.
   */
  async deleteOne(id, userId) {
    // deleteMany scopes on { id, userId }, so a delete aimed at another user's
    // entry matches zero rows -- the data is safe either way. But the endpoint
    // used to return 200 "deleted" regardless of the count, telling the caller a
    // row was removed when nothing was. Report the truth: 404 when nothing
    // matched. "Not yours" and "does not exist" both return 404, so this reveals
    // no ownership either.
    const { count } = await searchModel.deleteOne(id, userId);
    if (count === 0) throw new AppError("Entry not found", 404, "NOT_FOUND");
  },

  /**
   * Delete all search entries for a user.
   */
  async deleteAll(userId) {
    await searchModel.deleteAll(userId);
  },
};
