/**
 * 互动反馈处理器 — 分类用户反馈 → 计算人格调整量
 *
 * 反馈类型：
 *   super_positive  → 强烈正面（长回复+带emoji+反问）
 *   positive        → 普通正面（>5字或带emoji）
 *   neutral         → 中性（无变化）
 *   negative        → 消极（≤2字: 哦/嗯/呵）
 *   extremely_negative → 极度消极（含"滚/别烦我/关你屁事"）
 */
const NEGATIVE_SHORT_PATTERN = /^(哦|嗯|呵|额|行|好|可|E|e).{0,1}$/;
const EXTREME_NEGATIVE_KEYWORDS = ['滚', '关你屁事', '别烦我', '烦死了', '别管我', '闭嘴'];

export class FeedbackProcessor {
  /** 分类用户消息 */
  classifyFeedback(message) {
    const text = (message.text || message || '').trim();
    if (!text) return 'neutral';

    // 极度消极
    const hasExtreme = EXTREME_NEGATIVE_KEYWORDS.some((kw) => text.includes(kw));
    if (hasExtreme) return 'extremely_negative';

    // 消极（极短回复）
    if (text.length <= 2 && NEGATIVE_SHORT_PATTERN.test(text)) return 'negative';

    // 超级积极（长回复 + 反问 + ≥2 个 emoji）
    const emojiCount = (text.match(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu) || []).length;
    if (text.length > 20 && text.includes('?') && emojiCount >= 2) return 'super_positive';

    // 普通积极
    if (text.length > 5 || emojiCount >= 1) return 'positive';

    return 'neutral';
  }

  /**
   * 处理主动消息反馈 → 返回调整量对象
   */
  processProactiveFeedback(message, feedbackType) {
    const adjustments = {};
    const text = (message.text || message || '');
    const topicType = this.classifyTopic(text);

    switch (feedbackType) {
      case 'super_positive':
        adjustments.sharing_tendency = 3;
        adjustments.positive_share_ratio = this.isPositive(text) ? 2 : -1;
        if (topicType) {
          adjustments[topicType] = 5;
          adjustments.topic_preference = 3; // 深度话题受欢迎 → 提升偏好
        }
        break;

      case 'positive':
        adjustments.sharing_tendency = 1;
        if (topicType) {
          adjustments[topicType] = 2;
          adjustments.topic_preference = 1;
        }
        break;

      case 'neutral':
        break;

      case 'negative':
        adjustments.sharing_tendency = -3;
        if (topicType) {
          adjustments[topicType] = -5;
          adjustments.topic_preference = -3; // 话题不受欢迎 → 降低对应偏好
        }
        break;

      case 'extremely_negative':
        adjustments.sharing_tendency = -10;
        // 暂停天数由上层记录到 proactive_pause_until
        adjustments._pause_proactive_days = 3;
        break;
    }

    return adjustments;
  }

  /**
   * 处理用户主动发起的对话反馈
   */
  processUserInitiated(message) {
    const text = (message.text || message || '');
    const isPos = this.isPositive(text);
    const isNeg = this.isNegative(text);

    return {
      user_proactivity: 3, // 用户主动发起对话 → 积极性提升
      outgoing: text.length > 15 ? 2 : 1,
      positive_attitude: isPos ? 2 : isNeg ? -1 : 0,
      empathy_level: isNeg ? 1 : 0,
    };
  }

  /** 处理共同事件（如一起度过某个里程碑） */
  processSharedEvent(eventType) {
    const eventAdjustments = {
      milestone: { empathy_level: 3, sharing_tendency: 2 },
      celebration: { positive_attitude: 3, sharing_tendency: 3 },
      hardship: { empathy_level: 5, complaint_level: -2 },
      daily_routine: { sharing_tendency: 1 },
    };
    return eventAdjustments[eventType] || {};
  }

  // ─── 辅助方法 ────────────────────────────────────────

  classifyTopic(text) {
    if (/工作|项目|客户|GEO|推广|丝网/.test(text)) return 'work_motivation';
    if (/运动|跑步|健身|锻炼/.test(text)) return 'exercise_enthusiasm';
    if (/睡|失眠|熬夜|困/.test(text)) return 'night_owl';
    if (/辣|火锅|烧烤|吃/.test(text)) return 'spicy_tolerance';
    if (/开心|高兴|棒|好耶/.test(text)) return 'positive_attitude';
    if (/吐槽|抱怨|烦|无语/.test(text)) return 'complaint_level';
    return null;
  }

  isPositive(text) {
    return /[哈哈😄😂🤣开心👍棒好耶不错厉害牛]/.test(text);
  }

  isNegative(text) {
    return /难受|伤心|烦|累|算了/.test(text);
  }
}

export const feedbackProcessor = new FeedbackProcessor();
export default FeedbackProcessor;
