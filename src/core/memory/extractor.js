/**
 * 记忆提取器 v2.0 — 异步提取用户信息
 *
 * 从用户消息中提取：事实、偏好、负面记忆
 * 提取后加入待验证队列
 */
import { llm } from '../../utils/llm.js';
import {
  addToValidationQueue,
  setFact,
  upsertPreference,
  addNegativeMemory,
  addSharedEvent,
} from '../../utils/db.js';
import logger from '../../utils/logger.js';

export class MemoryExtractor {
  /**
   * 从用户消息中提取结构化信息
   * 异步执行，不影响当前对话
   */
  async extract(userId = 'default', text) {
    if (!text || text.length < 5) return { extracted: false };

    try {
      const extraction = await llm.chat(
        [
          {
            role: 'system',
            content: `从以下用户消息中提取结构化信息，只输出纯JSON：
{
  "facts": [{"category": "", "key": "", "value": ""}],
  "events": [{"type": "", "content": "", "tags": [], "emotion_score": 0}],
  "preferences": [{"topic": "", "score": 0}],
  "negatives": [{"topic": "", "reason": "", "severity": 50}]
}

规则：
1. 只提取明确陈述的事实，不猜测
2. category 可选值：basic, work, life, preference, health
3. emotion_score 范围：-100(极度负面)到100(极度正面)
4. preference score 范围：-100(讨厌)到100(喜欢)
5. 如果没有可提取的信息，返回空数组`,
          },
          { role: 'user', content: text },
        ],
        { temperature: 0.2, maxTokens: 512 },
      );

      const result = this.parseExtraction(extraction);

      // 事实 → 待验证队列
      for (const fact of result.facts || []) {
        if (fact.category && fact.key && fact.value) {
          setFact(userId, fact.category, fact.key, fact.value, false);
          logger.debug(`[extractor] Fact queued: ${fact.category}.${fact.key}`);
        }
      }

      // 共同事件 → 直接确认
      for (const event of result.events || []) {
        if (event.type && event.content) {
          addSharedEvent(userId, event.type, event.content, event.tags || [], event.emotion_score || 0);
          logger.debug(`[extractor] Event saved: ${event.type}`);
        }
      }

      // 偏好 → 直接应用
      for (const pref of result.preferences || []) {
        if (pref.topic) {
          upsertPreference(userId, pref.topic, pref.score || 0);
          logger.debug(`[extractor] Preference updated: ${pref.topic} = ${pref.score}`);
        }
      }

      // 负面 → 直接应用
      for (const neg of result.negatives || []) {
        if (neg.topic) {
          addNegativeMemory(userId, neg.topic, neg.reason || '', neg.severity || 50);
          logger.debug(`[extractor] Negative added: ${neg.topic}`);
        }
      }

      return { extracted: true, facts: result.facts?.length || 0, events: result.events?.length || 0 };
    } catch (err) {
      logger.warn(`[extractor] Extraction failed: ${err.message}`);
      return { extracted: false, error: err.message };
    }
  }

  parseExtraction(raw) {
    try {
      const cleaned = raw.trim().replace(/```(?:json)?\s*|\s*```/g, '');
      return JSON.parse(cleaned);
    } catch {
      return {};
    }
  }
}

export const memoryExtractor = new MemoryExtractor();
export default MemoryExtractor;
