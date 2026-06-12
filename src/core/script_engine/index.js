/**
 * 剧本引擎 v2.0 — 自运转每日生活剧本 + 主动节点触发器
 *
 * 对外 API（匹配设计文档九、模块 API 参考）：
 *   generateDailyScript(userId)       → 生成今日剧本（每日03:55调用）
 *   getCurrentScript(userId)          → 获取当前剧本
 *   getCurrentState(userId)           → 获取当前时段状态
 *   scanActiveInteractions(userId)    → 每分钟扫描主动节点
 *   onUserReplyToProactive(userId,id) → 处理用户对主动消息的回复
 *   triggerInteraction(userId, id)    → 手动触发（测试用）
 *
 * v2.0 核心变化：
 * - 剧本包含主动节点，不再依赖外部随机生成
 * - 主动触达总控退化为纯发送+风控层
 * - 所有主动消息由剧本引擎统一驱动
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { today, now, isSaturday, isSunday } from '../../utils/time.js';
import { personality } from '../personality/index.js';
import { ScriptGenerator } from './generator.js';
import { ScriptParser } from './parser.js';
import { ActiveTrigger } from './active_trigger.js';
import logger from '../../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.resolve(__dirname, '../../../data/ai_daily_state.json');

class ScriptEngine {
  constructor() {
    this.generator = new ScriptGenerator();
    this.parser = new ScriptParser();
    this.trigger = new ActiveTrigger();
  }

  // ─── 设计文档 API ─────────────────────────────────────

  /** 生成今日剧本（每日03:55自动调用） */
  async generateDailyScript(userId = 'default') {
    logger.info(`[script_engine] Generating daily script v2.0 for ${today()}`);

    // 备份昨日剧本（防止 LLM 失败后覆盖无法恢复）
    if (fs.existsSync(SCRIPT_PATH)) {
      const bakPath = SCRIPT_PATH + '.bak';
      try { fs.copyFileSync(SCRIPT_PATH, bakPath); } catch {}
    }

    const script = await this.generator.generate(userId);

    // 写入文件
    fs.writeFileSync(SCRIPT_PATH, JSON.stringify(script, null, 2), 'utf-8');

    logger.info(`[script_engine] Script saved: ${script.today_vibe}`);
    return script;
  }

  /** 获取当前剧本 */
  getCurrentScript() {
    return this.parser.getCurrentScript();
  }

  /** 获取当前时段的状态 */
  getCurrentState() {
    return this.parser.getCurrentState();
  }

  /** 每分钟扫描主动节点（由平台 Cron 触发） */
  async scanActiveInteractions(userId = 'default') {
    // 周六静默
    if (isSaturday()) {
      return { action: 'skip', reason: 'saturday_silent' };
    }

    const results = await this.trigger.scan(userId);
    const sent = results.filter((r) => r.status === 'sent');

    if (sent.length > 0) {
      logger.info(`[script_engine] Scan: ${sent.length} messages sent`);
    }

    return { action: 'scanned', total: results.length, sent: sent.length, results };
  }

  /** 处理用户对主动消息的回复 */
  async onUserReplyToProactive(userId = 'default', interactionId, message) {
    this.trigger.recordUserActivity();
    return this.trigger.onUserReplyToProactive(userId, interactionId, message);
  }

  /** 手动触发一个节点（测试用） */
  async triggerInteraction(userId = 'default', interactionId) {
    return this.trigger.triggerInteraction(userId, interactionId);
  }

  /** 记录用户活跃（收到任何消息时调用） */
  recordUserActivity() {
    this.trigger.recordUserActivity();
  }

  // ─── 旧 API 兼容 ─────────────────────────────────────

  getCurrentPersonality() {
    return personality.getCurrentState();
  }
}

const scriptEngine = new ScriptEngine();

// ─── 向后兼容旧导出 ────────────────────────────────────

function generateDailyScript() {
  return scriptEngine.generateDailyScript();
}

function loadDailyScript() {
  return scriptEngine.getCurrentScript();
}

export {
  scriptEngine,
  ScriptEngine,
  generateDailyScript,
  loadDailyScript,
};

export default {
  generateDailyScript,
  loadDailyScript,
  scriptEngine,
};
