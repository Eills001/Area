/**
 * 动态人格演化系统 — 主入口
 *
 * 对外 API（完全匹配设计文档八、模块 API 参考）：
 *   getCurrentState(userId)            → 获取当前12维人格状态
 *   processProactiveFeedback(...)      → 处理主动消息反馈
 *   processUserInitiated(userId, msg)  → 处理用户主动对话
 *   processSharedEvent(userId, type)   → 处理共同事件
 *   applyTimeEvolution(userId)         → 应用时间自然演化
 *   adjustSlider(userId, trait, value) → 手动调整滑块
 *   resetToInitial(userId)             → 重置到初始状态
 *   generateMonthlyDiary(userId)       → 生成月度成长日记
 *   getAdjustmentHistory(userId, n)    → 获取人格调整历史
 *   getImmutableCorePrompt()           → 获取不可变核心锁提示词
 *   buildPersonalityPrompt(state)      → 构建含人格状态的系统提示词
 */
import { EvolutionEngine } from './evolution_engine.js';
import { FeedbackProcessor } from './feedback_processor.js';
import { SliderManager } from './slider_manager.js';
import { DiaryGenerator } from './diary_generator.js';
import { SnapshotManager } from './snapshot_manager.js';
import {
  getPersonalityState,
  recordAdjustment,
  updatePersonalityTrait,
  getAdjustmentHistory as dbGetHistory,
  resetPersonalityToInitial as dbReset,
} from '../../utils/db.js';
import logger from '../../utils/logger.js';

class Personality {
  constructor() {
    this.engine = new EvolutionEngine();
    this.feedbackProcessor = new FeedbackProcessor();
    this.sliderManager = new SliderManager();
    this.diaryGenerator = new DiaryGenerator();
    this.snapshotManager = new SnapshotManager();
  }

  // ─── 设计文档 API ─────────────────────────────────────

  /** 获取用户当前人格状态 */
  getCurrentState(userId = 'default') {
    const row = getPersonalityState(userId);
    return {
      outgoing: row.outgoing,
      empathy_level: row.empathy_level,
      complaint_level: row.complaint_level,
      positive_attitude: row.positive_attitude,
      sharing_tendency: row.sharing_tendency,
      positive_share_ratio: row.positive_share_ratio,
      private_share_ratio: row.private_share_ratio,
      topic_preference: row.topic_preference,
      night_owl: row.night_owl,
      exercise_enthusiasm: row.exercise_enthusiasm,
      spicy_tolerance: row.spicy_tolerance,
      work_motivation: row.work_motivation,
      user_proactivity: row.user_proactivity ?? 60,
      total_interactions: row.total_interactions,
      updated_at: row.updated_at,
    };
  }

  /** 处理主动消息反馈 */
  processProactiveFeedback(userId = 'default', message, feedbackType = null) {
    const type = feedbackType || this.feedbackProcessor.classifyFeedback(message);
    const adjustments = this.feedbackProcessor.processProactiveFeedback(message, type);

    const state = getPersonalityState(userId);
    const pauseDays = adjustments._pause_proactive_days || 0;
    delete adjustments._pause_proactive_days;

    for (const [trait, amount] of Object.entries(adjustments)) {
      if (state[trait] !== undefined && amount !== 0) {
        const oldVal = state[trait];
        const newVal = this.engine.calculateNewValue(trait, oldVal, {
          proactive: amount,
          timestamp: new Date().toISOString(),
        });
        if (newVal !== oldVal) {
          recordAdjustment(userId, trait, oldVal, newVal, 'proactive_feedback', message.id || null);
          logger.debug(`[personality] ${trait}: ${oldVal} → ${newVal} (proactive ${type})`);
        }
      }
    }

    return { feedbackType: type, adjustments, pauseProactiveDays: pauseDays };
  }

  /** 处理用户主动发起的对话 */
  processUserInitiated(userId = 'default', message) {
    const adjustments = this.feedbackProcessor.processUserInitiated(message);
    const state = getPersonalityState(userId);

    for (const [trait, amount] of Object.entries(adjustments)) {
      if (state[trait] !== undefined && amount !== 0) {
        const oldVal = state[trait];
        const newVal = this.engine.calculateNewValue(trait, oldVal, {
          userInitiated: amount,
          timestamp: new Date().toISOString(),
        });
        if (newVal !== oldVal) {
          recordAdjustment(userId, trait, oldVal, newVal, 'user_initiated', message.id || null);
        }
      }
    }

    return adjustments;
  }

