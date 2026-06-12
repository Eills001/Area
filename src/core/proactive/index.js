/**
 * 主动触达总控 v2.1 — 纯发送 + 风控层 + 熔断联动
 *
 * v2.1 角色：
 * - 不独立生成消息（剧本引擎驱动）
 * - 只负责风控检查 + 最终发送
 * - 集成 v2.0 4级熔断器
 */
import { logInteraction } from '../../utils/db.js';
import { bus, Events } from '../../utils/event.js';
import { now } from '../../utils/time.js';
import { getSessionFuseState } from '../emotion_fuse/index.js';
import { evaluateTrigger, quickGuardCheck } from './evaluate_trigger.js';
import logger from '../../utils/logger.js';

/**
 * 发送主动消息（由剧本引擎调用）
 * 先做熔断检查再发送
 */
export async function sendProactiveMessage(sessionId = 'default', message, meta = {}) {
  const fuseState = getSessionFuseState(sessionId);

  // 风控：熔断中
  if (fuseState && fuseState.fuse_level >= 1) {
    logger.warn(`[proactive] Fuse level ${fuseState.fuse_level} — message suppressed`);
    return { action: 'suppress', reason: `fuse_level_${fuseState.fuse_level}` };
  }

  // 风控：被锁定（level 3 永久）
  if (fuseState && fuseState.is_locked) {
    logger.warn('[proactive] Session locked — message blocked');
    return { action: 'blocked', reason: 'session_locked' };
  }

  // 记录交互
  logInteraction('outbound', message, meta.id || null);

  // 发射事件
  bus.emit(Events.PROACTIVE_SEND, {
    slot: meta.id || 'script_driven',
    sessionId,
    message,
    meta,
    time: now().toISOString(),
  });

  logger.info(`[proactive] Message sent: ${(message || '').slice(0, 30)}...`);
  return { action: 'sent', message };
}

export async function onScheduleTick(slot) {
  logger.info(`[proactive] Legacy tick: ${slot}`);
  return { action: 'delegated', note: 'v2.1: use scriptEngine.scanActiveInteractions()' };
}

export { isFuseActive } from '../emotion_fuse/index.js';
export { evaluateTrigger, quickGuardCheck } from './evaluate_trigger.js';

export default { sendProactiveMessage, onScheduleTick, evaluateTrigger, quickGuardCheck };
