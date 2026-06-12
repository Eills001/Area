/**
 * Emoji 表情系统 — 统一入口
 *
 * 功能：
 *   1. 场景匹配 → 推荐 emoji（selector）
 *   2. 自动追加 emoji 到回复文本（selector.attachEmoji）
 *   3. 使用频率追踪 + 避免重复（usage_tracker）
 *   4. 表情包图库管理（sticker_manager）
 *   5. emoji 偏好随人格演化（evolution）
 *
 * 用法：
 *   import { emojiSystem } from './src/core/emoji/index.js';
 *
 *   // 为一条回复选 emoji
 *   const result = emojiSystem.pickForReply('早安泽营', { scene: 'morning_chat', personality, timeOfDay: 'morning' });
 *   // → { text: '早安泽营 🌅', emoji: ['🌅'], category: 'morning' }
 *
 *   // 给一条消息附加 emoji
 *   const enriched = emojiSystem.attachEmoji('今天加油！', { scene: 'encourage', personality });
 */
import { selectEmoji, attachEmoji } from './selector.js';
import { usageTracker } from './usage_tracker.js';
import { stickerManager } from './sticker_manager.js';
import { emojiEvolution } from './evolution.js';
import EMOJI_PALETTE, { SCENE_TO_PALETTE } from './palette.js';
import logger from '../../utils/logger.js';

class EmojiSystem {
  constructor() {
    this.initialized = false;
  }

  /** 初始化：确保 DB 迁移已执行 */
  init() {
    if (this.initialized) return;
    this._ensureDbTables();
    this.initialized = true;
    logger.info('[emoji-system] initialized');
  }

  /**
   * 为一条消息/回复选 emoji 并追加到文本
   *
   * @param {string} text - 原始消息文本
   * @param {object} options
   * @param {string} options.scene - 场景（greeting/goodbye/comfort/encourage/...）
   * @param {object} options.personality - 人格状态
   * @param {string} [options.timeOfDay] - 时段（auto 自动检测）
   * @param {number} [options.affection=50] - 好感度
   * @param {object} [options.userLastMessage] - 用户上条消息（用于内容匹配）
   * @param {number} [options.count=1] - emoji 数量
   * @param {'suffix'|'prefix'|'smart'} [options.position='smart'] - 追加位置
   * @param {boolean} [options.preferSticker=false] - 优先用表情包
   * @param {string} [options.userId='default'] - 用户 ID
   * @returns {{ text: string, emoji: string[], category: string, sticker: object|null }}
   */
  pickForReply(text, options = {}) {
    this.init();
    const {
      scene = 'reply_neutral',
      personality = {},
      timeOfDay: rawTime,
      affection = 50,
      userLastMessage = null,
      count = 1,
      position = 'smart',
      preferSticker = false,
      userId = 'default',
    } = options;

    const timeOfDay = rawTime || this._detectTimeOfDay();

    // 优先 sticker？
    if (preferSticker) {
      const sticker = stickerManager.getStickerForScene(scene, userId);
      if (sticker) {
        usageTracker.recordBatch(userId, ['📷'], 'sticker', scene);
        return {
          text,
          emoji: [],
          category: 'sticker',
          sticker,
          MEDIA: sticker.file_path,
        };
      }
    }

    // 选 emoji
    const result = attachEmoji(text, {
      scene,
      personality,
      timeOfDay,
      affection,
      userLastMessage,
      count,
    }, position);

    // 记录使用
    if (result.emoji.length > 0) {
      usageTracker.recordBatch(userId, result.emoji, result.category, scene);
    }

    return { ...result, sticker: null };
  }

  /**
   * 仅获取推荐的 emoji 列表（不追加文本）
   */
  getEmoji(options = {}) {
    this.init();
    const {
      scene = 'reply_neutral',
      personality = {},
      timeOfDay: rawTime,
      affection = 50,
      userLastMessage = null,
      count = 1,
    } = options;

    const timeOfDay = rawTime || this._detectTimeOfDay();
    return selectEmoji({ scene, personality, timeOfDay, affection, userLastMessage, count });
  }

  /**
   * 执行演化分析（建议每 20 条消息调用）
   */
  evolve(userId = 'default') {
    this.init();
    return emojiEvolution.evolve(userId);
  }

  /**
   * 获取最近刚用过的 emoji（用于避免重复）
   */
  getRecentEmoji(userId = 'default', n = 3) {
    this.init();
    return usageTracker.getRecentEmoji(userId, n);
  }

  /**
   * 获取统计
   */
  getStats(userId = 'default') {
    this.init();
    return {
      emoji: usageTracker.getAllStats(userId),
      stickers: stickerManager.getStats(userId),
      preferences: emojiEvolution.getPreferences(userId),
    };
  }

  /**
   * 获取完整的 emoji 调色板
   */
  getPalette() {
    return EMOJI_PALETTE;
  }

  /**
   * 添加一张新 sticker 到图库
   */
  addSticker(filePath, category, tags = [], userId = 'default') {
    this.init();
    return stickerManager.addSticker(filePath, category, tags, userId);
  }

  /**
   * 批量导入 sticker 文件夹
   */
  importStickers(dirPath, category = null, userId = 'default') {
    this.init();
    return stickerManager.importDirectory(dirPath, category, userId);
  }

  // ─── 内部 ─────────────────────────────────────────────

  _detectTimeOfDay() {
    const h = new Date().getHours();
    if (h >= 5 && h < 11) return 'morning';
    if (h >= 11 && h < 17) return 'afternoon';
    if (h >= 17 && h < 21) return 'evening';
    return 'night';
  }

  _ensureDbTables() {
    // 表创建在 db.js 的 initSchema 中
  }
}

// 单例
export const emojiSystem = new EmojiSystem();

export {
  selectEmoji,
  attachEmoji,
} from './selector.js';
export {
  usageTracker,
} from './usage_tracker.js';
export {
  stickerManager,
} from './sticker_manager.js';
export {
  emojiEvolution,
} from './evolution.js';
export {
  EMOJI_PALETTE,
  SCENE_TO_PALETTE,
} from './palette.js';
