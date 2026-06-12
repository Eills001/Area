/**
 * 记忆涟漪算法 v2.0 — 主动引用核心
 *
 * 职责：
 * - 根据当前话题找到最相关的共同事件
 * - 将共同事件自然融入主动消息
 * - 控制引用频率（同一事件最多3次，间隔7天）
 */
import { llm } from '../../utils/llm.js';
import {
  getRelevantEvents,
  touchSharedEvent,
  getRecentSharedEvents,
  getTopPreferences,
} from '../../utils/db.js';
import logger from '../../utils/logger.js';

const MAX_USE_COUNT = 3;
const MIN_DAYS_BETWEEN_USES = 7;

export class MemoryRipples {
  /**
   * 获取最适合当前主题的共同事件
   * 排序：最近 > 重要 > 引用次数少
   */
  async getRelevantEvents(userId = 'default', theme, limit = 3) {
    const events = getRecentSharedEvents(userId, 20);

    if (events.length === 0) return [];

    // 过滤：同一事件最多引用 MAX_USE_COUNT 次
    const candidates = events.filter((e) => (e.use_count || 0) < MAX_USE_COUNT);

    // 过滤：两次引用至少间隔 MIN_DAYS_BETWEEN_USES 天
    const now = new Date();
    const valid = candidates.filter((e) => {
      if (!e.last_used_at) return true;
      const daysSince = (now - new Date(e.last_used_at)) / (1000 * 60 * 60 * 24);
      return daysSince >= MIN_DAYS_BETWEEN_USES;
    });

    if (valid.length === 0) return [];

    // 用 LLM 计算相似度（简化版：基于 tags 匹配）
    try {
      const scored = [];
      for (const event of valid.slice(0, 10)) {
        let tags = [];
        try { tags = JSON.parse(event.tags || '[]'); } catch { tags = []; }
        const similarity = this.quickSimilarity(theme, tags, event.content);
        scored.push({ ...event, similarity, tags });
      }

      scored.sort((a, b) => b.similarity - a.similarity);
      return scored.slice(0, limit);
    } catch (err) {
      logger.warn(`[ripples] Similarity calc failed: ${err.message}`);
      return valid.slice(0, limit);
    }
  }

  /**
   * 快速相似度计算（基于关键词匹配，避免 LLM 调用）
   */
  quickSimilarity(theme, tags, content) {
    let score = 0;
    const themeLower = theme.toLowerCase();
    const contentLower = (content || '').toLowerCase();

    // 标签匹配
    for (const tag of tags) {
      if (themeLower.includes(tag.toLowerCase()) || tag.toLowerCase().includes(themeLower)) {
        score += 40;
      }
    }

    // 内容关键词重叠
    const themeWords = themeLower.split(/[\s,，。！？、]+/).filter((w) => w.length > 1);
    for (const word of themeWords) {
      if (contentLower.includes(word)) score += 15;
    }

    // 最多返回 100
    return Math.min(100, score);
  }

  /**
   * 将共同事件自然融入主动消息
   */
  async generateMessageWithMemory(userId = 'default', baseMessage, theme) {
    const events = await this.getRelevantEvents(userId, theme, 1);
    if (events.length === 0) return baseMessage;

    const event = events[0];

    // 更新引用计数
    touchSharedEvent(event.id);

    // 用 LLM 自然融合
    try {
      const result = await llm.quickReply(
        `将下面这段共同经历自然融入基础消息中。不要生硬地说"我记得"，要像随口提起。只输出融合后的消息。`,
        `基础消息：${baseMessage}\n共同经历：${event.content}\n当前话题：${theme}`,
        0.7,
      );
      return result.trim();
    } catch (err) {
      // LLM 失败则简单拼接
      logger.warn(`[ripples] LLM merge failed: ${err.message}`);
      return `${baseMessage} 说起来，${event.content}`;
    }
  }

  /**
   * 获取用户偏好话题（用于剧本生成）
   */
  getPreferredTopics(userId = 'default', limit = 5) {
    const prefs = getTopPreferences(userId, limit);
    return prefs.map((p) => ({ topic: p.topic, score: p.preference_score }));
  }
}

export const memoryRipples = new MemoryRipples();
export default MemoryRipples;
