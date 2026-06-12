/**
 * Emoji 选择器 — 上下文分析 → 推荐最佳 emoji
 *
 * 输入：时间、场景类型、人格状态、用户消息 → 输出最合适的 1~2 个 emoji
 *
 * 选择策略：
 *   1. 按 SCENE_TO_PALETTE 匹配调色板类别
 *   2. 各调色板内按人格维度加权排序
 *   3. 优先选近期未用过的（多样性）
 *   4. 避开用户明确不喜欢的（负面记忆）
 */
import EMOJI_PALETTE, { SCENE_TO_PALETTE } from './palette.js';

/**
 * 根据上下文推荐 emoji
 *
 * @param {object} context
 * @param {string} context.scene - 场景（greeting/goodbye/comfort/encourage/tease/celebrate/deep_chat/think/reply_positive/reply_neutral/night_chat/morning_chat）
 * @param {object} context.personality - 人格状态 { outgoing, empathy_level, ... }
 * @param {string} context.timeOfDay - morning/afternoon/evening/night
 * @param {object} [context.userLastMessage] - 用户上一条消息（用于内容匹配）
 * @param {string} [context.avoidEmoji] - 要避开的 emoji（上次刚用过的）
 * @param {number} [context.count=1] - 返回几个 emoji
 * @param {number} [context.affection=50] - 好感度（影响亲密 emoji 权重）
 * @returns {{ emoji: string[], category: string, reason: string }}
 */
export function selectEmoji(context) {
  const {
    scene = 'reply_neutral',
    personality = {},
    timeOfDay = 'afternoon',
    userLastMessage = null,
    avoidEmoji = null,
    count = 1,
    affection = 50,
  } = context;

  // 1. 获取该场景对应的调色板类别
  const paletteKeys = SCENE_TO_PALETTE[scene] || SCENE_TO_PALETTE.reply_neutral;

  // 2. 收集候选 emoji（带权重）
  const candidates = [];
  const seen = new Set();

  for (const key of paletteKeys) {
    const group = EMOJI_PALETTE[key];
    if (!group) continue;

    // 计算这组调色板的人格匹配权重
    let weight = 1.0;
    const influences = group.personalities_influence || {};
    for (const [trait, influence] of Object.entries(influences)) {
      const val = personality[trait] ?? 50;
      // 标准化到 -1 ~ 1 范围
      const stdVal = (val - 50) / 50;
      weight += stdVal * influence;
    }

    // 好感度影响：高好感 → 亲密 emoji 权重提升
    if (['warm', 'companion', 'happy'].includes(key)) {
      weight *= (0.5 + (affection / 100) * 1.0);
    }

    // 低好感 → tease/避远
    if (key === 'tease' && affection < 40) {
      weight *= 0.3;
    }

    // 时段匹配加成
    if (key === 'morning' && timeOfDay === 'morning') weight *= 1.5;
    if (key === 'night' && timeOfDay === 'night') weight *= 1.5;
    if (['afternoon', 'evening'].includes(key) && ['afternoon', 'evening'].includes(timeOfDay)) {
      weight *= 1.3;
    }

    weight = Math.max(0.1, weight);

    // 加入候选
    for (const emoji of group.emoji) {
      if (!seen.has(emoji)) {
        seen.add(emoji);
        candidates.push({ emoji, weight, group: key });
      }
    }
  }

  // 3. 如果用户消息包含某些 emoji，倾斜选择同类别
  if (userLastMessage) {
    const userEmojis = extractEmoji(userLastMessage);
    if (userEmojis.length > 0) {
      // 用户用了 emoji → 倾向选同场景的
      for (const c of candidates) {
        if (['warm', 'happy', 'reply_positive'].includes(c.group)) {
          c.weight *= 1.2; // 偏向暖色回应
        }
      }
    }
  }

  // 4. 避开上次用过的
  if (avoidEmoji) {
    for (const c of candidates) {
      if (c.emoji === avoidEmoji) {
        c.weight *= 0.1;
      }
    }
  }

  // 5. 按权重排序 + 随机扰动取前 count 个
  // 加随机扰动避免每次同场景选同一个 emoji
  for (const c of candidates) {
    c.weight *= (0.85 + Math.random() * 0.3); // ±15% 随机扰动
  }
  candidates.sort((a, b) => b.weight - a.weight);
  const top = candidates.slice(0, Math.max(count, candidates.length));

  // 确保多样性：如果 count > 1 且结果来自同一组，尝试混搭不同组
  const result = [];
  const usedGroups = new Set();
  for (const c of top) {
    if (result.length >= count) break;
    result.push(c.emoji);
    usedGroups.add(c.group);
  }

  // 如果 count 不够且还有候选，再补
  if (result.length < count) {
    for (const c of candidates) {
      if (!result.includes(c.emoji)) {
        result.push(c.emoji);
        if (result.length >= count) break;
      }
    }
  }

  const reason = result.length > 0
    ? `scene=${scene}, time=${timeOfDay}, affection=${affection}, picked from [${[...usedGroups].join(', ')}]`
    : 'no emoji matched';

  return {
    emoji: result,
    category: [...usedGroups].join(','),
    reason,
  };
}

/**
 * 为指定文本附加 emoji → 返回追加后的文本
 *
 * @param {string} text - 原始文本
 * @param {object} context - 同 selectEmoji 的 context
 * @param {'suffix'|'prefix'|'smart'} [position='smart']
 *   suffix: 追加到末尾
 *   prefix: 加到开头
 *   smart: 如果是问候（短文本）放末尾，如果是长文本根据内容判断
 * @returns {{ text: string, emoji: string[], category: string }}
 */
export function attachEmoji(text, context, position = 'smart') {
  const result = selectEmoji(context);
  if (result.emoji.length === 0) return { text, emoji: [], category: '' };

  const emojiStr = result.emoji.join(' ');

  let finalText = text;
  if (position === 'prefix') {
    finalText = `${emojiStr} ${text}`;
  } else if (position === 'suffix') {
    finalText = `${text} ${emojiStr}`;
  } else {
    // smart: 问候/短文本 → suffix；长文本 → 根据末尾标点决定
    if (text.length < 15) {
      finalText = `${text} ${emojiStr}`;
    } else if (/[。！？.!?]$/.test(text.trim())) {
      finalText = `${text} ${emojiStr}`;
    } else {
      finalText = `${text} ${emojiStr}`;
    }
  }

  return { text: finalText, emoji: result.emoji, category: result.category };
}

/**
 * 从文本中提取 emoji
 */
function extractEmoji(text) {
  if (!text) return [];
  const matches = text.match(/\p{Extended_Pictographic}/gu);
  return matches || [];
}

export { EMOJI_PALETTE, SCENE_TO_PALETTE } from './palette.js';
export default { selectEmoji, attachEmoji };
