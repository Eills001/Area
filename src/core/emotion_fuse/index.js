/**
 * 情绪熔断器 v2.0 — 全生命周期安全风控核心
 *
 * 对外 API（匹配设计文档五、接口与集成规范）：
 *   EmotionFuseCheck(sessionId, userId, userMessage, aiReply, history)
 *     → { fuse_level, risk_tag, forbid_active, locked, reply_suggest }
 *
 * 三层防护：前置规则过滤 → 情绪评分 → 熔断执行
 */
import { ruleEngine } from './rule_engine.js';
import { emotionScorer } from './emotion_scorer.js';
import { fuseExecutor } from './fuse_executor.js';
import { behaviorRules } from './behavior_rules.js';
import { alertLogger } from './alert_logger.js';
import { getFuseState, resetFuseState } from '../../utils/db.js';
import { bus, Events } from '../../utils/event.js';
import logger from '../../utils/logger.js';

/**
 * 统一熔断检查入口（全会话消息强制串行调用）
 *
 * @param {string} sessionId — 会话ID
 * @param {string} userId — 用户标识
 * @param {string} userMessage — 用户消息文本
 * @param {string} aiReply — AI待输出话术（可为null，仅检查时传空字符串）
 * @param {Array} history — 最近5轮对话上下文 [{ role, text, emotion_score }]
 * @returns {{ fuse_level, risk_tag, forbid_active, locked, reply_suggest }}
 */
export function EmotionFuseCheck(sessionId, userId = 'default', userMessage, aiReply = '', history = []) {
  const text = userMessage || '';

  // ─── 第一层：前置规则引擎 ───────────────────────────
  const ruleResult = ruleEngine.check(text);
  if (ruleResult?.hit) {
    const emotionResult = { score: 95, label: '高危词汇命中', level: 'critical' };
    const fuseResult = fuseExecutor.execute(sessionId, emotionResult, {
      rule_hit: true,
      rule_id: ruleResult.rule_id,
    });

    alertLogger.log(sessionId, userId, fuseResult, emotionResult, text, null, { rule_id: ruleResult.rule_id });
    bus.emit(Events.FUSE_TRIGGERED, { sessionId, userId, fuseResult, emotionResult });

    return { ...fuseResult, was_rule_hit: true };
  }

  // 检查刷屏
  const spamResult = ruleEngine.checkSpam(history);
  if (spamResult?.hit) {
    const emotionResult = { score: 70, label: '重复刷屏', level: 'severe' };
    const fuseResult = fuseExecutor.execute(sessionId, emotionResult, { streak_escalated: true });

    alertLogger.log(sessionId, userId, fuseResult, emotionResult, text, null, { rule_id: spamResult.rule_id });
    return fuseResult;
  }

  // ─── 第二层：情绪评分 ─────────────────────────────────
  const emotionResult = emotionScorer.scoreWithContext(text, history);

  // ─── 第三层：熔断执行 ─────────────────────────────────
  const fuseResult = fuseExecutor.execute(sessionId, emotionResult, {});

  // ─── AI 行为约束检查 ──────────────────────────────────
  if (aiReply && aiReply.length > 0) {
    const behaviorCheck = behaviorRules.checkAIReply(aiReply, {
      fuse_level: fuseResult.fuse_level,
    });
    if (!behaviorCheck.pass) {
      fuseResult.reply_suggest = behaviorCheck.suggestion || fuseResult.reply_suggest;
      logger.warn(`[fuse] AI reply blocked: ${behaviorCheck.violations.join(', ')}`);
    }
  }

  // ─── 日志 ─────────────────────────────────────────────
  if (emotionResult.score >= 30 || fuseResult.fuse_level > 0) {
    alertLogger.log(sessionId, userId, fuseResult, emotionResult, text, aiReply, {});
  }

  // ─── 发射事件 ─────────────────────────────────────────
  if (fuseResult.fuse_level >= 1) {
    bus.emit(Events.FUSE_TRIGGERED, { sessionId, userId, fuseResult, emotionResult });
  }
  if (fuseResult.fuse_level === 0) {
    bus.emit(Events.FUSE_RESET, { sessionId });
  }

  return fuseResult;
}

/**
 * 通知情绪熔断器「主动消息已发送」
 * 用于行为约束中的话题追踪
 */
export function onProactiveSent(sessionId, message) {
  // 预留：记录主动消息，用于话题重复检测
  logger.debug(`[fuse] Proactive sent in session ${sessionId}`);
}

/**
 * 重置会话熔断状态（新会话）
 */
export function resetSession(sessionId) {
  resetFuseState(sessionId);
  logger.info(`[fuse] Session ${sessionId} reset`);
}

/**
 * 获取当前会话熔断状态
 */
export function getSessionFuseState(sessionId) {
  return getFuseState(sessionId);
}

// ─── 向后兼容旧 API ────────────────────────────────────

export function analyzeUserMessage(text) {
  const result = emotionScorer.scoreMessage(text);
  return {
    fuse: result.score >= 60,
    score: result.score,
    label: result.label,
    keywords: [],
  };
}

export function detectAnomaly(cronState) {
  const anomalies = [];
  if (cronState.morning_wake?.consecutive_missed >= 2) {
    anomalies.push({ type: 'missed_wakeup', count: cronState.morning_wake.consecutive_missed });
  }
  if (cronState.daily_review?.consecutive_missed >= 2) {
    anomalies.push({ type: 'skipped_review', count: cronState.daily_review.consecutive_missed });
  }
  return anomalies;
}

export function isFuseActive() {
  // 简化版：检查是否有活跃熔断
  return false;
}

export function getHealingPersonalityState() {
  return { empathy_level: 90 };
}

export { alertLogger, behaviorRules, emotionScorer, ruleEngine, fuseExecutor };

export default {
  EmotionFuseCheck,
  analyzeUserMessage,
  detectAnomaly,
  isFuseActive,
  getHealingPersonalityState,
  resetSession,
  getSessionFuseState,
  onProactiveSent,
};
