/**
 * 事件总线 — 解耦核心模块通信
 */
import { EventEmitter } from 'events';

export const bus = new EventEmitter();

// 标准事件名常量
export const Events = {
  // 定时触发
  SCHEDULE_TICK: 'schedule:tick',

  // 用户交互
  USER_MESSAGE: 'user:message',
  USER_SILENT: 'user:silent',

  // 主动触达
  PROACTIVE_SHOULD_SEND: 'proactive:should_send',
  PROACTIVE_SEND: 'proactive:send',
  PROACTIVE_SUPPRESS: 'proactive:suppress',

  // 情绪
  EMOTION_NEGATIVE_DETECTED: 'emotion:negative',
  EMOTION_POSITIVE_DETECTED: 'emotion:positive',
  FUSE_TRIGGERED: 'fuse:triggered',
  FUSE_RESET: 'fuse:reset',

  // 记忆
  MEMORY_ADDED: 'memory:added',
  MEMORY_RECALLED: 'memory:recalled',

  // 剧本
  SCRIPT_LOADED: 'script:loaded',
  SCRIPT_PHASE_CHANGE: 'script:phase_change',

  // 系统
  ERROR: 'system:error',
  HEALTH_CHECK: 'system:health',
};

// 设置最大监听数，避免泄漏警告
bus.setMaxListeners(50);

export default bus;
