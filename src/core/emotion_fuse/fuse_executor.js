/**
 * 4级熔断执行器 v2.0 — 核心执行逻辑
 *
 * 按风险等级执行对应熔断动作，支持状态持久化，逐级升级
 */
import {
  getFuseState, setFuseLevel, incrementNegativeStreak, resetNegativeStreak,
  incrementNormalRounds, resetNormalRounds, setIsLocked, resetFuseState,
} from '../../utils/db.js';
import { FUSE_CONFIG } from './config.js';
import { emotionScorer } from './emotion_scorer.js';
import logger from '../../utils/logger.js';

export class FuseExecutor {
  /**
   * 执行熔断检查
   * @param {string} sessionId
   * @param {object} emotionResult - { score, label, level }
   * @param {object} context - { rule_hit, streak_escalated }
   * @returns {{ fuse_level, risk_tag, forbid_active, locked, reply_suggest }}
   */
  execute(sessionId, emotionResult, context = {}) {
    const state = getFuseState(sessionId);
    let newLevel = state.fuse_level;

    // 如果已锁定，不再升级但也不降级
    if (state.is_locked) {
      return this.buildResult(3, 'locked_permanent', true, true,
        FUSE_CONFIG.responses.level3);
    }

    const { score, label, level } = emotionResult;

    // 处理正常情绪 → 恢复逻辑
    if (score <= FUSE_CONFIG.thresholds.level1_observe) {
      return this.handleNormal(sessionId, state, score);
    }

    // 处理负面情绪 → 升级逻辑
    return this.handleNegative(sessionId, state, emotionResult, context);
  }

  /**
   * 处理正常情绪 — 累计正常轮数，触发降级
   */
  handleNormal(sessionId, state, score) {
    if (state.fuse_level === 0) {
      // 已是正常状态，无需操作
      resetNegativeStreak(sessionId);
      return this.buildResult(0, 'normal', false, false, null);
    }

    // 累计正常轮数
    incrementNormalRounds(sessionId);
    resetNegativeStreak(sessionId);
    const newState = getFuseState(sessionId);
    const normalRounds = newState.consecutive_normal_rounds;

    // 检查是否可以降级
    if (state.fuse_level === 1 && normalRounds >= FUSE_CONFIG.recovery.level1.consecutive_normal) {
      setFuseLevel(sessionId, 0, '自动降级：连续正常轮数达标');
      resetNormalRounds(sessionId);
      logger.info(`[fuse] Session ${sessionId} downgraded to level 0`);
      return this.buildResult(0, 'normal_recovered', false, false, null);
    }

    if (state.fuse_level === 2 && normalRounds >= FUSE_CONFIG.recovery.level2.consecutive_normal) {
      setFuseLevel(sessionId, 0, '自动降级：连续正常轮数达标');
      resetNormalRounds(sessionId);
      logger.info(`[fuse] Session ${sessionId} downgraded to level 0 from level 2`);
      return this.buildResult(0, 'normal_recovered', false, false, null);
    }

    // 尚未达到降级轮数，保持当前等级
    return this.buildResult(
      state.fuse_level,
      `observing:${normalRounds}/${this.getRequiredNormalRounds(state.fuse_level)}`,
      state.fuse_level >= 1,
      false,
      null,
    );
  }

  /**
   * 处理负面情绪 — 确定是否需要升级
   */
  handleNegative(sessionId, state, emotionResult, context) {
    const { score, label, level } = emotionResult;

    // 如果前置规则命中 → 直接三级熔断
    if (context.rule_hit) {
      setFuseLevel(sessionId, 3, `前置规则命中: ${context.rule_id || 'unknown'}`);
      setIsLocked(sessionId, true);
      logger.warn(`[fuse] Session ${sessionId} escalated to LEVEL 3 (rule hit)`);
      return this.buildResult(3, 'high_risk_rule_hit', true, true, FUSE_CONFIG.responses.level3);
    }

    // 分数已达三级阈值 → 直接强制熔断
    if (score >= FUSE_CONFIG.thresholds.level3_force) {
      setFuseLevel(sessionId, 3, `极端情绪分数: ${score}`);
      setIsLocked(sessionId, true);
      logger.warn(`[fuse] Session ${sessionId} escalated to LEVEL 3 (score: ${score})`);
      return this.buildResult(3, 'extreme_emotion', true, true, FUSE_CONFIG.responses.level3);
    }

    // 增加负面轮数
    incrementNegativeStreak(sessionId);
    const newState = getFuseState(sessionId);

    // 连续负面升级
    if (newState.negative_streak >= 2 && score >= FUSE_CONFIG.thresholds.level2_warning) {
      setFuseLevel(sessionId, 2, `连续${newState.negative_streak}轮中度负面`);
      logger.warn(`[fuse] Session ${sessionId} escalated to LEVEL 2 (streak: ${newState.negative_streak})`);
      return this.buildResult(2, 'moderate_streak', true, false, FUSE_CONFIG.responses.level2);
    }

    // 等级2状态下继续恶化 → 升级到3
    if (state.fuse_level >= 2 && score >= FUSE_CONFIG.thresholds.level2_warning) {
      setFuseLevel(sessionId, 3, '预警状态下情绪继续恶化');
      setIsLocked(sessionId, true);
      return this.buildResult(3, 'warning_escalation', true, true, FUSE_CONFIG.responses.level3);
    }

    // 等级1状态下累计2轮负面+中分 → 升到2
    if (state.fuse_level >= 1 && newState.negative_streak >= 2 && score >= FUSE_CONFIG.thresholds.level2_warning) {
      setFuseLevel(sessionId, 2, `观察状态下连续${newState.negative_streak}轮负面`);
      return this.buildResult(2, 'observe_escalation', true, false, FUSE_CONFIG.responses.level2);
    }

    // 确定新等级（取当前状态和分数建议等级的较大值）
    const scoreLevel = emotionScorer.scoreToFuseLevel(score);
    const targetLevel = Math.max(state.fuse_level, scoreLevel);

    // 重置正常轮数计数（因为出现了负面）
    resetNormalRounds(sessionId);

    if (targetLevel > state.fuse_level) {
      setFuseLevel(sessionId, targetLevel, `情绪分数升级: ${score} (${label})`);
      logger.info(`[fuse] Session ${sessionId} set to level ${targetLevel}`);
    }

    return this.buildResult(
      targetLevel,
      label,
      targetLevel >= 1,
      false,
      targetLevel >= 2 ? FUSE_CONFIG.responses.level2 : null,
    );
  }

  /**
   * 重置会话熔断状态（新会话）
   */
  reset(sessionId) {
    resetFuseState(sessionId);
    logger.info(`[fuse] Session ${sessionId} reset`);
  }

  // ─── 辅助 ────────────────────────────────────────────

  buildResult(level, riskTag, forbidActive, locked, replySuggest) {
    return {
      fuse_level: level,
      risk_tag: riskTag,
      forbid_active: forbidActive,
      locked,
      reply_suggest: replySuggest,
    };
  }

  getRequiredNormalRounds(level) {
    if (level === 1) return FUSE_CONFIG.recovery.level1.consecutive_normal;
    if (level === 2) return FUSE_CONFIG.recovery.level2.consecutive_normal;
    return Infinity;
  }
}

export const fuseExecutor = new FuseExecutor();
export default FuseExecutor;
