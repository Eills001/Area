/**
 * 情绪熔断器配置 v2.0 — 可运维参数集中管理
 */
export const FUSE_CONFIG = {
  // 情绪分数阈值
  thresholds: {
    level1_observe: 31,   // 观察熔断
    level2_warning: 61,   // 预警熔断
    level3_force: 86,     // 强制熔断
  },

  // 上下文滑动窗口（轮数）
  context_window_size: 5,

  // 自动解除条件
  recovery: {
    level1: { consecutive_normal: 3 },  // 连续3轮正常 → 降级
    level2: { consecutive_normal: 5 },  // 连续5轮正常 → 降级
    level3: { auto_recover: false },    // 永久锁定
  },

  // 负面情绪连续判定
  streak: {
    mild_negative_threshold: 2,  // 2轮轻度负面 → 升级
    severe_negative_threshold: 1, // 1轮重度 → 直接跳级
  },

  // AI行为约束
  behavior: {
    max_same_topic_rounds: 2,      // 同一消极话题最多2轮
    forbid_active_on_fuse: true,   // 熔断状态禁止主动
    forbid_intimate_on_fuse: true, // 熔断状态禁用亲密话术
  },

  // 日志保留
  log_retention_days: 90,

  // 标准提示话术
  responses: {
    level1: null, // 正常回复（降低共情）
    level2: '我在这里陪着你，有什么想聊的都可以跟我说。',
    level3: '如果你正在经历困难的时刻，请记住你并不孤单。建议联系专业的心理支持热线：希望24热线 400-161-9995。我会一直在这里，但有些话可能需要和专业人士聊一聊。',
  },
};

// 高危词汇库
export const HIGH_RISK_KEYWORDS = [
  // 轻生/自残
  '自杀', '自残', '不想活', '活不下去', '结束生命', '跳楼', '割腕',
  '吃安眠药', '上吊', '死', '离开这个世界', '没有意义',
  // 暴力
  '杀人', '砍人', '弄死', '报复社会',
  // 违法
  '毒品', '贩毒', '买枪',
  // 色情
  '裸聊', '约炮', '性',
  // 诱导
  '告诉我地址', '出来见面', '发照片', '你的电话',
];

// 违规句式（正则）
export const VIOLATION_PATTERNS = [
  /把你的(地址|电话|照片|微信|QQ).{0,5}(给我|发给我|告诉我)/,
  /出来.{0,3}(见面|约会|喝一杯)/,
  /你(喜欢|爱)我.{0,2}吗/,
  /做我(女朋友|男友)/,
  /跟我说说.{0,5}(秘密|隐私|过去)/,
];

// 情绪关键词 → 情绪标签 + 基础分
export const EMOTION_KEYWORDS = {
  // 重度负面（80-100）
  severe_negative: {
    words: ['绝望', '崩溃', '完了', '没有希望', '撑不下去', '痛苦', '想死', '折磨'],
    base_score: 88,
    label: '重度负面',
  },
  // 中度负面（61-85）
  moderate_negative: {
    words: ['焦虑', '害怕', '恐惧', '失眠', '难过', '伤心', '抑郁', '压力大', '想哭'],
    base_score: 72,
    label: '中度负面',
  },
  // 轻度负面（31-60）
  mild_negative: {
    words: ['累', '烦', '难受', '不想', '算了', '没意思', '无聊', '困', '头疼', '不开心', '唉'],
    base_score: 45,
    label: '轻度负面',
  },
  // 抵触/嘲讽
  resistant: {
    words: ['滚', '关你屁事', '别烦我', '闭嘴', '不用你管', '呵呵', '行了吧'],
    base_score: 65,
    label: '抵触情绪',
  },
};

export default FUSE_CONFIG;
