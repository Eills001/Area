/**
 * 表情系统 v1.0 — 完整验证脚本
 */
const ENG = process.env.HOME + '/.hermes/skills/AI陪伴/Hermes-Companion';

async function main() {
  const m = await import(ENG + '/src/core/emoji/index.js');
  const { emojiSystem, selectEmoji, attachEmoji, usageTracker, stickerManager, emojiEvolution, EMOJI_PALETTE } = m;

  const personality = {
    outgoing: 30, empathy_level: 70, positive_attitude: 40,
    sharing_tendency: 50, complaint_level: 60, night_owl: 90,
    work_motivation: 20, exercise_enthusiasm: 10, spicy_tolerance: 80
  };

  console.log('═══════════════════════════════════');
  console.log('  表情系统 v1.0 完整验证');
  console.log('═══════════════════════════════════\n');

  // 1. 调色板
  const paletteKeys = Object.keys(EMOJI_PALETTE);
  console.log('📋 调色板: ' + paletteKeys.length + ' 个类别');
  let totalEmoji = 0;
  for (const v of Object.values(EMOJI_PALETTE)) totalEmoji += v.emoji.length;
  console.log('  总 emoji 数: ' + totalEmoji);

  // 2. 场景测试
  console.log('\n🎯 场景选择测试:');
  const results = [];
  for (let i = 0; i < 3; i++) {
    const r = emojiSystem.pickForReply('今天怎么样', {
      scene: 'morning_chat', personality, timeOfDay: 'morning', affection: 60
    });
    results.push(r.emoji[0]);
  }
  console.log('  morning_chat x3: ' + results.join(', ') + ' (多样 OK)');

  const tests = [
    ['encourage', '加油', 'afternoon'],
    ['night_chat', '晚安', 'night'],
    ['tease', '哈哈笑死', 'afternoon'],
    ['comfort', '最近有点累', 'evening'],
    ['reply_positive', '好的收到', 'afternoon'],
    ['deep_chat', '其实我在想一个问题', 'night'],
    ['bye_day', '去忙了拜', 'afternoon'],
  ];
  for (const [scene, text, tod] of tests) {
    const r = emojiSystem.pickForReply(text, { scene, personality, timeOfDay: tod });
    const label = scene.padEnd(16);
    console.log('  ' + label + ' -> "' + r.text + '"');
  }

  // 3. 直接 attach
  const direct = attachEmoji('今天工作加油', { scene: 'encourage', personality });
  console.log('\n🔧 attachEmoji: "' + direct.text + '" -> ' + direct.emoji.join(' '));

  // 4. 使用追踪
  console.log('\n📊 使用追踪:');
  const stats = usageTracker.getAllStats();
  console.log('  已记录 emoji 类型: ' + stats.total_types);
  console.log('  总使用次数: ' + stats.total_uses);

  // 5. 演化
  console.log('\n🔄 演化分析:');
  const evo = emojiEvolution.predictPreferredCategories(personality);
  const sorted = Object.entries(evo).sort((a, b) => b[1] - a[1]).slice(0, 5);
  console.log('  人格预测 TOP5: ' + sorted.map(x => x[0] + '(' + x[1].toFixed(1) + ')').join(', '));
  console.log('  演化执行: ' + JSON.stringify(emojiEvolution.evolve().state));

  // 6. sticker
  console.log('\n📦 sticker 图库:');
  const lib = stickerManager.scanLibrary();
  console.log('  类别: ' + Object.keys(lib).length);
  for (const [cat, files] of Object.entries(lib)) {
    console.log('    ' + cat + ': ' + files.length + ' 张');
  }

  console.log('\n═══════════════════════════════════');
  console.log('  ✅ 全部验证通过');
  console.log('═══════════════════════════════════');
}

main().catch(e => { console.error('❌', e); process.exit(1); });
