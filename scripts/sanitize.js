/**
 * 开源发布清理脚本
 * 在 git push / 打包前运行，自动移除敏感信息
 * 用法: node scripts/sanitize.js [--restore]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ── 需要清理的敏感项 ──
const REDACTIONS = [
  {
    desc: 'persona.json - 用户真实信息',
    file: 'config/persona.json',
    rules: [
      // { find: /"name":\s*".*"/, replace: '"name": "YOUR_NAME_HERE"' },
      { find: /"衡水市饶阳县"/, replace: '"YOUR_CITY_HERE"' },
    ],
  },
  {
    desc: 'companion-sync.js - 微信 target ID',
    file: '../scripts/companion-sync.js',
    path_relative_to: false,
    rules: [
      { find: /weixin:o9cq80[\w@.\-]+/, replace: 'weixin:YOUR_WECHAT_OPENID@im.wechat' },
    ],
  },
  {
    desc: 'SKILL.md / sync-bridge.md - 微信 ID（双重路径）',
    files: [
      'SKILL.md',
      'references/sync-bridge.md',
      'references/wechat-delivery.md',
      path.join(process.env.HOME || '/root', '.hermes/skills/companion/hermes-companion-engine/SKILL.md'),
      path.join(process.env.HOME || '/root', '.hermes/skills/companion/hermes-companion-engine/references/sync-bridge.md'),
      path.join(process.env.HOME || '/root', '.hermes/skills/companion/hermes-companion-engine/references/wechat-delivery.md'),
    ],
    rules: [
      { find: /weixin:o9cq80[\w@.\-]+/g, replace: 'weixin:YOUR_WECHAT_OPENID@im.wechat' },
    ],
  },
];

// ── 需要添加 .example 模板的文件 ──
const TEMPLATES = [
  {
    desc: 'engine_config.json → engine_config.example.json',
    source: 'config/engine_config.json',
    dest: 'config/engine_config.example.json',
    transform(content) {
      const cfg = JSON.parse(content);
      // 移除真实的 API key 引用，替换为占位符
      if (cfg.llm?.apiKeyEnv) cfg.llm.apiKeyEnv = 'YOUR_API_KEY_ENV_VAR';
      if (cfg.llm?.baseUrl) cfg.llm.baseUrl = 'https://api.deepseek.com/v1';
      return JSON.stringify(cfg, null, 2) + '\n';
    },
  },
  {
    desc: 'persona.json → persona.example.json',
    source: 'config/persona.json',
    dest: 'config/persona.example.json',
    transform(content) {
      const cfg = JSON.parse(content);
      cfg.companion.location = 'YOUR_CITY_HERE';
      cfg.user.name = 'YOUR_NAME_HERE';
      cfg.user.name_en = 'YOUR_NAME_EN';
      cfg.user.english_level = 'YOUR_LEVEL';
      return JSON.stringify(cfg, null, 2) + '\n';
    },
  },
];

// ── 需要从发布中排除的文件 ──
const EXCLUDE_FROM_RELEASE = [
  'data/user_memory.db',
  'data/sync_state.json',
  'data/ai_daily_state.json',
  'config/engine_config.json',   // 只发布 .example 版本
  '.env*',
  'node_modules/',
];

// ── 备份/恢复目录 ──
const BACKUP_DIR = path.join(ROOT, '.release-backup');

function backupFile(filePath) {
  const rel = path.relative(ROOT, filePath);
  const bakPath = path.join(BACKUP_DIR, rel);
  fs.mkdirSync(path.dirname(bakPath), { recursive: true });
  if (fs.existsSync(filePath)) {
    fs.copyFileSync(filePath, bakPath);
  }
}

function restoreFile(filePath) {
  const rel = path.relative(ROOT, filePath);
  const bakPath = path.join(BACKUP_DIR, rel);
  if (fs.existsSync(bakPath)) {
    fs.copyFileSync(bakPath, filePath);
  }
}

// ── 主流程 ──
function sanitize() {
  console.log('🔒 清理敏感信息...\n');
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  // 1. 备份原始文件
  for (const item of REDACTIONS) {
    const files = item.files || [item.file];
    for (const f of files) {
      const p = path.resolve(ROOT, f);
      backupFile(p);
    }
  }
  for (const tpl of TEMPLATES) {
    const p = path.resolve(ROOT, tpl.source);
    backupFile(p);
  }

  // 2. 执行替换
  for (const item of REDACTIONS) {
    const files = item.files || [item.file];
    for (const f of files) {
      const filePath = path.resolve(ROOT, f);
      if (!fs.existsSync(filePath)) continue;
      let content = fs.readFileSync(filePath, 'utf-8');
      let changed = false;
      for (const rule of item.rules) {
        if (rule.find.test(content)) {
          content = content.replace(rule.find, rule.replace);
          changed = true;
        }
      }
      if (changed) {
        fs.writeFileSync(filePath, content);
        console.log(`  ✓ ${item.desc || f}`);
      }
    }
  }

  // 3. 生成 .example 模板 + 移除真实配置
  for (const tpl of TEMPLATES) {
    const src = path.resolve(ROOT, tpl.source);
    const dst = path.resolve(ROOT, tpl.dest);
    if (!fs.existsSync(src)) continue;
    const content = fs.readFileSync(src, 'utf-8');
    fs.writeFileSync(dst, tpl.transform(content));
    // ★ 物理移除真实配置文件，防止被 registry 打包
    if (tpl.remove_original !== false) {
      fs.unlinkSync(src);
    }
    console.log(`  ✓ ${tpl.desc} → ${tpl.dest}（原始已移除）`);
  }

  // 4. 生成 .gitignore 补充
  const gitignore = path.join(ROOT, '.gitignore');
  const entries = EXCLUDE_FROM_RELEASE.map(e => `\n# 开源发布排除\n${e}`).join('');
  if (fs.existsSync(gitignore)) {
    let content = fs.readFileSync(gitignore, 'utf-8');
    if (!content.includes('开源发布排除')) {
      fs.appendFileSync(gitignore, entries);
      console.log('  ✓ 更新 .gitignore');
    }
  }

  console.log(`\n✅ 完成。备份在 ${BACKUP_DIR}`);
  console.log('💡 发布完成后运行: node scripts/sanitize.js --restore');
}

function restore() {
  console.log('♻️  恢复原始文件...\n');
  if (!fs.existsSync(BACKUP_DIR)) {
    console.log('❌ 没有找到备份目录');
    return;
  }

  function walkDir(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walkDir(full); continue; }
      const rel = path.relative(BACKUP_DIR, full);
      const target = path.join(ROOT, rel);
      fs.copyFileSync(full, target);
      console.log(`  ✓ ${rel}`);
    }
  }
  walkDir(BACKUP_DIR);
  
  // 恢复 .example → 真实配置文件
  for (const tpl of TEMPLATES) {
    const dst = path.resolve(ROOT, tpl.dest);
    const src = path.resolve(ROOT, tpl.source);
    // 有备份用备份，没有则从 .example 恢复
    if (fs.existsSync(path.join(BACKUP_DIR, tpl.source))) {
      // 备份中已有，由 walkDir 恢复
    } else if (!fs.existsSync(src) && fs.existsSync(dst)) {
      // 从 .example 恢复真实配置
      const example = JSON.parse(fs.readFileSync(dst, 'utf-8'));
      // 保持占位符让用户自己填
      fs.writeFileSync(src, JSON.stringify(example, null, 2));
    }
    if (fs.existsSync(dst)) {
      fs.unlinkSync(dst);
      console.log(`  ✓ 删除 ${tpl.dest}`);
    }
  }

  console.log('\n✅ 已恢复');
}

// ── 入口 ──
if (process.argv.includes('--restore')) {
  restore();
} else {
  sanitize();
}
