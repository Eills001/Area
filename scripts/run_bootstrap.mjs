/**
 * dailyBootstrap runner script
 * Called by cron at 03:55 daily
 */
import { dailyBootstrap } from '../index.js';

try {
  const script = await dailyBootstrap();
  console.log('=== BOOTSTRAP SUCCESS ===');
  console.log(`Date:       ${script.date}`);
  console.log(`Vibe:       ${script.today_vibe}`);
  console.log(`Weather:    ${script.weather}`);
  console.log(`Nodes:      ${script.meta?.total_active_nodes}`);
  console.log(`Timeline:   ${script.timeline?.length} periods`);
  for (const p of script.timeline) {
    console.log(`  ${p.time_window} [${p.scene_tag}] ${p.state} (mood:${p.mood_score})`);
    for (const n of p.active_interactions || []) {
      console.log(`    - ${n.id}: ${n.theme} @ ${n.trigger_window} (P=${n.probability})`);
    }
  }
  console.log(`Generated:  ${script.generated_at}`);
  console.log('=== END ===');
} catch (err) {
  console.error('=== BOOTSTRAP FAILED ===');
  console.error(err);
  process.exit(1);
}
