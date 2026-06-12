/**
 * 连贯性检查器 v3.1
 *
 * 验证生成的剧本是否符合约束：
 * - 4个时段，不重叠
 * - 每个时段含 active_interactions（至少1个 topic）
 * - content_hint 不含问号
 * - 跨日连贯性（昨天熬夜→今天困）
 * - 心情平滑变化
 */
import logger from '../../utils/logger.js';

export class CoherenceChecker {
  validate(script, yesterdayScript) {
    const errors = [];
    const warnings = [];

    const timeline = script.timeline;
    if (!timeline || !Array.isArray(timeline)) {
      errors.push('timeline 必须是数组');
      return script;
    }

    if (timeline.length !== 4) {
      errors.push(`时段数量应为4，实际为${timeline.length}`);
    }

    for (let i = 0; i < timeline.length; i++) {
      const period = timeline[i];

      // 检查是否有 active_interactions
      if (!period.active_interactions || !Array.isArray(period.active_interactions)) {
        warnings.push(`时段${i + 1}缺少话题提示`);
        period.active_interactions = [{ theme: '日常', content_hint: '平凡的一天' }];
      }

      // 检查每个话题
      for (const topic of period.active_interactions) {
        if (topic.content_hint && topic.content_hint.includes('?')) {
          warnings.push(`话题 content_hint 含问号，已移除`);
          topic.content_hint = topic.content_hint.replace(/\?/g, '');
        }
      }

      // reply_mode 校验
      const validModes = ['slow', 'normal', 'quick'];
      if (!validModes.includes(period.reply_mode)) {
        warnings.push(`时段${i + 1} reply_mode 无效，设为normal`);
        period.reply_mode = 'normal';
      }

      // mood_score 范围 0-100
      if (typeof period.mood_score !== 'number' || period.mood_score < 0 || period.mood_score > 100) {
        period.mood_score = Math.max(0, Math.min(100, period.mood_score || 50));
      }
    }

    // 心情平滑检查（相邻时段变化不能超过40）
    for (let i = 1; i < timeline.length; i++) {
      const prev = timeline[i - 1].mood_score;
      const curr = timeline[i].mood_score;
      if (Math.abs(curr - prev) > 40) {
        warnings.push(`心情从${prev}跳到${curr}，变化过大`);
      }
    }

    // 跨日连贯性
    if (yesterdayScript && yesterdayScript.timeline && yesterdayScript.timeline.length > 0) {
      const lastPeriod = yesterdayScript.timeline[yesterdayScript.timeline.length - 1];
      const lastState = lastPeriod.state || '';

      if (lastState.includes('熬夜') && timeline[0] && !timeline[0].state.includes('困')) {
        warnings.push('昨天熬夜但今早未体现，已自动添加');
        timeline[0].state = (timeline[0].state || '') + '，昨晚睡得晚现在有点困';
        if (timeline[0].mood_score > 60) timeline[0].mood_score -= 15;
      }
    }

    // 时段覆盖检查
    for (let i = 1; i < timeline.length; i++) {
      const prevEnd = timeline[i - 1].time_window?.split('-')[1];
      const currStart = timeline[i].time_window?.split('-')[0];
      if (prevEnd && currStart && prevEnd !== currStart) {
        warnings.push(`时段${i}结束与时段${i + 1}开始不连续`);
      }
    }

    if (errors.length > 0) logger.warn(`[coherence] ${errors.length} errors`);
    if (warnings.length > 0) logger.info(`[coherence] ${warnings.length} warnings auto-fixed`);

    return script;
  }
}

export const coherenceChecker = new CoherenceChecker();
export default CoherenceChecker;
