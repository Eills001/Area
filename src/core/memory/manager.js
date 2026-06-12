/**
 * 用户记忆管理接口 v2.0
 *
 * 提供用户可操作的记忆管理：
 * - 查看所有记忆
 * - 一键清除
 * - 按类别查看
 */
import {
  getFactsByCategory,
  getRecentSharedEvents,
  getTopPreferences as dbGetPrefs,
  getFact,
  setFact,
  deleteFact,
  deleteSharedEvent,
  clearAllMemories,
} from '../../utils/db.js';
import logger from '../../utils/logger.js';

export class MemoryManager {
  /**
   * 获取用户所有记忆摘要
   */
  getAllMemories(userId = 'default') {
    return {
      facts: {
        basic: getFactsByCategory(userId, 'basic'),
        work: getFactsByCategory(userId, 'work'),
        life: getFactsByCategory(userId, 'life'),
        preference: getFactsByCategory(userId, 'preference'),
        health: getFactsByCategory(userId, 'health'),
      },
      sharedEvents: getRecentSharedEvents(userId, 20),
      preferences: dbGetPrefs(userId, 10),
    };
  }

  /**
   * 获取某类别的所有记忆
   */
  getByCategory(userId = 'default', category) {
    return getFactsByCategory(userId, category);
  }

  /**
   * 更新事实记忆
   */
  updateFact(userId = 'default', category, key, value) {
    const existing = getFact(userId, category, key);
    if (!existing) return { error: 'Fact not found' };
    setFact(userId, category, key, value, true);
    return { updated: true, category, key, value };
  }

  /**
   * 删除事实记忆
   */
  removeFact(userId = 'default', category, key) {
    deleteFact(userId, category, key);
  }

  /**
   * 删除共享事件
   */
  removeEvent(userId = 'default', eventId) {
    deleteSharedEvent(userId, eventId);
  }

  /**
   * 一键清除所有记忆
   */
  clearAll(userId = 'default') {
    clearAllMemories(userId);
    logger.warn(`[memory_manager] All memories cleared for ${userId}`);
    return { cleared: true };
  }
}

export const memoryManager = new MemoryManager();
export default MemoryManager;
