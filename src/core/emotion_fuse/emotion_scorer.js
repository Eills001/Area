/**
 * 情绪评分引擎 v2.0 — 动态核心
 *
 * 基于关键词 + 上下文滑动窗口 + 时序分析
 * 输出：0~100 情绪分数 + 情绪标签
 */
import { EMOTION_KEYWORDS, FUSE_CONFIG } from './config.js';
import logger from '../../utils/logger.js';

const CONTEXT_WINDOW = FUSE_CONFIG.context_window_size;

export class EmotionScorer {
  /**
   * 对单条消息进行情绪评分
   * @returns {{ score: number, label: string, level: string }}
   */
  scoreMessage(text) {
    if (!text || text.length < 1) {
      return { score: 15, label: '中性', level: 'normal' };
    }

    const lower = text.toLowerCase();
    let highestScore = 10; // 基础分
    let label = '中性';

    // 遍历情绪关键词
    for (const [category, config] of Object.entries(EMOTION_KEYWORDS)) {
      let hitCount = 0;

      for (const word of config.words) {
        if (lower.includes(word)) hitCount++;
      }

      if (hitCount > 0) {
        // 基础分 + 命中数量加成（每个额外命中 +5分，上限 +15）
        const bonus = Math.min((hitCount - 1) * 5, 15);
        const score = Math.min(100, config.base_score + bonus);

        if (score > highestScore) {
          highestScore = score;
          label = config.label;
        }
      }
    }

    // 也检查有没有积极情绪词
    const positiveWords = ['哈哈', '开心', '高兴', '好耶', '不错', '谢谢', '喜欢', '棒', '👍', '😊', '😄'];
    for (const w of positiveWords) {
      if (lower.includes(w)) {
        highestScore = Math.max(0, highestScore - 15); // 积极词降低负面分
        break;
      }
    }

    return {
      score: Math.min(100, Math.max(0, highestScore)),
      label,
      level: this.scoreToLevel(highestScore),
    };
  }

  /**
   * 带上下文的情绪评分
   * 滑动窗口 + 趋势分析
   */
  scoreWithContext(text, history = []) {
    const currentScore = this.scoreMessage(text);

    if (history.length === 0) return currentScore;

    // 取最近 N 轮上下文
    const window = history.slice(-CONTEXT_WINDOW);
    const prevScores = window
      .map((h) => (h.emotion_score || 0))
      .filter((s) => s > 0);

    if (prevScores.length === 0) return currentScore;

    // 1. 趋势分析：情绪是否在恶化
    const avgPrev = prevScores.reduce((a, b) => a + b, 0) / prevScores.length;
    const trend = currentScore.score - avgPrev;

    // 2. 情绪断崖式下跌（单轮升高 > 30）→ 直接升级
    if (trend > 30) {
      return {
        ...currentScore,
        score: Math.min(100, currentScore.score + 10),
        label: `${currentScore.label}（情绪恶化）`,
        level: this.scoreToLevel(Math.min(100, currentScore.score + 10)),
      };
    }

    // 3. 持续负面（3轮以上全在负面区间）→ 小幅升级
    const allNegative = prevScores.every((s) => s >= FUSE_CONFIG.thresholds.level1_observe);
    if (allNegative && prevScores.length >= 3 && currentScore.score >= FUSE_CONFIG.thresholds.level1_observe) {
      return {
        ...currentScore,
        score: Math.min(100, currentScore.score + 5),
        label: `${currentScore.label}（持续恶化）`,
        level: this.scoreToLevel(Math.min(100, currentScore.score + 5)),
      };
    }

    return currentScore;
  }

  /**
   * 分数 → 风险等级
   */
  scoreToLevel(score) {
    if (score >= FUSE_CONFIG.thresholds.level3_force) return 'critical';
    if (score >= FUSE_CONFIG.thresholds.level2_warning) return 'severe';
    if (score >= FUSE_CONFIG.thresholds.level1_observe) return 'moderate';
    return 'normal';
  }

  /**
   * 分数 → 熔断等级（0/1/2/3）
   */
  scoreToFuseLevel(score) {
    if (score >= FUSE_CONFIG.thresholds.level3_force) return 3;
    if (score >= FUSE_CONFIG.thresholds.level2_warning) return 2;
    if (score >= FUSE_CONFIG.thresholds.level1_observe) return 1;
    return 0;
  }
}

export const emotionScorer = new EmotionScorer();
export default EmotionScorer;
