/**
 * 剧本解析器 v2.0
 *
 * 功能：
 * - 加载/保存剧本
 * - 查询当前时段状态
 * - 查找特定主动节点
 * - 标记节点状态（已发送、重试、失败）
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { now, formatTime, isWithinWindow } from '../../utils/time.js';
import logger from '../../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.resolve(__dirname, '../../../data/ai_daily_state.json');

export class ScriptParser {
  /**
   * 获取当前剧本
   */
  getCurrentScript() {
    try {
      const raw = fs.readFileSync(SCRIPT_PATH, 'utf-8');
      return JSON.parse(raw);
    } catch (err) {
      logger.warn(`[parser] Cannot load script: ${err.message}`);
      return null;
    }
  }

  /**
   * 保存剧本状态
   */
  saveScriptState(script) {
    try {
      fs.writeFileSync(SCRIPT_PATH, JSON.stringify(script, null, 2), 'utf-8');
    } catch (err) {
      logger.error(`[parser] Save failed: ${err.message}`);
    }
  }

  /**
   * 获取当前时段的状态
   */
  getCurrentState() {
    const script = this.getCurrentScript();
    if (!script || !script.timeline) return null;

    const n = now();
    const currentTime = n.format('HH:mm');

    for (const period of script.timeline) {
      const [start, end] = period.time_window.split('-');
      if (currentTime >= start && currentTime < end) {
        return {
          script,
          period,
          today_vibe: script.today_vibe,
          weather: script.weather,
          mood_score: period.mood_score,
          scene_tag: period.scene_tag,
          reply_mode: period.reply_mode,
          personality: script.personality_snapshot,
        };
      }
    }

    // 不在任何时段内（比如深夜）
    return {
      script,
      period: null,
      today_vibe: script.today_vibe,
      weather: script.weather,
      mood_score: 50,
      scene_tag: 'sleep',
      reply_mode: 'slow',
      personality: script.personality_snapshot,
    };
  }

  /**
   * 查找特定主动节点
   */
  findInteractionById(script, interactionId) {
    if (!script?.timeline) return null;
    for (const period of script.timeline) {
      for (const node of period.active_interactions || []) {
        if (node.id === interactionId) return { node, period };
      }
    }
    return null;
  }

  /**
   * 获取所有未发送的节点
   */
  getPendingInteractions() {
    const script = this.getCurrentScript();
    if (!script?.timeline) return [];

    const pending = [];
    for (const period of script.timeline) {
      for (const node of period.active_interactions || []) {
        if (!node.sent && (node.retry_count || 0) < 2) {
          pending.push({ node, period, script });
        }
      }
    }
    return pending;
  }

  /**
   * 标记节点已发送
   */
  markSent(interactionId) {
    const script = this.getCurrentScript();
    if (!script) return false;

    const found = this.findInteractionById(script, interactionId);
    if (!found) return false;

    found.node.sent = true;
    found.node.sent_at = now().toISOString();

    // 更新统计
    if (script.meta) {
      script.meta.sent_count = (script.meta.sent_count || 0) + 1;
    }

    this.saveScriptState(script);
    return true;
  }

  /**
   * 标记节点失败（重试计数+1）
   */
  markFailed(interactionId) {
    const script = this.getCurrentScript();
    if (!script) return false;

    const found = this.findInteractionById(script, interactionId);
    if (!found) return false;

    found.node.retry_count = (found.node.retry_count || 0) + 1;

    if (script.meta) {
      script.meta.failed_count = (script.meta.failed_count || 0) + 1;
    }

    this.saveScriptState(script);
    return true;
  }

  /**
   * 更新 last_scan_at
   */
  updateScanTimestamp() {
    const script = this.getCurrentScript();
    if (!script) return;
    if (!script.meta) script.meta = {};
    script.meta.last_scan_at = now().toISOString();
    this.saveScriptState(script);
  }

  /**
   * 根据用户反馈调整后续剧本
   */
  adaptAfterFeedback(interactionId, feedbackType) {
    const script = this.getCurrentScript();
    if (!script) return;

    const found = this.findInteractionById(script, interactionId);
    if (!found) return;

    // 积极反馈 → 后续节点有 30% 概率改为同类主题
    if (feedbackType === 'super_positive' || feedbackType === 'positive') {
      const theme = found.node.theme;
      for (const period of script.timeline) {
        for (const node of period.active_interactions || []) {
          if (node.sent) continue;
          if (Math.random() < 0.3) {
            node.theme = theme;
            node.content_hint = `继续聊${theme}相关的话题`;
          }
        }
      }
    }

    // 消极反馈 → 后续节点降低概率
    if (feedbackType === 'negative' || feedbackType === 'extremely_negative') {
      for (const period of script.timeline) {
        for (const node of period.active_interactions || []) {
          if (node.sent) continue;
          node.probability = Math.max(0.5, node.probability - 0.2);
        }
      }
    }

    this.saveScriptState(script);
  }
}

export const scriptParser = new ScriptParser();
export default ScriptParser;
