/**
 * 每日 bootstrap 入口 — 由 cron 调用
 * 用法：node run_bootstrap.mjs
 */
import { dailyBootstrap } from './index.js';

try {
  const script = await dailyBootstrap();
  console.log('=== BOOTSTRAP RESULT ===');
  console.log(JSON.stringify({
    status: 'ok',
    date: script.date,
    vibe: script.today_vibe,
    periods: script.timeline?.length || 0,
    generated_at: script.generated_at,
    personality_snapshot: script.personality_snapshot
  }, null, 2));
  process.exit(0);
} catch (err) {
  console.error('=== BOOTSTRAP FAILED ===');
  console.error(err.message);
  console.error(err.stack);
  process.exit(1);
}
