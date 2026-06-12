/**
 * Emoji 偏好演化 — emoji 使用模式随人格同步演化
 *
 * 每 N 条消息分析一次：
 * 1. 当前人格状态 → 预测应偏好的 emoji 类型
 * 2. 实际使用统计 → 偏差纠正
 * 3. 更新 emoji_personality_preference 表
 */
import { getDB } from '../../utils/db.js';
import { getPersonalityState } from '../../utils/db.js';
import logger from '../../utils/logger.js';
import { usageTracker } from './usage_tracker.js';
import EMOJI_PALETTE from './palette.js';

// 人格维度 → 应偏好的 emoji 类别映射
const TRAIT_TO_EMOJI_CATEGORY = {
  outgoing: ['happy', 'tease', 'bye_day'],
  empathy_level: ['comfort', 'warm', 'companion'],
  complaint_level: ['tease'],
  positive_attitude: ['happy', 'encourage', 'reply_positive'],
  sharing_tendency: ['companion', 'warm', 'think'],
  night_owl: ['night', 'companion'],
  work_motivation: ['think', 'encourage', 'morning'],
};

export class EmojiEvolution {
  /**
   * 执行一次演化分析
   * 建议在 companion-sync 中每 10~20 条消息调用一次
   *
   * @param {string} userId
   * @returns {object} 演化结果
   */
  evolve(userId = 'default') {
    const personality = getPersonalityState(userId);
    const stats = usageTracker.getTopCategories(userId, 7);

    // 1. 基于人格预测应偏好的类别
    const predicted = this.predictPreferredCategories(personality);

    // 2. 对比实际使用
    const actual = {};
    for (const s of stats) {
      actual[s.category] = s.total;
    }

    // 3. 找出偏差
    const deviations = [];
    const totalPredicted = Object.values(predicted).reduce((a, b) => a + b, 0) || 1;
    const totalActual = Object.values(actual).reduce((a, b) => a + b, 0) || 1;

    for (const [cat, predWeight] of Object.entries(predicted)) {
      const predRatio = predWeight / totalPredicted;
      const actualCount = actual[cat] || 0;
      const actualRatio = actualCount / totalActual;

      const deviation = actualRatio - predRatio;
      if (Math.abs(deviation) > 0.2) {
        deviations.push({
          category: cat,
          predicted: Math.round(predRatio * 100),
          actual: Math.round(actualRatio * 100),
          deviation: Math.round(deviation * 100),
          action: deviation > 0 ? 'reduce' : 'increase',
        });
      }
    }

    // 4. 记录演化结果
    if (deviations.length > 0) {
      this._saveEvolutionResult(userId, predicted, actual, deviations);
    }

    // 5. 如果某些类别明显过少或过多，记录一个偏好调整
    for (const dev of deviations) {
      if (dev.action === 'increase') {
        this._storePreference(userId, dev.category, 1);
      } else if (dev.action === 'reduce') {
        this._storePreference(userId, dev.category, -1);
      }
    }

    const state = {
      total_categories: Object.keys(predicted).length,
      deviations_found: deviations.length,
      top_predicted: Object.entries(predicted)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([k]) => k),
    };

    logger.info(`[emoji-evolution] analyzed: ${JSON.stringify(state)}`);
    return { predicted, actual, deviations, state };
  }

  /**
   * 基于人格状态预测 emoji 偏好权重
   */
  predictPreferredCategories(personality) {
    const weights = {};

    // 初始化所有类别
    for (const key of Object.keys(EMOJI_PALETTE)) {
      weights[key] = 1.0;
    }

    // 按人格维度加权
    for (const [trait, categories] of Object.entries(TRAIT_TO_EMOJI_CATEGORY)) {
      const val = personality[trait] ?? 50;
      const stdVal = (val - 50) / 50; // 标准化到 -1 ~ 1

      for (const cat of categories) {
        if (weights[cat] !== undefined) {
          weights[cat] += stdVal * 0.5;
        }
      }
    }

    // 确保非负
    for (const key of Object.keys(weights)) {
      weights[key] = Math.max(0.1, weights[key]);
    }

    return weights;
  }

  /** 获取某用户的 emoji 偏好偏移 */
  getPreferences(userId = 'default') {
    return getDB()
      .prepare(
        `SELECT category, preference_offset, reason, updated_at
         FROM emoji_personality_preference
         WHERE user_id = ?
         ORDER BY ABS(preference_offset) DESC`
      )
      .all(userId);
  }

  /** 重置某用户的演化状态 */
  reset(userId = 'default') {
    getDB().prepare('DELETE FROM emoji_personality_preference WHERE user_id = ?').run(userId);
    getDB().prepare('DELETE FROM emoji_usage WHERE user_id = ?').run(userId);
    logger.info(`[emoji-evolution] reset for ${userId}`);
    return true;
  }

  // ─── 内部 ─────────────────────────────────────────────

  _saveEvolutionResult(userId, predicted, actual, deviations) {
    getDB()
      .prepare(
        `INSERT INTO emoji_evolution_log (user_id, predicted_weights, actual_counts, deviations, created_at)
         VALUES (?, ?, ?, ?, datetime('now'))`
      )
      .run(
        userId,
        JSON.stringify(predicted),
        JSON.stringify(actual),
        JSON.stringify(deviations)
      );
  }

  _storePreference(userId, category, offset) {
    const db = getDB();
    const existing = db
      .prepare('SELECT id, preference_offset FROM emoji_personality_preference WHERE user_id = ? AND category = ?')
      .get(userId, category);

    if (existing) {
      const newOffset = existing.preference_offset + offset;
      db.prepare(
        `UPDATE emoji_personality_preference
         SET preference_offset = ?, reason = 'personality_evolution', updated_at = datetime('now')
         WHERE id = ?`
      ).run(Math.max(-5, Math.min(5, newOffset)), existing.id);
    } else {
      db.prepare(
        `INSERT INTO emoji_personality_preference (user_id, category, preference_offset, reason)
         VALUES (?, ?, ?, 'personality_evolution')`
      ).run(userId, category, offset);
    }
  }
}

export const emojiEvolution = new EmojiEvolution();
export default EmojiEvolution;
