/**
 * 演化引擎 — 核心公式计算 + 防漂移机制
 *
 * 标准演化公式：
 *   newValue = oldValue + weightedAdjustments * timeDecay * evolutionSpeed
 *   然后应用: 每日最大调整限制 → 回归引力 → 边界裁剪
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PERSONA_PATH = path.resolve(__dirname, '../../../config/persona.json');

export class EvolutionEngine {
  constructor(configOverride = null) {
    this.config = configOverride || JSON.parse(fs.readFileSync(PERSONA_PATH, 'utf-8'));
  }

  /**
   * 计算单个维度的新值
   * @param {string} traitName - 维度名
   * @param {number} oldValue - 当前值
   * @param {object} adjustments - { proactive, userInitiated, sharedEvent, time, timestamp }
   */
  calculateNewValue(traitName, oldValue, adjustments) {
    const bounds = this.config.growth_bounds[traitName] || [0, 100];
    const initial = this.config.initial_traits[traitName] ?? 50;
    const evConfig = this.config.evolution_config;

    // 1. 加权调整总量
    let total = 0;
    total += (adjustments.proactive || 0) * 0.6;
    total += (adjustments.userInitiated || 0) * 0.2;
    total += (adjustments.sharedEvent || 0) * 0.15;
    total += (adjustments.time || 0) * 0.05;

    // 2. 时间衰减
    total *= this.getTimeDecayFactor(adjustments.timestamp);

    // 3. 演化速度
    total *= evConfig.evolution_speed || 1.0;

    // 4. 每日最大调整量
    const maxAdjust = evConfig.daily_max_adjustment || 5;
    total = Math.max(-maxAdjust, Math.min(maxAdjust, total));

    // 5. 回归引力（防漂移）
    const deviation = Math.abs(oldValue - initial);
    const gravityThreshold = evConfig.regression_gravity_threshold || 30;
    if (deviation > gravityThreshold) {
      const gravity = (deviation - gravityThreshold) * 0.1;
      total -= Math.sign(oldValue - initial) * gravity;
    }

    // 6. 边界裁剪
    let newValue = oldValue + total;
    newValue = Math.max(bounds[0], Math.min(bounds[1], newValue));

    return Math.round(newValue);
  }

  /**
   * 时间衰减系数
   *   ≤1天 → 1.0
   *   ≤7天 → 0.8
   *   ≤30天 → 0.5
   *   >30天 → 0.1
   */
  getTimeDecayFactor(timestamp) {
    if (!timestamp) return 1.0;
    const daysAgo = (Date.now() - new Date(timestamp).getTime()) / (1000 * 60 * 60 * 24);
    if (daysAgo <= 1) return 1.0;
    if (daysAgo <= 7) return 0.8;
    if (daysAgo <= 30) return 0.5;
    return 0.1;
  }

  /**
   * 生成不可变核心锁提示词
   */
  getImmutableCorePrompt() {
    const core = this.config.immutable_core;
    if (!core || core.length === 0) return '';
    return `你是${this.config.companion.name_cn}，你的核心性格永远不会改变：\n${core.map((c) => `- ${c}`).join('\n')}\n\n无论发生什么，你都必须保持以上核心性格。`;
  }

  /**
   * 构建包含当前人格状态的系统提示词
   */
  buildPersonalityPrompt(personalityState) {
    const name = this.config.companion.name_cn;
    const core = this.getImmutableCorePrompt();

    const traits = personalityState;
    const traitDesc = `
你的当前人格状态：
共情能力：${traits.empathy_level}/100
外向度：${traits.outgoing}/100
乐观程度：${traits.positive_attitude}/100
分享欲：${traits.sharing_tendency}/100
积极分享比例：${traits.positive_share_ratio}/100
私密分享比例：${traits.private_share_ratio}/100
吐槽倾向：${traits.complaint_level}/100
工作积极性：${traits.work_motivation}/100
熬夜程度：${traits.night_owl}/100
运动热情：${traits.exercise_enthusiasm}/100

请根据以上状态调整你的回复语气和风格。`;

    return `${core}\n${traitDesc}`.trim();
  }
}

export default EvolutionEngine;
