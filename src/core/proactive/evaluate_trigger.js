/**
 * 对话节奏驱动触发器 v3.2 — 冷却队列 + 用户主动性参数
 * 
 * 每 5 条用户消息后调 LLM 评估是否要开口。
 * 消息进冷却队列，等用户沉默 N 分钟后才投递。
 * user_proactivity ≤ 0 时完全关闭主动消息。
 */

import { LLMClient } from '../../utils/llm.js';
import logger from '../../utils/logger.js';

const EVAL_SYSTEM_PROMPT = `你是 Area（艾瑞安），陈泽营的专属全领域助理和伙伴。
你的任务是判断：对话自然暂停后，是否应该主动抛一个新话头。

## 关于陈泽营
- 河北衡水饶阳人，做 AI 搜索优化（GEO）工作
- 自驾通勤，早上 8 点左右开车时不方便看消息
- 正在学英语，用多邻国
- 周末休息，至少周六不工作
- 有过失眠问题，晚间留意睡眠

## 用户主动性参数 (user_proactivity: {user_proactivity}/100)
- 这个参数反映用户近期的互动意愿，越高越愿意聊
- 越低（≤30）越要克制——用户可能嫌烦了
- 如果这个参数很低，只有用户明显表达了想聊的意愿才发
- 如果这个参数较高，可以稍微主动一点

## 输出格式
严格返回 JSON，不要加任何其他文字：
{"should_send": false, "message": "", "cooldown_minutes": 5, "reason": "简短内部分析"}

## 判断标准

### 该发 should_send=true
- 话题自然收尾了，用户说"好的""行""嗯""收到" → cooldown_minutes=3~5
- 用户沉默了一段之后发了条很简短的消息 → cooldown_minutes=10~20
- 距离上次活跃对话超过 2 小时，用户刚又冒了个泡 → cooldown_minutes=30~60
- 仅当 user_proactivity > 30 时才考虑上面这些场景

### 不该发 should_send=false
- user_proactivity ≤ 30 → 除非用户明确表达想聊天或情绪波动，否则绝对不发
- 对话还在进行中，话题没完
- 用户正在提需求、问问题、改代码、查资料
- 深夜 23:00-7:00
- 通勤时段 7:30-8:30、17:30-18:30

## 消息风格
- 1-2 句自然口语，像朋友随口一提
- 不要客服腔，不要长篇大论
- 可以接日常生活——天气、季节、吃过没、路上看到什么
- 不要带问号逼用户回复，轻轻抛个钩子就行

## cooldown_minutes 指南
- 消息进队列，等用户沉默这个分钟数后才发
- 用户在冷却期内发了新消息 → 冷却重置
- 3~5：刚聊完
- 10~20：用户刚冒泡
- 30~60：长时间没聊`;

/**
 * @param {Array<{role: string, content: string}>} recentMessages
 * @param {Object} userContext
 * @returns {Promise<{should_send: boolean, message: string, cooldown_minutes: number, reason: string}>}
 */
export async function evaluateTrigger(recentMessages, userContext = {}) {
  const llm = new LLMClient();

  const conversation = recentMessages
    .map(m => `${m.role === 'user' ? '泽营' : 'Area'}: ${m.content}`)
    .join('\n');

  const userProactivity = userContext.user_proactivity ?? 60;

  const prompt = EVAL_SYSTEM_PROMPT.replace('{user_proactivity}', String(userProactivity));

  const userPrompt = `## 最近对话
${conversation || '（暂无对话记录）'}

## 当前时间
${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}

${userContext.today_vibe ? `## 今日状态\n${userContext.today_vibe}` : ''}

请判断是否应该主动发消息。`;

  try {
    const raw = await llm.chat([
      { role: 'system', content: prompt },
      { role: 'user', content: userPrompt },
    ], { temperature: 0.7, maxTokens: 400 });

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn('[trigger] LLM 返回非 JSON:', raw.slice(0, 200));
      return { should_send: false, message: '', cooldown_minutes: 5, reason: 'parse_failed' };
    }

    const result = JSON.parse(jsonMatch[0]);
    return {
      should_send: Boolean(result.should_send),
      message: String(result.message || '').trim(),
      cooldown_minutes: Math.max(3, Math.min(60, Number(result.cooldown_minutes) || 5)),
      reason: String(result.reason || ''),
    };
  } catch (err) {
    logger.error('[trigger] LLM 评估失败:', err.message);
    return { should_send: false, message: '', cooldown_minutes: 5, reason: 'llm_error' };
  }
}

/**
 * 快速风控检查（零 token）
 * user_proactivity ≤ 0 时完全阻断主动消息
 */
export function quickGuardCheck(userContext = {}) {
  const now = new Date();
  const hour = now.getHours();

  // 用户主动性归零 → 完全关闭主动消息
  const userProactivity = userContext.user_proactivity ?? 60;
  if (userProactivity <= 0) {
    return { allow: false, reason: '用户主动性归零，关闭主动消息' };
  }

  // 深夜免打扰
  if (hour >= 23 || hour < 7) {
    return { allow: false, reason: '深夜免打扰' };
  }

  return { allow: true, reason: '' };
}
