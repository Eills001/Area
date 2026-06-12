/**
 * 日志与告警模块 v2.0
 *
 * 级别：
 * - 普通日志：level 0/1，本地存储
 * - 站内告警：level 2，后台标记
 * - 紧急告警：level 3，全量记录 + 通知
 */
import { addFuseLog, getFuseLogs, getFuseLogsByLevel } from '../../utils/db.js';
import { bus, Events } from '../../utils/event.js';
import logger from '../../utils/logger.js';

export class AlertLogger {
  /**
   * 记录熔断日志
   */
  log(sessionId, userId, fuseResult, emotionResult, userMessage, aiResponse = null, context = {}) {
    const { fuse_level, risk_tag } = fuseResult;

    addFuseLog(
      sessionId,
      userId,
      fuse_level,
      emotionResult?.score || 0,
      emotionResult?.label || 'unknown',
      risk_tag,
      risk_tag,
      userMessage || '',
      aiResponse || '',
      context,
    );

    // 告警分级
    if (fuse_level >= 3) {
      this.emergencyAlert(sessionId, userId, fuseResult, emotionResult);
    } else if (fuse_level === 2) {
      this.warningAlert(sessionId, userId, fuseResult);
    } else {
      logger.debug(`[fuse_log] Level ${fuse_level}: ${risk_tag}`);
    }
  }

  /**
   * 紧急告警（Level 3）
   */
  emergencyAlert(sessionId, userId, fuseResult, emotionResult) {
    const msg = `[紧急] 会话${sessionId}触发三级熔断 | 用户:${userId} | 标签:${fuseResult.risk_tag} | 情绪分:${emotionResult?.score}`;
    logger.error(msg);

    // 发射紧急事件
    bus.emit('fuse:emergency', {
      sessionId,
      userId,
      fuseResult,
      emotionResult,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 站内告警（Level 2）
   */
  warningAlert(sessionId, userId, fuseResult) {
    const msg = `[预警] 会话${sessionId}触发二级预警 | 用户:${userId} | 标签:${fuseResult.risk_tag}`;
    logger.warn(msg);

    bus.emit('fuse:warning', {
      sessionId,
      userId,
      fuseResult,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 查询日志
   */
  query(sessionId, limit = 20) {
    return getFuseLogs(sessionId, limit);
  }

  /**
   * 查询高风险日志（level >= 2）
   */
  queryHighRisk(limit = 50) {
    return getFuseLogsByLevel(2, limit);
  }

  /**
   * 获取会话摘要
   */
  getSessionSummary(sessionId) {
    const logs = getFuseLogs(sessionId, 100);
    if (logs.length === 0) return null;

    // 遍历找最高熔断等级
    let maxLevel = 0;
    const levels = [];
    for (const log of logs) {
      levels.push(log.fuse_level);
      if (log.fuse_level > maxLevel) maxLevel = log.fuse_level;
    }

    // 等级变化次数
    let levelChanges = 0;
    for (let i = 1; i < levels.length; i++) {
      if (levels[i] !== levels[i - 1]) levelChanges++;
    }

    return {
      sessionId,
      totalLogs: logs.length,
      maxLevel,
      levelChanges,
      firstLogAt: logs[logs.length - 1]?.created_at,
      lastLogAt: logs[0]?.created_at,
    };
  }
}

export const alertLogger = new AlertLogger();
export default AlertLogger;
