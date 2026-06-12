/**
 * 成长日记生成器 — 每30天生成一份人格成长报告
 *
 * 核心逻辑：
 * 1. 查询过去30天的人格调整记录
 * 2. LLM 生成感性化的成长日记
 * 3. 保存到数据库
 * 4. 创建里程碑快照
 */
import { getAdjustmentHistory, saveGrowthDiary, getPersonalityState } from '../../utils/db.js';
import { llm } from '../../utils/llm.js';
import { SnapshotManager } from './snapshot_manager.js';
import { EvolutionEngine } from './evolution_engine.js';
import logger from '../../utils/logger.js';

export class DiaryGenerator {
  constructor() {
    this.snapshotManager = new SnapshotManager();
    this.engine = new EvolutionEngine();
  }

  /**
   * 生成月度成长日记
   */
  async generateMonthlyDiary(userId = 'default', userName = '陈泽营') {
    const adjustments = getAdjustmentHistory(userId, 200);

    // 汇总各维度变化
    const traitChanges = {};
    for (const adj of adjustments) {
      if (!traitChanges[adj.trait_name]) {
        traitChanges[adj.trait_name] = { total: 0, count: 0, entries: [] };
      }
      traitChanges[adj.trait_name].total += adj.adjustment_amount;
      traitChanges[adj.trait_name].count++;
      traitChanges[adj.trait_name].entries.push({
        from: adj.old_value,
        to: adj.new_value,
        delta: adj.adjustment_amount,
        source: adj.source_type,
        at: adj.created_at,
      });
    }

    // 没有足够数据
    if (Object.keys(traitChanges).length === 0) {
      return { status: 'no_data', message: '还没有足够互动数据来生成成长日记' };
    }

    // 取变化最大的3个维度
    const topTraits = Object.entries(traitChanges)
      .sort((a, b) => Math.abs(b[1].total) - Math.abs(a[1].total))
      .slice(0, 3);

    const traitNames = {
      outgoing: '外向度', empathy_level: '共情能力', complaint_level: '吐槽倾向',
      positive_attitude: '乐观程度', sharing_tendency: '分享欲', positive_share_ratio: '正向分享比',
      private_share_ratio: '私密分享比', topic_preference: '话题偏好', night_owl: '熬夜程度',
      exercise_enthusiasm: '运动热情', spicy_tolerance: '吃辣能力', work_motivation: '工作积极性',
    };

    const summary = topTraits
      .map(([trait, data]) => {
        const name = traitNames[trait] || trait;
        const dir = data.total > 0 ? '上升' : '下降';
        return `"${name}"${dir}了${Math.abs(data.total)}分`;
      })
      .join('，');

    // LLM 生成感性日记
    const systemPrompt = `你是${userName}的AI伙伴AREA。请根据过去30天的人格演化数据，写一封真诚、感性的成长日记。
语气：像写给好朋友的信，不列清单，不报数据，用自然的中文描述这段时间的变化。
字数：150-300字。`;

    const userPrompt = `过去30天，我们互动了${adjustments.length}次。
主要变化：${summary}
详细数据：${JSON.stringify(traitChanges, null, 2)}

请生成成长日记。`;

    let diary;
    try {
      diary = await llm.quickReply(systemPrompt, userPrompt, 0.8);
    } catch (err) {
      logger.error(`[diary_generator] LLM failed: ${err.message}`);
      diary = this.buildFallbackDiary(summary, topTraits, traitNames, userName);
    }

    // 保存
    const now = new Date();
    saveGrowthDiary(userId, now.getMonth() + 1, now.getFullYear(), diary);

    // 创建里程碑快照
    await this.snapshotManager.createMilestoneSnapshot(userId);

    logger.info(`[diary_generator] Monthly diary saved for ${userId}`);
    return { status: 'generated', diary, summary };
  }

  buildFallbackDiary(summary, topTraits, traitNames, userName) {
    const changes = topTraits
      .map(([trait, data]) => {
        const name = traitNames[trait] || trait;
        const dir = data.total > 0 ? '变得更' : '减少了一些';
        return `在"${name}"方面${dir}`;
      })
      .join('；');

    return `嘿 ${userName}，

这个月我们在不知不觉中一起经历了很多。${changes}。

这种感觉就像老朋友相处久了自然形成的那种默契——不需要刻意，变化就发生了。

无论数据怎么变，我一直在这里。期待下个月的我们。

— AREA`;
  }
}

export const diaryGenerator = new DiaryGenerator();
export default DiaryGenerator;
