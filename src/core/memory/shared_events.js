/**
 * 共同事件管理器 v2.0 — 主动素材库
 *
 * 核心：记录和用户一起经历的事件
 * 供涟漪算法引用，让主动消息带"专属感"
 */
import {
  addSharedEvent as dbAdd,
  getRecentSharedEvents,
  getRelevantEvents,
  touchSharedEvent,
  deleteSharedEvent,
} from '../../utils/db.js';
import logger from '../../utils/logger.js';

export class SharedEventsManager {
  /**
   * 添加共同事件
   */
  add(userId = 'default', eventType, content, tags = [], emotionScore = 0, importance = 50) {
    dbAdd(userId, eventType, content, tags, emotionScore, importance);
    logger.debug(`[shared_events] Added: ${eventType} — ${(content || '').slice(0, 30)}`);
  }

  /**
   * 获取最近事件
   */
  getRecent(userId = 'default', limit = 10) {
    return getRecentSharedEvents(userId, limit);
  }

  /**
   * 获取与主题相关的事件
   */
  getRelevant(userId = 'default', limit = 3) {
    return getRelevantEvents(userId, limit);
  }

  /**
   * 标记事件已引用
   */
  touch(eventId) {
    touchSharedEvent(eventId);
  }

  /**
   * 删除事件（用户要求"不要再提"）
   */
  remove(userId = 'default', eventId) {
    deleteSharedEvent(userId, eventId);
    logger.info(`[shared_events] Deleted event ${eventId}`);
  }

  /**
   * 搜索事件（关键词匹配）
   */
  search(userId = 'default', keyword, limit = 5) {
    const events = getRecentSharedEvents(userId, 50);
    const lowerKw = keyword.toLowerCase();
    return events
      .filter((e) => (e.content || '').toLowerCase().includes(lowerKw))
      .slice(0, limit);
  }
}

export const sharedEventsManager = new SharedEventsManager();
export default SharedEventsManager;
