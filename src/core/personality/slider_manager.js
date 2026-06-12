/**
 * 滑块管理器 — 每日冷却 + 每周巩固 + 调度入口
 *
 * 规则：
 * - 22:00 后停止调整（每日冷却）
 * - 每周日 00:00-04:00 执行巩固计算
 */
import { getPersonalityState, getPendingAdjustments, updatePersonalityTrait } from '../../utils/db.js';
import { EvolutionEngine } from './evolution_engine.js';
import logger from '../../utils/logger.js';

export class SliderManager {
  constructor() {
    this.engine = new EvolutionEngine();
  }

  /**
   * 处理当日所有待应用的调整
   */
  async processDailyAdjustments(userId = 'default') {
    const now = new Date();

    // 每日冷却：22:00 后停止
    if (now.getHours() >= 22) {
      logger.debug('[slider_manager] Daily cooldown active (after 22:00) — skipping');
      return { status: 'skipped', reason: 'daily_cooldown' };
    }

    const state = getPersonalityState(userId);
    const adjustments = getPendingAdjustments(userId);
    if (adjustments.length === 0) return { status: 'no_pending' };

    const applied = [];
    for (const adj of adjustments) {
      const oldVal = state[adj.trait_name];
      const timestamp = adj.created_at;

      const newVal = this.engine.calculateNewValue(adj.trait_name, oldVal, {
        proactive: adj.source_type === 'proactive_feedback' ? adj.adjustment_amount : 0,
        userInitiated: adj.source_type === 'user_initiated' ? adj.adjustment_amount : 0,
        sharedEvent: adj.source_type === 'shared_event' ? adj.adjustment_amount : 0,
        time: adj.source_type === 'time' ? adj.adjustment_amount : 0,
        timestamp,
      });

      updatePersonalityTrait(userId, adj.trait_name, oldVal, newVal);
      applied.push({ trait: adj.trait_name, from: oldVal, to: newVal, delta: newVal - oldVal });
    }

    logger.info(`[slider_manager] Applied ${applied.length} adjustments for ${userId}`);
    return { status: 'applied', count: applied.length, details: applied };
  }

  /**
   * 每周巩固：周日凌晨运行
   */
  async consolidateWeeklyAdjustments(userId = 'default') {
    const now = new Date();
    if (now.getDay() !== 0 || now.getHours() >= 4) {
      return { status: 'skipped', reason: 'not_sunday_window' };
    }

    const state = getPersonalityState(userId);
    logger.info(`[slider_manager] Weekly consolidation for ${userId}`);

    // 对所有维度应用一次轻微的时间自然衰减
    const traitNames = [
      'outgoing', 'empathy_level', 'complaint_level', 'positive_attitude',
      'sharing_tendency', 'positive_share_ratio', 'private_share_ratio', 'topic_preference',
      'night_owl', 'exercise_enthusiasm', 'spicy_tolerance', 'work_motivation',
    ];

    for (const trait of traitNames) {
      const oldVal = state[trait];
      // 少量回归，避免极端积累
      const newVal = this.engine.calculateNewValue(trait, oldVal, {
        time: -1,
        timestamp: new Date().toISOString(),
      });
      if (newVal !== oldVal) {
        updatePersonalityTrait(userId, trait, oldVal, newVal);
        logger.debug(`[slider_manager] Weekly consolidation: ${trait} ${oldVal}→${newVal}`);
      }
    }

    logger.info('[slider_manager] Weekly consolidation complete');
    return { status: 'consolidated' };
  }
}

export const sliderManager = new SliderManager();
export default SliderManager;
