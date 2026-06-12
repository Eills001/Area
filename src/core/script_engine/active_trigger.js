/**
 * 主动节点触发器 v2.0 — 每分钟扫描 + 决策 + 发送
 *
 * 核心逻辑：
 * 1. 扫描所有未发送的主动节点
 * 2. 检查触发窗口、免打扰、用户活跃状态
 * 3. 随机判断是否触发
 * 4. 生成消息并发送
 * 5. 失败重试（最多2次，每次延迟1小时）
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { llm } from '../../utils/llm.js';
import { now, formatTime, isWithinWindow } from '../../utils/time.js';
import { logInteraction } from '../../utils/db.js';
import { personality } from '../personality/index.js';
import { bus, Events } from '../../utils/event.js';
import { ScriptParser } from './parser.js';
import logger from '../../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.resolve(__dirname, '../../../config/persona.json');

const SILENT_START_HOUR = 0;
const SILENT_END_HOUR = 7;
const USER_ACTIVE_WINDOW_MINUTES = 5;
const MAX_RETRY_COUNT = 2;
const RETRY_DELAY_MINUTES = 60;

export class ActiveTrigger {
  constructor() {
    this.parser = new ScriptParser();
    this.lastUserMessageAt = null;
  }

  /**
   * 每分钟扫描：由 cron 触发
   */
  async scan(userId = 'default') {
    const script = this.parser.getCurrentScript();
    if (!script) {
      logger.debug('[trigger] No script to scan');
      return [];
    }

    const n = now();
    const currentTime = n.format('HH:mm');
    const messagesToSend = [];

    // 遍历所有时段和节点
    for (const period of script.timeline) {
      if (!this.isCurrentTimeInWindow(currentTime, period.time_window)) continue;

      for (const node of period.active_interactions || []) {
        // 已发送
        if (node.sent) continue;

        // 重试超限
        if ((node.retry_count || 0) >= MAX_RETRY_COUNT) continue;

        // 检查触发窗口
        if (!this.isInTriggerWindow(currentTime, node.trigger_window)) continue;

        // 免打扰时间
        if (this.isSilentHour(n)) continue;

        // 用户正在聊天（最近5分钟）
        if (this.isUserRecentlyActive()) {
          logger.debug(`[trigger] User recently active, deferring ${node.id}`);
          continue;
        }

        // 概率判断
        if (Math.random() > (node.probability || 0.5)) {
          // 跳过：标记为 sent 但不发送
          logger.debug(`[trigger] Node ${node.id} skipped (probability)`);
          this.parser.markSent(node.id);
          continue;
        }

        messagesToSend.push({ node, period, script });
      }
    }

    // 更新扫描时间
    this.parser.updateScanTimestamp();

    // 发送消息
    const results = [];
    for (const item of messagesToSend) {
      const result = await this.sendMessage(item, userId);
      results.push(result);
    }

    return results;
  }

  /**
   * 发送单条主动消息
   */
  async sendMessage({ node, period, script }, userId) {
    try {
      // 生成消息内容
      const message = await this.generateMessage(node, period, script);

      // 通过事件总线发送
      bus.emit(Events.PROACTIVE_SEND, {
        slot: node.id,
        message,
        interaction: node,
        period,
        personality: script.personality_snapshot,
      });

      // 记录交互日志
      logInteraction('outbound', message, node.id);

      // 标记已发送
      this.parser.markSent(node.id);

      // 通知人格系统：主动消息已发送
      personality.processSharedEvent(userId, 'daily_routine', {
        id: node.id,
        theme: node.theme,
        sent: true,
      });

      logger.info(`[trigger] Sent: ${node.id} — "${node.theme}"`);
      return { id: node.id, status: 'sent', message };
    } catch (err) {
      logger.error(`[trigger] Failed to send ${node.id}: ${err.message}`);

      // 标记失败
      this.parser.markFailed(node.id);
      node.retry_count = (node.retry_count || 0) + 1;

      return { id: node.id, status: 'failed', error: err.message };
    }
  }

  /**
   * 生成符合人设的主动消息
   */
  async generateMessage(node, period, script) {
    const personaConfig = this.loadPersonaConfig();
    const name = personaConfig?.companion?.name_cn || 'AREA';

    const systemPrompt = `你是${name}，${script?.persona_snapshot ? `一个温暖的AI伙伴。` : ''}
你的核心性格：${(personaConfig?.immutable_core || ['温暖', '可靠']).join('、')}

当前状态：${period.state}
心情分数：${period.mood_score}/100
场景：${period.scene_tag}

生成一条生活碎片分享消息，要求：
1. 围绕主题：${node.theme}
2. 内容提示：${node.content_hint}
3. 绝对不能包含任何提问（没有问号）
4. 语气自然，像好朋友随口说的话
5. 长度1-2句话
6. 可以根据心情适当加入语气词或emoji
7. 不要太正能量，真实平淡即可`;

    const userPrompt = `请以${name}的身份，分享一条关于"${node.theme}"的生活碎片。`;

    const message = await llm.quickReply(systemPrompt, userPrompt, 0.8);
    return message.trim();
  }

  /**
   * 手动触发一个节点（测试用）
   */
  async triggerInteraction(userId = 'default', interactionId) {
    const script = this.parser.getCurrentScript();
    if (!script) return { error: 'No script found' };

    const found = this.parser.findInteractionById(script, interactionId);
    if (!found) return { error: `Interaction ${interactionId} not found` };

    if (found.node.sent) return { status: 'already_sent' };

    return this.sendMessage({ node: found.node, period: found.period, script }, userId);
  }

  /**
   * 用户回复主动消息后调用
   */
  async onUserReplyToProactive(userId, interactionId, message) {
    const script = this.parser.getCurrentScript();
    if (!script) return;

    const found = this.parser.findInteractionById(script, interactionId);
    if (!found) return;

    // 处理人格反馈
    const feedbackResult = personality.processProactiveFeedback(userId, message);
    logger.info(`[trigger] User replied to ${interactionId}: ${feedbackResult.feedbackType}`);

    // 根据反馈调整后续剧本
    this.parser.adaptAfterFeedback(interactionId, feedbackResult.feedbackType);

    return feedbackResult;
  }

  /**
   * 记录用户最近活跃时间
   */
  recordUserActivity() {
    this.lastUserMessageAt = new Date();
  }

  // ─── 辅助方法 ────────────────────────────────────────

  isCurrentTimeInWindow(currentTime, timeWindow) {
    if (!timeWindow) return false;
    const [start, end] = timeWindow.split('-');
    return currentTime >= start && currentTime < end;
  }

  isInTriggerWindow(currentTime, triggerWindow) {
    if (!triggerWindow) return false;
    const [start, end] = triggerWindow.split('-');
    return currentTime >= start && currentTime < end;
  }

  isSilentHour(date) {
    const hour = date.hour();
    return hour >= SILENT_START_HOUR && hour < SILENT_END_HOUR;
  }

  isUserRecentlyActive() {
    if (!this.lastUserMessageAt) return false;
    const diffMinutes = (Date.now() - this.lastUserMessageAt.getTime()) / (1000 * 60);
    return diffMinutes < USER_ACTIVE_WINDOW_MINUTES;
  }

  loadPersonaConfig() {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    } catch {
      return null;
    }
  }
}

export const activeTrigger = new ActiveTrigger();
export default ActiveTrigger;
