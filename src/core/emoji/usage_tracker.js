/**
 * Emoji 使用追踪器 — 记录 emoji 使用频率 + 分析偏好
 *
 * 表结构 emoji_usage + 迁移在 db.js 中维护
 */
import { getDB } from '../../utils/db.js';
import logger from '../../utils/logger.js';

export class UsageTracker {
  /**
   * 记录一次 emoji 使用
   * @param {string} userId
   * @param {string} emoji - emoji 字符
   * @param {string} category - 调色板类别
   * @param {string} scene - 使用场景
   */
  recordUsage(userId, emoji, category = null, scene = null) {
    const db = getDB();
    const existing = db
      .prepare('SELECT id, count FROM emoji_usage WHERE user_id = ? AND emoji = ?')
      .get(userId, emoji);

    if (existing) {
      db.prepare(
        `UPDATE emoji_usage
         SET count = count + 1, last_used_at = datetime('now'),
             last_context = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).run(JSON.stringify({ category, scene }), existing.id);
    } else {
      db.prepare(
        `INSERT INTO emoji_usage (user_id, emoji, category, count, last_used_at, last_context)
         VALUES (?, ?, ?, 1, datetime('now'), ?)`
      ).run(userId, emoji, category || '', JSON.stringify({ category, scene }));
    }

    logger.debug(`[emoji] used ${emoji} (cat:${category}, scene:${scene})`);
  }

  /**
   * 批量记录 emoji 使用
   */
  recordBatch(userId, emojiList, category = null, scene = null) {
    const transaction = getDB().transaction((items) => {
      for (const e of items) {
        this.recordUsage(userId, e, category, scene);
      }
    });
    transaction(emojiList);
  }

  /**
   * 获取某用户近期最常用的 emoji
   * @param {string} userId
   * @param {number} [limit=10]
   * @param {number} [days=30] - 限定时间范围
   */
  getTopEmoji(userId = 'default', limit = 10, days = 30) {
    return getDB()
      .prepare(
        `SELECT emoji, category, count, last_used_at
         FROM emoji_usage
         WHERE user_id = ?
           AND last_used_at >= datetime('now', ?)
         ORDER BY count DESC
         LIMIT ?`
      )
      .all(userId, `-${days} days`, limit);
  }

  /**
   * 获取某用户最近 N 天最常用的类别频率
   */
  getTopCategories(userId = 'default', days = 30) {
    return getDB()
      .prepare(
        `SELECT category, SUM(count) as total, COUNT(DISTINCT emoji) as unique_emojis
         FROM emoji_usage
         WHERE user_id = ?
           AND category != ''
           AND last_used_at >= datetime('now', ?)
         GROUP BY category
         ORDER BY total DESC`
      )
      .all(userId, `-${days} days`);
  }

  /**
   * 获取最近刚用过的 emoji（避免重复）
   * @param {string} userId
   * @param {number} [n=3] - 最近几个
   */
  getRecentEmoji(userId = 'default', n = 3) {
    return getDB()
      .prepare(
        `SELECT emoji, category, count, last_used_at
         FROM emoji_usage
         WHERE user_id = ?
         ORDER BY last_used_at DESC
         LIMIT ?`
      )
      .all(userId, n);
  }

  /**
   * 获取所有使用过的 emoji 统计
   */
  getAllStats(userId = 'default') {
    return getDB()
      .prepare(
        `SELECT COUNT(*) as total_types, SUM(count) as total_uses,
                MAX(count) as max_use, AVG(count) as avg_use
         FROM emoji_usage
         WHERE user_id = ?`
      )
      .get(userId);
  }

  /**
   * 检查某 emoji 是否被频繁使用（防止过度重复）
   */
  isOverused(userId, emoji, threshold = 5) {
    const row = getDB()
      .prepare('SELECT count FROM emoji_usage WHERE user_id = ? AND emoji = ?')
      .get(userId, emoji);
    return row && row.count > threshold;
  }

  /** 获取本周未用过的 emoji 列表（增加多样性） */
  getUnusedThisWeek(userId = 'default', limit = 5) {
    return getDB()
      .prepare(
        `SELECT emoji, category
         FROM emoji_usage
         WHERE user_id = ?
           AND (last_used_at IS NULL OR last_used_at < datetime('now', '-7 days'))
         ORDER BY count ASC
         LIMIT ?`
      )
      .all(userId, limit);
  }
}

export const usageTracker = new UsageTracker();
export default UsageTracker;
