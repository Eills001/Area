/**
 * Hermes-Companion — AREA 主动陪伴引擎
 *
 * v2.2.0: 4级情绪熔断器（安全底线）
 *
 * v2.2 架构变化：
 *   emotion_fuse 新增：
 *     ├── config.js          → 熔断配置 + 高危词库 + 情绪词典
 *     ├── rule_engine.js     → 前置规则引擎（静态拦截）
 *     ├── emotion_scorer.js  → 情绪评分引擎（0-100 + 上下文窗口）
 *     ├── behavior_rules.js  → AI行为约束规则
 *     ├── fuse_executor.js   → 4级熔断执行器
 *     └── alert_logger.js    → 日志与告警模块
 */

import { sendProactiveMessage } from './src/core/proactive/index.js';
import {
  memory,
  dailyDecay,
  recordPreference,
  recordEvent,
  buildContinuityContext,
  getRecentState,
} from './src/core/memory/index.js';
import {
  EmotionFuseCheck,
  analyzeUserMessage as legacyAnalyze,
  detectAnomaly,
  getHealingPersonalityState,
  resetSession,
  getSessionFuseState,
} from './src/core/emotion_fuse/index.js';
import { scriptEngine, generateDailyScript, loadDailyScript } from './src/core/script_engine/index.js';
import {
  personality,
  evolve,
  getPersonality,
  adjustPersonality,
} from './src/core/personality/index.js';
import logger from './src/utils/logger.js';
import { today, now, isSaturday, isSunday } from './src/utils/time.js';
import { bus, Events } from './src/utils/event.js';
import { addEvent } from './src/utils/db.js';

// ─── 生命周期 ───────────────────────────────────────────

/** 每日启动 */
export async function dailyBootstrap() {
  logger.info('[companion] Daily bootstrap v2.2 started');
  await dailyDecay();
  memory.initCollectionTasks();
  personality.applyTimeEvolution();
  const script = await scriptEngine.generateDailyScript();
  addEvent('daily_bootstrap_v2.2', now().toISOString(), { personality: personality.getCurrentState(), script_vibe: script.today_vibe });
  logger.info(`[companion] Bootstrap complete: ${script.today_vibe}`);
  return script;
}

/** 每分钟扫描主动节点 */
export async function scanActive() {
  return scriptEngine.scanActiveInteractions();
}

/**
 * 处理用户消息：全流程熔断检查
 */
export async function onUserMessage(sessionId = 'default', userId = 'default', text, interactionId = null, history = []) {
  // 记录活跃
  scriptEngine.recordUserActivity();

  // ─── v2.2 核心：EmotionFuseCheck ─────────────────
  const fuseResult = EmotionFuseCheck(sessionId, userId, text, '', history);
  logger.info(`[companion] Fuse check: level=${fuseResult.fuse_level} tag=${fuseResult.risk_tag}`);

  // 如果被熔断，跳过后续处理
  if (fuseResult.fuse_level >= 3 || fuseResult.locked) {
    return {
      blocked: true,
      fuse: fuseResult,
      reply_suggest: fuseResult.reply_suggest,
    };
  }

  // 异步提取记忆（熔断状态也提取）
  memory.queueForExtraction(userId, text);

  // 人格演化
  personality.processUserInitiated(userId, { text });

  // 回复主动消息
  if (interactionId) {
    await scriptEngine.onUserReplyToProactive(userId, interactionId, text);
  }

  return {
    blocked: false,
    fuse: fuseResult,
    personality: personality.getCurrentState(),
    healingState: fuseResult.fuse_level >= 1 ? getHealingPersonalityState() : null,
  };
}

/**
 * 生成回复时做 AI 行为约束检查
 */
export async function enhanceReply(sessionId = 'default', baseReply) {
  // 检查当前熔断状态
  const fuseState = getSessionFuseState(sessionId);

  // 熔断状态下使用标准回复
  if (fuseState && fuseState.fuse_level >= 3) {
    return '我在这里。如果你正在经历困难的时刻，请知道你可以联系专业的心理支持：希望24热线 400-161-9995。';
  }

  if (fuseState && fuseState.fuse_level === 2) {
    return '我在这里陪着你。有什么想聊的都可以跟我说。';
  }

  let reply = baseReply;

  // 记忆涟漪
  try {
    const enriched = await memory.generateMessageWithMemory('default', reply, 'general');
    if (enriched && enriched !== reply) reply = enriched;
  } catch {}

  // 套话注入
  try {
    const injected = await memory.injectCollection('default', reply);
    if (injected && injected !== reply) reply = injected;
  } catch {}

  return reply;
}

/** 会话开始 */
export async function onSessionStart(yesterdayLogPath) {
  const ctx = buildContinuityContext(yesterdayLogPath);
  evolve();
  return ctx;
}

// ─── 导出 ───────────────────────────────────────────────

export {
  sendProactiveMessage,
  memory, dailyDecay, recordPreference, recordEvent, buildContinuityContext, getRecentState,
  EmotionFuseCheck, detectAnomaly, getHealingPersonalityState, resetSession, getSessionFuseState,
  scriptEngine, generateDailyScript, loadDailyScript,
  personality, evolve, getPersonality, adjustPersonality,
  bus, Events,
};

// ─── 自检 ───────────────────────────────────────────────
const pState = personality.getCurrentState();
logger.info('[companion] HERMES-COMPANION v2.2.0 loaded');
logger.info(`[companion] Date: ${today()} | ${isSaturday() ? 'SAT' : isSunday() ? 'SUN' : 'WEEK'}`);
logger.info(`[companion] Fuse: 4-level protection | Memory: ripples | Script: v2.0`);
logger.info(`[companion] Personality: empathy=${pState.empathy_level} sharing=${pState.sharing_tendency}`);
