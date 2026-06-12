/**
 * 引擎自主扫描投递 — cron 入口 (no_agent + deliver=local)
 * 
 * 每次 cron 触发时：
 *   1. 先处理冷却队列（有到期消息就发）
 *   2. 再检查当前时段是否有待发的剧本节点
 *   3. 走完整管线：proactivity → 风控 → 熔断 → LLM评估 → 入队
 * 
 * 这个脚本既是 cron 的数据采集器，也是投递执行器。
 * stdout 输出状态摘要（由 cron 保存到本地）。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── 加载 .env ──
function loadEnv() {
  const envPath = path.join(process.env.HOME || '/root', '.hermes/.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1);
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

// ── 路径 ──
const ENGINE_ROOT = path.resolve(__dirname, '../../..');
const STATE_FILE = path.join(ENGINE_ROOT, 'data/sync_state.json');
const DAILY_STATE_FILE = path.join(ENGINE_ROOT, 'data/ai_daily_state.json');
const WECHAT_TARGET = 'weixin:o9cq80y-pbrKqkuLpbmPBx69bClI@im.wechat';
const MAX_COOLDOWN = 60; // 最大冷却分钟数

// ── 工具函数 ──
function loadSyncState() {
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    raw.pending_messages = raw.pending_messages || [];
    raw.trigger_stats = raw.trigger_stats || { total_evaluations:0, should_send:0, should_not_send:0, guard_blocks:0, queue_sent:0, queue_resets:0, parse_failures:0 };
    const defs = { total_evaluations:0, should_send:0, should_not_send:0, guard_blocks:0, queue_sent:0, queue_resets:0, parse_failures:0 };
    for (const [k,v] of Object.entries(defs)) { if (!(k in raw.trigger_stats)) raw.trigger_stats[k] = v; }
    return raw;
  } catch {
    return { last_synced_ts:null, user_msg_count:0, pending_messages:[], last_user_active_date:null,
      trigger_stats:{ total_evaluations:0, should_send:0, should_not_send:0, guard_blocks:0, queue_sent:0, queue_resets:0, parse_failures:0 } };
  }
}
function saveSyncState(s) { fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); }
function loadDailyState() { try { return JSON.parse(fs.readFileSync(DAILY_STATE_FILE, 'utf-8')); } catch { return null; } }

function sendWechat(msg) {
  const safe = msg.replace(/"/g, "'").replace(/\n/g, ' ');
  try {
    execSync(`hermes send --to "${WECHAT_TARGET}" "${safe}"`, { timeout: 30000, encoding: 'utf-8' });
    return true;
  } catch (err) { console.error(`[scan] send failed: ${err.message}`); return false; }
}

function nowInWindow(tw) {
  const [s, e] = tw.split('-').map(t => { const [h,m] = t.split(':').map(Number); return h*60+m; });
  const now = new Date(); const mins = now.getHours()*60 + now.getMinutes();
  return mins >= s && mins < e;
}

// ── 主流程 ──
async function main() {
  const state = loadSyncState();
  const daily = loadDailyState();
  const now = Date.now();

  // ① 冷却队列：有到期消息先发
  const pending = state.pending_messages;
  if (pending.length > 0) {
    const ready = [];
    const keep = [];
    for (const item of pending) {
      const readyAt = new Date(item.ready_at).getTime();
      if (now >= readyAt) ready.push(item);
      else keep.push(item);
    }
    for (const item of ready) {
      const ok = sendWechat(item.message);
      if (ok) {
        state.trigger_stats.queue_sent++;
        console.log(`[scan] queue sent: ${item.message.slice(0,40)}...`);
      } else {
        keep.push({ ...item, retry_count: (item.retry_count||0)+1 });
      }
    }
    state.pending_messages = keep;
    saveSyncState(state);
    if (ready.length > 0) return; // 发了队列消息就不用新消息了
  }

  // ② 风控：user_proactivity
  const engine = await import(path.join(ENGINE_ROOT, 'index.js'));
  let userProactivity = 60;
  try {
    const pState = engine.personality ? engine.personality.getCurrentState() : null;
    if (pState) userProactivity = pState.user_proactivity ?? 60;
  } catch {}
  
  if (userProactivity <= 0) { console.log('[scan] SKIP: proactivity=0'); return; }

  // 深夜免打扰
  const hour = new Date().getHours();
  if (hour >= 23 || hour < 7) { console.log('[scan] SKIP: night'); return; }

  // ③ 熔断
  try {
    const fuseState = engine.EmotionFuseCheck 
      ? engine.getSessionFuseState ? engine.getSessionFuseState('default') : null
      : null;
    if (fuseState && fuseState.fuse_level >= 1) { console.log(`[scan] SKIP: fuse=${fuseState.fuse_level}`); return; }
  } catch {}

  // ④ 当前时段？
  if (!daily || !daily.timeline) { console.log('[scan] SKIP: no daily state'); return; }
  const currentWindow = daily.timeline.find(t => nowInWindow(t.time_window));
  if (!currentWindow || !currentWindow.active_interactions?.length) {
    console.log('[scan] SKIP: no active interaction in current window');
    return;
  }

  // ⑤ LLM 评估
  const triggerModule = await import(path.join(ENGINE_ROOT, 'src/core/proactive/evaluate_trigger.js'));
  const triggerResult = await triggerModule.evaluateTrigger(
    [{ role: 'user', content: `（用户静默中。${currentWindow.scene_tag}时段。${currentWindow.state}）` }],
    { user_proactivity: userProactivity, today_vibe: daily.today_vibe || '' }
  );

  state.trigger_stats.total_evaluations++;
  if (!triggerResult.should_send) {
    state.trigger_stats.should_not_send++;
    saveSyncState(state);
    console.log(`[scan] eval: not now — ${triggerResult.reason}`);
    return;
  }

  // ⑥ 入队
  state.trigger_stats.should_send++;
  const msg = triggerResult.message || currentWindow.active_interactions[0].content_hint;
  const cooldown = Math.max(3, Math.min(MAX_COOLDOWN, triggerResult.cooldown_minutes || 5));
  const readyAt = new Date(now + cooldown * 60 * 1000).toISOString();
  state.pending_messages.push({
    id: `scan_${now}`,
    message: msg,
    cooldown_minutes: cooldown,
    ready_at: readyAt,
    created_at: new Date().toISOString(),
    retry_count: 0,
  });
  saveSyncState(state);
  console.log(`[scan] queued (${cooldown}min): ${msg.slice(0,60)}`);
}

main().catch(err => { console.error(`[scan] fatal: ${err.message}`); process.exit(1); });
