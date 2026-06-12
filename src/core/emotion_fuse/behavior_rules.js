/**
 * AI 行为约束规则 v2.0 — 针对主动陪伴特性
 *
 * 约束 AI 自身行为，避免因过度主动、过度共情诱发用户情绪风险
 */
import { FUSE_CONFIG } from './config.js';

export class BehaviorRules {
  /**
   * 检查 AI 待发送话术是否合规
   * @returns {{ pass: boolean, violations: string[], suggestion: string|null }}
   */
  checkAIReply(replyText, context = {}) {
    const violations = [];
    const fuseLevel = context.fuse_level || 0;
    const sameTopicCount = context.same_topic_count || 0;

    // 1. 熔断状态下禁止亲密话术
    if (fuseLevel >= 1 && FUSE_CONFIG.behavior.forbid_intimate_on_fuse) {
      if (this.containsIntimateTerms(replyText)) {
        violations.push('熔断状态下包含亲密话术');
      }
    }

    // 2. 同一消极话题连续回复超限
    if (sameTopicCount >= FUSE_CONFIG.behavior.max_same_topic_rounds) {
      if (this.isNegativeTopicReply(replyText)) {
        violations.push(`同一消极话题已回复${sameTopicCount}轮，应转移话题`);
      }
    }

    // 3. 禁止主动询问隐私
    if (this.containsPrivacyQuery(replyText)) {
      violations.push('包含隐私询问');
    }

    // 4. 熔断状态下禁止拟人化撒娇/调侃
    if (fuseLevel >= 2 && this.containsPersonifiedTerms(replyText)) {
      violations.push('预警熔断下禁止拟人化表达');
    }

    if (violations.length > 0) {
      return { pass: false, violations, suggestion: FUSE_CONFIG.responses[fuseLevel >= 3 ? 'level3' : 'level2'] };
    }

    return { pass: true, violations: [], suggestion: null };
  }

  /**
   * 是否为 AI 主动行为生成合规话术
   */
  suggestTopicShift(userPreferences = []) {
    const topics = userPreferences.length > 0
      ? userPreferences.map((p) => p.topic || p)
      : ['日常生活', '兴趣爱好', '美食', '音乐', '电影'];

    const topic = topics[Math.floor(Math.random() * topics.length)];
    return `说起来，最近有接触什么有趣的${topic}吗？`;
  }

  // ─── 辅助 ────────────────────────────────────────────

  containsIntimateTerms(text) {
    const terms = ['宝贝', '亲爱的', '想你了', '爱你', '抱抱', '亲亲', '摸摸', '乖', '小可爱', '甜心'];
    return terms.some((t) => text.includes(t));
  }

  containsPrivacyQuery(text) {
    const patterns = [
      /你的(地址|电话|照片|真实姓名)/,
      /告诉我.{0,5}(地址|电话|照片)/,
      /出来.{0,3}(见面|约)/,
    ];
    return patterns.some((p) => p.test(text));
  }

  containsPersonifiedTerms(text) {
    const terms = ['撒娇', '哼', '嘤', '贴贴', '蹭蹭'];
    return terms.some((t) => text.includes(t));
  }

  isNegativeTopicReply(text) {
    const negativeTerms = ['别难过', '我理解你', '会好的', '都会过去', '不是你的错', '冷静', '别哭'];
    return negativeTerms.some((t) => text.includes(t));
  }
}

export const behaviorRules = new BehaviorRules();
export default BehaviorRules;
