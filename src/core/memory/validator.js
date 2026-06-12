/**
 * 记忆验证器 v2.0
 *
 * 职责：
 * - 管理待验证记忆队列（7天过期）
 * - 用户再次提及相同信息时自动验证并提升到事实记忆
 * - 每日清理过期验证项
 */
import {
  addToValidationQueue,
  getPendingValidations,
  validateAndPromote,
  cleanExpiredValidations,
  setFact,
} from '../../utils/db.js';
import logger from '../../utils/logger.js';

export class MemoryValidator {
  /**
   * 加入待验证队列
   */
  addToQueue(userId = 'default', memoryType, data) {
    addToValidationQueue(userId, memoryType, data);
    logger.debug(`[validator] Queued for validation: ${data.category || ''}.${data.key || ''}`);
  }

  /**
   * 验证记忆（用户再次提及时调用）
   * 如果匹配待验证队列中的项，自动提升为确认事实
   */
  async validate(userId = 'default', key, value) {
    const promoted = validateAndPromote(userId, key, value);
    if (promoted) {
      logger.info(`[validator] Memory validated: ${key} = ${value}`);
    }
    return promoted;
  }

  /**
   * 获取所有待验证项
   */
  getPending(userId = 'default') {
    return getPendingValidations(userId);
  }

  /**
   * 清理过期验证项（每日调用）
   */
  cleanExpired() {
    const result = cleanExpiredValidations();
    if (result.changes > 0) {
      logger.info(`[validator] Cleaned ${result.changes} expired validations`);
    }
    return result.changes;
  }

  /**
   * 直接确认事实记忆
   */
  confirm(userId = 'default', category, key, value) {
    setFact(userId, category, key, value, true);
    logger.info(`[validator] Fact confirmed: ${category}.${key} = ${value}`);
  }
}

export const memoryValidator = new MemoryValidator();
export default MemoryValidator;
