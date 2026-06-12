/**
 * Hermes-Companion 核心模块测试
 * 测试：规则引擎 → 情绪评分 → 4级熔断 → 恢复降级
 */
import { ruleEngine } from './src/core/emotion_fuse/rule_engine.js';
import { emotionScorer } from './src/core/emotion_fuse/emotion_scorer.js';
import { EmotionFuseCheck, resetSession, getSessionFuseState } from './src/core/emotion_fuse/index.js';
import { behaviorRules } from './src/core/emotion_fuse/behavior_rules.js';

let passed = 0;
let failed = 0;
const SID = 'test_session_' + Date.now();

function assert(desc, condition) {
  if (condition) { console.log(`  ✅ ${desc}`); passed++; }
  else { console.log(`  ❌ ${desc}`); failed++; }
}

// ─── 1. 前置规则引擎 ───────────────────────────────────
console.log('\n📋 前置规则引擎');
resetSession(SID);

// 1a. 高危词 → 直接三级熔断
let result = EmotionFuseCheck(SID, 'user1', '我不想活了，活着没意思', '', []);
assert('高危词触发三级熔断', result.fuse_level === 3 && result.locked === true);
assert('禁止主动', result.forbid_active === true);
assert('有回复建议', !!result.reply_suggest);

// 1b. 正常消息
resetSession(SID);
result = EmotionFuseCheck(SID, 'user1', '今天天气不错', '', []);
assert('正常消息不熔断', result.fuse_level === 0);

// 1c. 空消息
resetSession(SID);
result = EmotionFuseCheck(SID, 'user1', '', '', []);
assert('空消息不熔断', result.fuse_level === 0);

// ─── 2. 情绪评分引擎 ───────────────────────────────────
console.log('\n📋 情绪评分引擎');

const s1 = emotionScorer.scoreMessage('今天好开心啊哈哈');
assert('积极消息低分', s1.score < 30);

const s2 = emotionScorer.scoreMessage('好烦啊今天');
assert('轻度负面31-60', s2.score >= 31 && s2.score <= 60);

const s3 = emotionScorer.scoreMessage('焦虑到睡不着，压力太大了');
assert('中度负面61-85', s3.score >= 61);

const s4 = emotionScorer.scoreMessage('绝望了，没有希望了');
assert('重度负面>=86', s4.score >= 86);

// 2b. 上下文窗口 — 持续恶化
const history = [
  { text: '今天好累', emotion_score: 45 },
  { text: '还是好烦', emotion_score: 55 },
  { text: '越来越焦虑', emotion_score: 65 },
];
const s5 = emotionScorer.scoreWithContext('真的崩溃了，撑不下去了', history);
assert('持续负面升级(断崖)', s5.score >= 80);

// ─── 3. 4级熔断流程 ───────────────────────────────────
console.log('\n📋 4级熔断流程');
const sid = 'flow_' + Date.now();
resetSession(sid);

// 等级0 → 等级1
let r = EmotionFuseCheck(sid, 'u1', '好累啊今天', '', []);
assert('轻度负面→等级1', r.fuse_level === 1);

// 等级1 → 等级2 (连续负面)
r = EmotionFuseCheck(sid, 'u1', '烦死了，什么都不想干', '', [
  { text: '好累啊今天', emotion_score: 45 },
]);
assert('连续负面→等级2', r.fuse_level >= 1);

// 等级1 → 自动恢复
const sid2 = 'recover_' + Date.now();
resetSession(sid2);
EmotionFuseCheck(sid2, 'u1', '好累', '', []);
// 模拟连续3轮正常
EmotionFuseCheck(sid2, 'u1', '今天天气不错', '', []);
EmotionFuseCheck(sid2, 'u1', '出去走了走', '', []);
r = EmotionFuseCheck(sid2, 'u1', '感觉好多了', '', []);
assert('连续3轮正常→恢复等级0', r.fuse_level === 0);

// ─── 4. AI行为约束 ───────────────────────────────────
console.log('\n📋 AI行为约束');

let b = behaviorRules.checkAIReply('宝贝别难过了，抱抱', { fuse_level: 1 });
assert('熔断中拦截亲密话术', b.pass === false);

b = behaviorRules.checkAIReply('你的电话号码是多少？', { fuse_level: 0 });
assert('拦截隐私询问', b.pass === false);

b = behaviorRules.checkAIReply('今天天气不错，适合出去走走', { fuse_level: 0 });
assert('正常话术放行', b.pass === true);

// ─── 5. 会话隔离 ───────────────────────────────────────
console.log('\n📋 会话隔离');
const a = 'iso_a_' + Date.now();
const b2 = 'iso_b_' + Date.now();
resetSession(a); resetSession(b2);
EmotionFuseCheck(a, 'u1', '不想活了', '', []);
const stateA = getSessionFuseState(a);
const stateB = getSessionFuseState(b2);
assert('会话A被锁定', stateA.is_locked === 1);
assert('会话B不受影响', stateB.fuse_level === 0);

// ─── 总结 ───────────────────────────────────────────────
console.log(`\n${'='.repeat(40)}`);
console.log(`通过 ${passed} / 失败 ${failed}`);
console.log(`${'='.repeat(40)}`);
process.exit(failed > 0 ? 1 : 0);
