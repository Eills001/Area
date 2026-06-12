/**
 * 新用户安装向导
 * 首次运行时配置个性化参数
 * 用法: node scripts/setup.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function ask(rl, question) {
  return new Promise(resolve => {
    rl.question(`\x1b[36m${question}\x1b[0m `, answer => resolve(answer.trim()));
  });
}

async function main() {
  console.log('\n╔══════════════════════════════════╗');
  console.log('║   Hermes-Companion 安装向导 v3.1  ║');
  console.log('╚══════════════════════════════════╝\n');
  console.log('这个向导会帮你配置引擎所需的个性化参数。');
  console.log('所有配置保存在 config/ 目录下。\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  // 1. 检查是否需要从 .example 恢复
  const personaExample = path.join(ROOT, 'config/persona.example.json');
  const personaConfig = path.join(ROOT, 'config/persona.json');
  const engineExample = path.join(ROOT, 'config/engine_config.example.json');
  const engineConfig = path.join(ROOT, 'config/engine_config.json');

  if (!fs.existsSync(personaConfig) && fs.existsSync(personaExample)) {
    fs.copyFileSync(personaExample, personaConfig);
    console.log('✓ 从 persona.example.json 创建 config/persona.json');
  }
  if (!fs.existsSync(engineConfig) && fs.existsSync(engineExample)) {
    fs.copyFileSync(engineExample, engineConfig);
    console.log('✓ 从 engine_config.example.json 创建 config/engine_config.json');
  }

  // 2. 配置 persona
  if (fs.existsSync(personaConfig)) {
    const persona = JSON.parse(fs.readFileSync(personaConfig, 'utf-8'));
    
    console.log('\n── 基本设置 ──\n');
    
    const name = await ask(rl, `你的名字？ [${persona.user?.name || ''}]`);
    if (name) persona.user.name = name;

    const nameEn = await ask(rl, `英文名/拼音？ [${persona.user?.name_en || ''}]`);
    if (nameEn) persona.user.name_en = nameEn;

    const location = await ask(rl, `所在城市？ [${persona.companion?.location || ''}]`);
    if (location) persona.companion.location = location;

    fs.writeFileSync(personaConfig, JSON.stringify(persona, null, 2));
    console.log('\n✓ persona.json 已保存');
  }

  // 3. 配置 LLM
  if (fs.existsSync(engineConfig)) {
    const engine = JSON.parse(fs.readFileSync(engineConfig, 'utf-8'));

    console.log('\n── LLM 设置 ──\n');

    const provider = await ask(rl, `LLM 提供商？ [${engine.llm?.provider || 'deepseek'}]`);
    if (provider) engine.llm.provider = provider;

    const apiKeyEnv = await ask(rl, `API Key 环境变量名？ [${engine.llm?.apiKeyEnv || ''}]`);
    if (apiKeyEnv) engine.llm.apiKeyEnv = apiKeyEnv;

    const baseUrl = await ask(rl, `API Base URL？ [${engine.llm?.baseUrl || ''}]`);
    if (baseUrl) engine.llm.baseUrl = baseUrl;

    fs.writeFileSync(engineConfig, JSON.stringify(engine, null, 2));
    console.log('\n✓ engine_config.json 已保存');
  }

  // 4. 提示后续步骤
  console.log('\n── 后续步骤 ──\n');
  console.log('1. 确保已设置环境变量: export YOUR_API_KEY_ENV_VAR="your-key"');
  console.log('2. 安装依赖: npm install');
  console.log('3. 测试: node test_fuse.mjs');
  console.log('4. 配置 Hermes cron jobs（参考 SKILL.md）');
  console.log('\n✅ 安装完成！\n');

  rl.close();
}

main().catch(err => { console.error(err); process.exit(1); });
