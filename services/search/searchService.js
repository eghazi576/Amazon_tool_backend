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
    await searchModel.deleteOne(id, userId);
  },

  /**
   * Delete all search entries for a user.
   */
  async deleteAll(userId) {
    await searchModel.deleteAll(userId);
  },
};
