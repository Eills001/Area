/**
 * 表情包图库管理器 — 本地图片表情包管理
 *
 * 管理 assets/stickers/{category}/ 目录下的图片表情包。
 * 每张图片可以通过 MEDIA:path 发送到微信。
 *
 * 未找到 sticker 时优雅降级到 emoji。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDB } from '../../utils/db.js';
import logger from '../../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STICKER_DIR = path.resolve(__dirname, '../../../assets/stickers');

// 支持的图片格式
const IMG_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];

export class StickerManager {
  constructor(stickerDir = STICKER_DIR) {
    this.stickerDir = stickerDir;
    this._cache = null; // 缓存目录扫描结果
  }

  /**
   * 扫描 sticker 目录，建立分类索引
   * 返回 { category: [{ name, path, ext }] }
   */
  scanLibrary() {
    if (this._cache) return this._cache;

    const library = {};
    if (!fs.existsSync(this.stickerDir)) {
      logger.warn(`[sticker] sticker dir not found: ${this.stickerDir}`);
      return library;
    }

    const categories = fs.readdirSync(this.stickerDir, { withFileTypes: true });
    for (const entry of categories) {
      if (!entry.isDirectory()) continue;
      const catDir = path.join(this.stickerDir, entry.name);
      const files = fs.readdirSync(catDir)
        .filter((f) => IMG_EXTS.includes(path.extname(f).toLowerCase()))
        .map((f) => ({
          name: path.basename(f, path.extname(f)),
          path: path.resolve(catDir, f),
          ext: path.extname(f).toLowerCase(),
        }));

      if (files.length > 0) {
        library[entry.name] = files;
      }
    }

    this._cache = library;
    logger.info(`[sticker] scanned library: ${Object.keys(library).length} categories, ${Object.values(library).flat().length} total`);
    return library;
  }

  /** 刷新缓存（添加新 sticker 后调用） */
  refreshCache() {
    this._cache = null;
    return this.scanLibrary();
  }

  /**
   * 根据场景从数据库匹配 sticker
   * sticker_library 表有 tags/category 信息
   */
  getStickerForScene(scene, userId = 'default') {
    const db = getDB();
    const stickers = db
      .prepare(
        `SELECT id, file_path, category, tags
         FROM sticker_library
         WHERE user_id = ?
           AND (tags LIKE ? OR category = ?)
         ORDER BY RANDOM()
         LIMIT 1`
      )
      .all(userId, `%${scene}%`, scene);

    if (stickers.length > 0) {
      const s = stickers[0];
      this._recordStickerUse(s.id, userId);
      return s;
    }

    // fallback: 从同类别随机
    const category = sceneToCategory(scene);
    if (category) {
      const fallback = db
        .prepare(
          `SELECT id, file_path, category, tags
           FROM sticker_library
           WHERE user_id = ? AND category = ?
           ORDER BY RANDOM()
           LIMIT 1`
        )
        .get(userId, category);
      if (fallback) {
        this._recordStickerUse(fallback.id, userId);
        return fallback;
      }
    }

    return null;
  }

  /**
   * 随机获取一张 sticker（用于没有特定场景需求时）
   */
  getRandomSticker(userId = 'default') {
    const db = getDB();
    return db
      .prepare(
        `SELECT id, file_path, category, tags
         FROM sticker_library
         WHERE user_id = ?
         ORDER BY RANDOM()
         LIMIT 1`
      )
      .get(userId);
  }

  /**
   * 注册一张新 sticker 到库
   * @param {string} filePath - 图片文件绝对路径
   * @param {string} category - warm/happy/comfort/tease/...
   * @param {string[]} tags - 场景标签
   * @param {string} userId
   */
  addSticker(filePath, category, tags = [], userId = 'default') {
    if (!fs.existsSync(filePath)) {
      logger.error(`[sticker] file not found: ${filePath}`);
      return null;
    }

    const ext = path.extname(filePath).toLowerCase();
    if (!IMG_EXTS.includes(ext)) {
      logger.error(`[sticker] unsupported format: ${ext}`);
      return null;
    }

    // 自动复制到对应类目目录
    const catDir = path.join(this.stickerDir, category);
    if (!fs.existsSync(catDir)) fs.mkdirSync(catDir, { recursive: true });

    const baseName = path.basename(filePath);
    const destPath = path.join(catDir, baseName);

    if (filePath !== destPath) {
      fs.copyFileSync(filePath, destPath);
    }

    const db = getDB();
    const result = db
      .prepare(
        `INSERT INTO sticker_library (user_id, file_path, category, tags)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, file_path) DO NOTHING`
      )
      .run(userId, destPath, category, JSON.stringify(tags));

    this.refreshCache();
    logger.info(`[sticker] added: ${destPath} (${category})`);
    return result;
  }

  /**
   * 批量导入 sticker 文件夹
   */
  importDirectory(dirPath, category = null, userId = 'default') {
    if (!fs.existsSync(dirPath)) {
      logger.error(`[sticker] import dir not found: ${dirPath}`);
      return 0;
    }

    let count = 0;
    const files = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const f of files) {
      if (f.isFile() && IMG_EXTS.includes(path.extname(f.name).toLowerCase())) {
        const cat = category || guessCategory(f.name);
        const fullPath = path.join(dirPath, f.name);
        this.addSticker(fullPath, cat, [cat], userId);
        count++;
      }
    }

    logger.info(`[sticker] imported ${count} stickers from ${dirPath}`);
    return count;
  }

  /** 删除 sticker */
  removeSticker(id, userId = 'default') {
    const db = getDB();
    const sticker = db.prepare('SELECT file_path FROM sticker_library WHERE id = ? AND user_id = ?').get(id, userId);
    if (!sticker) return false;

    db.prepare('DELETE FROM sticker_library WHERE id = ? AND user_id = ?').run(id, userId);
    // 不删源文件，可能被多个条目引用
    this.refreshCache();
    return true;
  }

  // ─── 内部方法 ─────────────────────────────────────────

  _recordStickerUse(stickerId, userId) {
    getDB()
      .prepare(
        `UPDATE sticker_library
         SET use_count = use_count + 1, last_used_at = datetime('now')
         WHERE id = ?`
      )
      .run(stickerId);
  }

  /** 获取统计 */
  getStats(userId = 'default') {
    return getDB()
      .prepare(
        `SELECT category, COUNT(*) as count, SUM(use_count) as total_uses
         FROM sticker_library
         WHERE user_id = ?
         GROUP BY category`
      )
      .all(userId);
  }
}

/** 场景 → sticker 类别 */
function sceneToCategory(scene) {
  const map = {
    greeting: 'warm',
    goodbye: 'night',
    comfort: 'comfort',
    encourage: 'encourage',
    tease: 'tease',
    celebrate: 'happy',
    morning_chat: 'morning',
    night_chat: 'night',
    deep_chat: 'warm',
  };
  return map[scene] || 'warm';
}

/** 根据文件名猜测类别 */
function guessCategory(filename) {
  const name = filename.toLowerCase();
  if (/morning|早安|早/.test(name)) return 'morning';
  if (/night|晚安|晚/.test(name)) return 'night';
  if (/happy|开心|哈哈|joy|celebrate|🎉/.test(name)) return 'happy';
  if (/comfort|hug|安慰|抱抱|cry|🥺/.test(name)) return 'comfort';
  if (/tease|funny|哈哈哈|😂|笑/.test(name)) return 'tease';
  if (/encourage|加油|comeon|💪|努力/.test(name)) return 'encourage';
  if (/warm|warmth|🌸|爱|love/.test(name)) return 'warm';
  return 'fun';
}

export const stickerManager = new StickerManager();
export default StickerManager;
