/**
 * 记忆系统 v2.0 — 记忆涟漪 + 无感套话 + 分层记忆
 *
 * 对外 API（匹配设计文档七、模块 API 参考）：
 *   getFact / setFact / deleteFact
 *   addEvent / getRecentEvents / getRelevantEvents / deleteEvent
 *   updatePreference / getTopPreferences / getPositiveTopics
 *   addNegativeMemory / isNegativeTopic / removeNegativeMemory
 *   addCollectionTask / getPendingTasks
 *   queueForExtraction / validateMemory
 *   generateMessageWithMemory
 *   getAllMemories / clearAllMemories
 */
import {
  addMemory, recallMemories, touchMemory, decayAllMemories,
  addEvent, getRecentEvents, logInteraction,
} from '../../utils/db.js';
import {
  setFact as dbSetFact, getFact as dbGetFact, deleteFact as dbDeleteFact,
  addSharedEvent, getRecentSharedEvents, getRelevantEvents, touchSharedEvent, deleteSharedEvent,
  upsertPreference, getTopPreferences as dbGetPrefs, getPositiveTopics,
  addNegativeMemory as dbAddNegative, isNegativeTopic, removeNegativeMemory,
  addCollectionTask, getNextCollectionTask, updateCollectionTask,
  clearAllMemories as dbClearAll,
} from '../../utils/db.js';
import { memoryExtractor } from './extractor.js';
import { memoryRipples } from './ripples.js';
import { memoryValidator } from './validator.js';
import { informationCollector } from './collector.js';
import { sharedEventsManager } from './shared_events.js';
import { memoryManager } from './manager.js';
import { bus, Events } from '../../utils/event.js';
import { today } from '../../utils/time.js';
import logger from '../../utils/logger.js';

class Memory {
  // ─── 事实记忆 ────────────────────────────────────────

  getFact(userId = 'default', category, key) {
    return dbGetFact(userId, category, key);
  }

  setFact(userId = 'default', category, key, value, confirmed = false) {
    dbSetFact(userId, category, key, value, confirmed);
    bus.emit(Events.MEMORY_ADDED, { type: 'fact', category, key, value });
  }

  deleteFact(userId = 'default', category, key) {
    dbDeleteFact(userId, category, key);
  }

  // ─── 共同事件 ────────────────────────────────────────

  addEvent(userId = 'default', eventType, content, tags = [], emotionScore = 0, importance = 50) {
    sharedEventsManager.add(userId, eventType, content, tags, emotionScore, importance);
  }

  getRecentEvents(userId = 'default', limit = 10) {
    return sharedEventsManager.getRecent(userId, limit);
  }

  getRelevantEvents(userId = 'default', theme, limit = 3) {
    return sharedEventsManager.getRelevant(userId, limit);
  }

  deleteEvent(userId = 'default', eventId) {
    sharedEventsManager.remove(userId, eventId);
  }

  // ─── 偏好记忆 ────────────────────────────────────────

  updatePreference(userId = 'default', topic, score) {
    upsertPreference(userId, topic, score);
  }

  getTopPreferences(userId = 'default', limit = 5) {
    return dbGetPrefs(userId, limit);
  }

  getPositiveTopics(userId = 'default', limit = 3) {
    return getPositiveTopics(userId, limit);
  }

  // ─── 负面记忆 ────────────────────────────────────────

  addNegativeMemory(userId = 'default', topic, reason, severity = 50, expiresAt = null) {
    dbAddNegative(userId, topic, reason, severity, expiresAt);
  }

  isNegativeTopic(userId = 'default', topic) {
    return isNegativeTopic(userId, topic);
  }

  removeNegativeMemory(userId = 'default', topic) {
    removeNegativeMemory(userId, topic);
  }

  // ─── 套话任务 ────────────────────────────────────────

  addCollectionTask(userId = 'default', category, key, priority = 50) {
    addCollectionTask(userId, category, key, priority);
  }

  getPendingTasks(userId = 'default') {
    return getNextCollectionTask(userId);
  }

  // ─── 记忆提取与验证 ──────────────────────────────────

  async queueForExtraction(userId = 'default', message) {
    return memoryExtractor.extract(userId, message);
  }

  async validateMemory(userId = 'default', key, value) {
    return memoryValidator.validate(userId, key, value);
  }

  validateAndPromote(userId = 'default', key, value) {
    return memoryValidator.validate(userId, key, value);
  }

  // ─── 记忆涟漪（主动引用） ────────────────────────────

  async generateMessageWithMemory(userId = 'default', baseMessage, theme) {
    return memoryRipples.generateMessageWithMemory(userId, baseMessage, theme);
  }

  // ─── 记忆衰减 ────────────────────────────────────────

  async dailyDecay() {
    decayAllMemories(0.85);
    logger.info('[memory] Daily decay applied (v2.0)');
  }

  // ─── 套话注入 ────────────────────────────────────────

  async injectCollection(userId = 'default', reply) {
    return informationCollector.injectCollectionMessage(userId, reply);
  }

  // ─── 用户管理 ────────────────────────────────────────

  getAllMemories(userId = 'default') {
    return memoryManager.getAllMemories(userId);
  }

  clearAllMemories(userId = 'default') {
    memoryManager.clearAll(userId);
  }

  // ─── 旧 API 兼容 ─────────────────────────────────────

  recordPreference(content, importance = 0.7) {
    addMemory('preference', content, { importance, tags: ['preference'] });
    bus.emit(Events.MEMORY_ADDED, { type: 'preference', content });
  }

  recordEvent(name, metadata = {}) {
    addEvent(name, today(), metadata);
    logger.info(`[memory] Legacy event: ${name}`);
  }

  buildContinuityContext(yesterdayLogPath) {
    const recent = recallMemories(3);
    if (recent.length === 0) return null;
    recent.forEach((m) => touchMemory(m.id));
    return {
      memories: recent.map((m) => m.content),
      continuePoint: recent[0]?.content || null,
    };
  }

  getRecentState() {
    return {
      memories: recallMemories(5),
      events: getRecentEvents(3),
    };
  }

  // ─── 初始化默认套话任务 ──────────────────────────────

  initCollectionTasks(userId = 'default') {
    informationCollector.initDefaultTasks(userId);
    logger.info('[memory] Default collection tasks initialized');
  }
}

const memory = new Memory();

// ─── 向后兼容旧导出 ────────────────────────────────────

async function dailyDecay() { return memory.dailyDecay(); }
async function recordPreference(c, i) { return memory.recordPreference(c, i); }
async function recordEvent(n, m) { return memory.recordEvent(n, m); }
function buildContinuityContext(p) { return memory.buildContinuityContext(p); }
function getRecentState() { return memory.getRecentState(); }

export {
  memory,
  Memory,
  dailyDecay,
  recordPreference,
  recordEvent,
  buildContinuityContext,
  getRecentState,
};

export default {
  memory,
  dailyDecay,
  recordPreference,
  recordEvent,
  buildContinuityContext,
  getRecentState,
};
