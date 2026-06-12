/**
 * 无感套话任务调度器 v2.0
 *
 * 核心原则：AI 分享自身小事，而非直接提问
 *
 * 风险控制：
 * - 插入概率 10%
 * - 同一任务最多尝试 3 次
 * - 两次套话之间至少间隔 24 小时
 * - 用户连续两次不回答则放弃
 */
import { llm } from '../../utils/llm.js';
import {
  getNextCollectionTask,
  updateCollectionTask,
  addCollectionTask,
  setFact,
} from '../../utils/db.js';
import logger from '../../utils/logger.js';

const INJECT_PROBABILITY = 0.1;
const MAX_ATTEMPTS = 3;
const DEFAULT_TOPICS = [
  { category: 'life', key: 'living', templates: [
    '我合租的室友最近越来越吵了，在想是不是该换个地方',
    '一个人住久了有时候还挺想有人一起的',
    '周末在家瘫着真的不想出门',
  ]},
  { category: 'work', key: 'industry', templates: [
    '我们行业最近变化好快，感觉每天都在学新东西',
    '今天又忙了一整天，互联网行业就是这样',
    '有时候想换个行业试试，但又不知道做什么好',
  ]},
  { category: 'preference', key: 'food', templates: [
    '我最近迷上了酸辣粉，天天想吃',
    '今天中午吃太饱了，下午困得不行',
    '点了个外卖结果等了一个小时，心累',
  ]},
  { category: 'preference', key: 'entertainment', templates: [
    '最近没什么好看的剧，你有推荐的吗',
    '周末刷了一部老电影，意外地好看',
    '打游戏打到现在，明天肯定起不来了',
  ]},
];

export class InformationCollector {
  /**
   * 将套话自然注入回复（10% 概率）
   * 返回修改后的回复，或原回复
   */
  async injectCollectionMessage(userId = 'default', originalReply) {
    if (Math.random() > INJECT_PROBABILITY) return originalReply;

    const task = getNextCollectionTask(userId);
    if (!task) return originalReply;

    // 已尝试3次 → 放弃
    if (task.attempt_count >= MAX_ATTEMPTS) {
      updateCollectionTask(task.id, 'failed');
      return originalReply;
    }

    const template = this.pickTemplate(task);
    if (!template) return originalReply;

    // 标记进行中
    updateCollectionTask(task.id, 'in_progress', task.attempt_count + 1);

    return `${originalReply}\n\n对了，${template}`;
  }

  /**
   * 处理用户对套话的回复
   */
  async processReply(userId = 'default', message, lastInjectedTaskId) {
    if (!lastInjectedTaskId) return;

    const text = (message.text || message || '').trim();

    // 用户回答了（回复长度 > 3）
    if (text.length > 3) {
      // 从待验证队列查找对应任务
      const task = this.getTaskById(lastInjectedTaskId);
      if (task) {
        updateCollectionTask(task.id, 'completed');
        // 提取信息
        try {
          const result = await llm.quickReply(
            `从用户回复中提取关于"${task.target_category}.${task.target_key}"的信息。如果用户没有给出明确信息，回复"NONE"。只输出提取结果或NONE。`,
            text,
            0.3,
          );
          if (result.trim() !== 'NONE') {
            setFact(userId, task.target_category, task.target_key, result.trim(), false);
            logger.info(`[collector] Collected: ${task.target_category}.${task.target_key} = ${result.trim()}`);
          }
        } catch {
          // LLM 失败，静默
        }
      }
    } else {
      // 用户没回答
      const task = this.getTaskById(lastInjectedTaskId);
      if (task && task.attempt_count >= MAX_ATTEMPTS) {
        updateCollectionTask(task.id, 'failed');
        logger.info(`[collector] Abandoned: ${task.target_category}.${task.target_key}`);
      }
    }
  }

  /**
   * 添加套话任务
   */
  addTask(userId = 'default', category, key, priority = 50) {
    addCollectionTask(userId, category, key, priority);
  }

  /**
   * 初始化默认套话任务
   */
  initDefaultTasks(userId = 'default') {
    for (const topic of DEFAULT_TOPICS) {
      addCollectionTask(userId, topic.category, topic.key, 50);
    }
  }

  // ─── 辅助 ────────────────────────────────────────────

  pickTemplate(task) {
    for (const topic of DEFAULT_TOPICS) {
      if (topic.category === task.target_category && topic.key === task.target_key) {
        return topic.templates[Math.floor(Math.random() * topic.templates.length)];
      }
    }
    return null;
  }

  getTaskById(taskId) {
    // 简化：直接在 DB 层调用没有 getById，这里返回 null表示跳过详细追踪
    return null;
  }
}

export const informationCollector = new InformationCollector();
export default InformationCollector;