  /** 处理共同事件 */
  processSharedEvent(userId = 'default', eventType, eventData = {}) {
    const adjustments = this.feedbackProcessor.processSharedEvent(eventType);
    const state = getPersonalityState(userId);

    for (const [trait, amount] of Object.entries(adjustments)) {
      if (state[trait] !== undefined && amount !== 0) {
        const oldVal = state[trait];
        const newVal = this.engine.calculateNewValue(trait, oldVal, {
          sharedEvent: amount,
          timestamp: new Date().toISOString(),
        });
        if (newVal !== oldVal) {
          recordAdjustment(userId, trait, oldVal, newVal, 'shared_event', eventData.id || null);
        }
      }
    }

    return adjustments;
  }

  /** 应用时间自然演化 */
  applyTimeEvolution(userId = 'default') {
    const state = getPersonalityState(userId);
    const traitNames = [
      'outgoing', 'empathy_level', 'complaint_level', 'positive_attitude',
      'sharing_tendency', 'positive_share_ratio', 'private_share_ratio', 'topic_preference',
      'night_owl', 'exercise_enthusiasm', 'spicy_tolerance', 'work_motivation',
    ];

    const results = {};
    for (const trait of traitNames) {
      const oldVal = state[trait];
      const newVal = this.engine.calculateNewValue(trait, oldVal, {
        time: -1,
        timestamp: new Date().toISOString(),
      });
      if (newVal !== oldVal) {
        recordAdjustment(userId, trait, oldVal, newVal, 'time');
        results[trait] = { from: oldVal, to: newVal, delta: newVal - oldVal };
      }
    }

    logger.info(`[personality] Time evolution applied: ${Object.keys(results).length} traits adjusted`);
    return results;
  }

  /** 手动调整滑块 */
  adjustSlider(userId = 'default', trait, value) {
    const state = getPersonalityState(userId);
    if (state[trait] === undefined) throw new Error(`未知人格维度: ${trait}`);

    const oldVal = state[trait];
    const newVal = Math.max(0, Math.min(100, Math.round(value)));
    updatePersonalityTrait(userId, trait, oldVal, newVal);
    logger.info(`[personality] Manual slider: ${trait} ${oldVal} → ${newVal}`);
    return { trait, from: oldVal, to: newVal };
  }

  /** 重置到初始状态 */
  resetToInitial(userId = 'default') {
    dbReset(userId);
    logger.info(`[personality] Reset to initial for ${userId}`);
    return this.getCurrentState(userId);
  }

  /** 生成月度成长日记 */
  async generateMonthlyDiary(userId = 'default') {
    return this.diaryGenerator.generateMonthlyDiary(userId);
  }

  /** 获取人格调整历史 */
  getAdjustmentHistory(userId = 'default', limit = 20) {
    return dbGetHistory(userId, limit);
  }

  // ─── 提示词层 ─────────────────────────────────────────

  /** 获取不可变核心锁提示词 */
  getImmutableCorePrompt() {
    return this.engine.getImmutableCorePrompt();
  }

  /** 构建含人格状态的系统提示词（用于 LLM 调用） */
  buildPersonalityPrompt(userId = 'default') {
    const state = this.getCurrentState(userId);
    return this.engine.buildPersonalityPrompt(state);
  }

  // ─── 小脾气机制 ───────────────────────────────────────

  /** 是否触发小脾气（5%概率，需outgoing > threshold） */
  shouldShowTemper(userId = 'default') {
    const state = this.getCurrentState(userId);
    const enable = this.engine.config.evolution_config.small_temper_probability || 0.05;
    const minOutgoing = this.engine.config.evolution_config.small_temper_min_outgoing || 40;
    if (state.outgoing < minOutgoing) return false;
    return Math.random() < enable;
  }
}

// 单例
const personality = new Personality();

// ─── 向后兼容旧 API ──────────────────────────────────────

let cachedPersonality = null;

export function evolve() {
  if (!cachedPersonality) {
    cachedPersonality = personality.getCurrentState();
  }
  personality.applyTimeEvolution();
  cachedPersonality = personality.getCurrentState();
  return cachedPersonality;
}

export function getPersonality() {
  return cachedPersonality || personality.getCurrentState();
}

export function adjustPersonality(dimension, delta) {
  const state = personality.getCurrentState();
  if (state[dimension] !== undefined) {
    personality.adjustSlider('default', dimension, state[dimension] + delta);
    cachedPersonality = personality.getCurrentState();
  }
}

// ─── 导出 ────────────────────────────────────────────────

export { personality, Personality };
export default { evolve, getPersonality, adjustPersonality, personality };
