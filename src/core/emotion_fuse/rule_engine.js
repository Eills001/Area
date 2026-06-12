/**
 * 前置规则引擎 v2.0 — 第一道防线（静态拦截）
 *
 * 基于关键词、正则做硬拦截，命中后直接触发三级熔断，不进入情绪分析
 */
import { HIGH_RISK_KEYWORDS, VIOLATION_PATTERNS } from './config.js';

export class RuleEngine {
  /**
   * 检查消息是否命中高危规则
   * 返回 { hit: boolean, rule_id: string, reason: string } 或 null
   */
  check(message) {
    const text = (message || '').toLowerCase().trim();
    if (!text) return null;

    // 1. 高危关键词
    for (const kw of HIGH_RISK_KEYWORDS) {
      if (text.includes(kw.toLowerCase())) {
        return {
          hit: true,
          rule_id: `high_risk_keyword:${kw}`,
          reason: `命中高危关键词: ${kw}`,
          severity: 'critical',
        };
      }
    }

    // 2. 违规句式
    for (const pattern of VIOLATION_PATTERNS) {
      if (pattern.test(text)) {
        return {
          hit: true,
          rule_id: `violation_pattern:${pattern.source.slice(0, 20)}`,
          reason: '命中违规句式',
          severity: 'critical',
        };
      }
    }

    // 3. 空消息/乱码/特殊字符 → 放行
    if (text.length < 2 || /^[!@#$%^&*()_+\-=<>?/\\|~`]+$/.test(text)) {
      return { hit: false, reason: 'short_or_special', skip_emotion: true };
    }

    return null;
  }

  /**
   * 检查是否为刷屏/重复相同负面语句
   * 需要结合上下文判断
   */
  checkSpam(history) {
    if (!history || history.length < 3) return false;

    // 最近3条消息相同 → 刷屏
    const recent = history.slice(-3);
    const texts = recent.map((h) => (h.text || '').trim().toLowerCase());
    const unique = new Set(texts);

    if (unique.size === 1 && texts[0].length > 2) {
      return { hit: true, rule_id: 'spam_repeat', reason: '重复相同内容3次' };
    }

    return null;
  }
}

export const ruleEngine = new RuleEngine();
export default RuleEngine;
