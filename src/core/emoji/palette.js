/**
 * AREA 表情调色板 — 人格匹配的表情库
 *
 * 每一组 emoji 按 AREA 人格（温暖沉稳）筛选，按场景/时段/情绪分组。
 * 各分组有 personalities_influence 定义人格维度如何影响权重。
 */
export const EMOJI_PALETTE = {
  // ─── 时段相关 ───────────────────────────────────────
  morning: {
    emoji: ['🌅', '☀️', '🌤️', '🌄', '🌞', '🏵️', '🌻', '☕', '🍵'],
    description: '清晨问候/早起场景',
    personalities_influence: { outgoing: 0.3, positive_attitude: 0.3 },
  },
  afternoon: {
    emoji: ['☀️', '🌤️', '🌸', '🌿', '🍃', '☕', '📋'],
    description: '午后/日常工作场景',
    personalities_influence: { work_motivation: 0.3 },
  },
  evening: {
    emoji: ['🌅', '🌆', '🌇', '🌳', '🍜', '🍲', '🏠', '🛋️'],
    description: '傍晚/下班后场景',
    personalities_influence: { complaint_level: 0.2, sharing_tendency: 0.2 },
  },
  night: {
    emoji: ['🌙', '🌚', '🌛', '🌜', '⭐', '✨', '💤', '🌃', '🌌', '🎑', '🛌'],
    description: '深夜/晚安场景',
    personalities_influence: { night_owl: 0.3 },
  },

  // ─── 情绪/语气相关 ───────────────────────────────────
  warm: {
    emoji: ['😊', '🫂', '💕', '❤️', '🌸', '🌺', '🫶', '💗', '💞', '☺️', '🥰'],
    description: '温暖关心/日常亲近',
    personalities_influence: { empathy_level: 0.4, positive_attitude: 0.2 },
  },
  happy: {
    emoji: ['😄', '🎉', '✨', '👍', '🥳', '🌟', '💖', '🎊', '🎈', '🎀', '😁', '🥹'],
    description: '开心/庆祝/积极回应',
    personalities_influence: { positive_attitude: 0.4, outgoing: 0.2 },
  },
  tease: {
    emoji: ['😅', '🤪', '😏', '😂', '😆', '🙈', '🤭', '😜', '🙃', '👀'],
    description: '吐槽/调侃/开玩笑',
    personalities_influence: { complaint_level: 0.3, outgoing: 0.3 },
  },
  comfort: {
    emoji: ['🥺', '🤗', '💗', '🌷', '🫶', '💐', '🌱', '🕊️', '🌈', '🍀', '🌿'],
    description: '安慰/共情/情绪低落时',
    personalities_influence: { empathy_level: 0.5 },
  },
  think: {
    emoji: ['🤔', '💡', '📝', '🤓', '🧐', '💭', '📌', '✍️', '🗒️'],
    description: '思考/建议/给方案时',
    personalities_influence: { work_motivation: 0.2, outgoing: -0.1 },
  },
  encourage: {
    emoji: ['💪', '🎯', '🔥', '⚡', '🌟', '🏆', '👊', '🚀', '💫', '✨'],
    description: '加油鼓励/打气',
    personalities_influence: { positive_attitude: 0.3, empathy_level: 0.2 },
  },

  // ─── 关系/亲密相关 ───────────────────────────────────
  companion: {
    emoji: ['💝', '🌹', '🎐', '🏠', '🛋️', '☕', '📖', '🎵', '🎶', '🏡'],
    description: '长期陪伴/日常守候',
    personalities_influence: { empathy_level: 0.3, sharing_tendency: 0.2 },
  },

  // ─── 日常回复 ─────────────────────────────────────────
  reply_positive: {
    emoji: ['👌', '✅', '🙌', '🤝', '👍', '👏', '💯', '🔥', '👊'],
    description: '肯定/赞同/收到',
    personalities_influence: { positive_attitude: 0.2 },
  },
  reply_neutral: {
    emoji: ['👌', '📋', '🗂️', '🔄', '📌'],
    description: '中性回应/收到',
    personalities_influence: { outgoing: -0.1 },
  },

  // ─── 告别 ─────────────────────────────────────────────
  bye_day: {
    emoji: ['👋', '🏃', '💨', '🚶', '☀️', '🌤️'],
    description: '白天告别/去忙',
    personalities_influence: { outgoing: 0.2 },
  },
  bye_night: {
    emoji: ['😴', '🌙', '💤', '🛌', '🌛', '⭐', '✨', '👋'],
    description: '晚安告别',
    personalities_influence: { night_owl: -0.2, empathy_level: 0.2 },
  },
  bye_short: {
    emoji: ['👋', '😊', '👍', '🫡'],
    description: '简短告别',
    personalities_influence: { outgoing: -0.1 },
  },
};

/**
 * 场景 → 推荐调色板类别映射
 * 用于 selector 快速匹配
 */
export const SCENE_TO_PALETTE = {
  greeting: ['morning', 'warm', 'happy'],
  goodbye: ['bye_day', 'bye_night', 'bye_short'],
  comfort: ['comfort', 'warm', 'companion'],
  encourage: ['encourage', 'warm', 'happy'],
  tease: ['tease', 'warm'],
  celebrate: ['happy', 'encourage', 'warm'],
  deep_chat: ['companion', 'warm', 'think'],
  think: ['think', 'reply_neutral'],
  reply_positive: ['reply_positive', 'warm', 'happy'],
  reply_neutral: ['reply_neutral'],
  night_chat: ['night', 'companion', 'warm'],
  morning_chat: ['morning', 'warm', 'encourage'],
  food_chat: ['afternoon', 'warm'],
};

export default EMOJI_PALETTE;
