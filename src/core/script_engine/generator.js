/**
 * 剧本生成器 v2.0 — LLM 生成带主动节点的完整每日剧本
 *
 * 输入：昨日剧本、天气、人格快照
 * 输出：含4个时段 + 主动互动节点的完整 timeline
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { llm } from '../../utils/llm.js';
import { today, now, isSunday, isSaturday } from '../../utils/time.js';
import { getWeather } from '../../../skills/weather.js';
import { getRecentState } from '../memory/index.js';
import { personality } from '../personality/index.js';
import { CoherenceChecker } from './coherence_checker.js';
import logger from '../../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.resolve(__dirname, '../../../data/ai_daily_state.json');
const CONFIG_PATH = path.resolve(__dirname, '../../../config/persona.json');

const PROMPT_TEMPLATE = `你是一个AI生活剧本作家。为名为"{name_cn}"的AI伙伴生成{date}的每日生活剧本。

【AI 人设】
{name_cn}是一个{role}，生活在{location}。性格核心：{core_traits}

【输入数据】
昨日总结：{yesterday_vibe}
今日天气：{weather_summary}
用户：{user_name}
当前人格状态（13维）：{personality_state}
{weekend_note}

【生成规则 — 严格遵守】
1. 将一天分为4个时段，每个时段2-6小时，全天覆盖不重叠
2. 每个时段必须包含1个话题提示（topics），用于触发器评估时参考
3. 时段状态描述要真实、平淡、像普通人的生活，反戏剧化
4. topic 是生活碎片分享主题，陈述语气，**绝对不能包含任何问号**
5. mood_score 与状态匹配：困=30，放松=60，低落=25
6. 保持连贯性：下一个时段的状态要承接上一个
7. 如果昨天熬夜了，今天早上要体现"困"
8. 周末（周六/周日）剧本要更放松，工作相关减少
9. reply_mode：工作时段 slow，通勤 slow，放松 quick，晚间 normal
10. ★ 内容真实性约束（重要）：现在是{month}月，地点是{location}。
    - 不要编造具体的季节性细节（植物开花、果实成熟、候鸟迁徙等），除非你100%确定
    - 宁可写「路边飘来一阵花香」「风吹着很舒服」「蝉开始叫了」这种通用描述
    - 不要为追求「诗意」而牺牲准确性。平淡真实比浪漫错误好一万倍
    - 如果昨天剧本里也出现了类似的季节细节，不要重复

【输出格式 — 只输出纯 JSON，不要任何其他文字】
{
  "today_vibe": "一句话描述今天整体氛围",
  "yesterday_summary": "一句话总结昨天",
  "weather": "{weather_summary}",
  "timeline": [
    {
      "time_window": "07:00-10:00",
      "state": "具体描述此时段AI的状态，15-30字",
      "reply_mode": "slow",
      "scene_tag": "commute",
      "mood_score": 30,
      "active_interactions": [
        {
          "theme": "主题，4-10字",
          "content_hint": "生活碎片内容提示，陈述语气，不能有问号"
        }
      ]
    }
  ]
}`;

export class ScriptGenerator {
  constructor() {
    this.coherenceChecker = new CoherenceChecker();
  }

  /**
   * 生成今日剧本
   */
  async generate(userId = 'default') {
    const dateStr = today();
    const pState = personality.getCurrentState();

    // 获取天气（失败不影响继续）
    let weather = { temp_c: '?', weather_desc: '未知' };
    try {
      const w = await getWeather('饶阳县');
      if (!w.error) weather = w;
    } catch (err) {
      logger.warn(`[generator] Weather fetch failed: ${err.message}`);
    }
    const weatherSummary = `${weather.weather_desc}，${weather.temp_c}°C`;

    // 加载昨日剧本
    const yesterday = this.loadYesterdayScript();

    // 周末标记
    let weekendNote = '';
    if (isSaturday()) weekendNote = '今天是周六，AI休息，剧本应该是躺平/娱乐主题';
    else if (isSunday()) weekendNote = '今天是周日，轻松为主，可以有少量下周计划';

    // 获取人设
    const personaConfig = this.loadPersonaConfig();

    // 构建人格状态摘要
    const traitLabels = {
      sharing_tendency: '分享欲',
      positive_share_ratio: '积极分享比例',
      complaint_level: '吐槽倾向',
      night_owl: '熬夜程度',
      work_motivation: '工作积极性',
      empathy_level: '共情能力',
      outgoing: '外向度',
      positive_attitude: '乐观程度',
      private_share_ratio: '私密分享比例',
      topic_preference: '话题多样性',
      exercise_enthusiasm: '运动热情',
      spicy_tolerance: '嗜辣程度',
    };
    const personalityLines = [];
    for (const [key, label] of Object.entries(traitLabels)) {
      const val = pState[key] ?? 50;
      personalityLines.push(`- ${label}：${val}/100`);
    }
    const personalityState = personalityLines.join('\n');

    // 构建提示词
    const currentMonth = new Date().getMonth() + 1;
    const prompt = PROMPT_TEMPLATE
      .replace(/\{name_cn\}/g, personaConfig.companion.name_cn)
      .replace(/\{role\}/g, personaConfig.companion.role)
      .replace(/\{location\}/g, personaConfig.companion.location)
      .replace(/\{user_name\}/g, personaConfig.user.name)
      .replace(/\{date\}/g, dateStr)
      .replace(/\{month\}/g, String(currentMonth))
      .replace(/\{core_traits\}/g, (personaConfig.immutable_core || []).join('、'))
      .replace(/\{weather_summary\}/g, weatherSummary)
      .replace(/\{yesterday_vibe\}/g, yesterday?.today_vibe || '昨天一切正常')
      .replace(/\{personality_state\}/g, personalityState)
      .replace(/\{weekend_note\}/g, weekendNote);

    // 调用 LLM 生成
    let script;
    try {
      const response = await llm.chat(
        [
          { role: 'system', content: '你是一个精准的JSON生成器。只输出JSON，不要markdown代码块，不要解释。' },
          { role: 'user', content: prompt },
        ],
        { temperature: 0.85, maxTokens: 2048 },
      );

      script = this.parseLLMResponse(response);
    } catch (err) {
      logger.error(`[generator] LLM generation failed: ${err.message}`);
      script = this.buildFallbackScript(dateStr, weatherSummary, pState);
    }

    // 连贯性检查
    try {
      script = this.coherenceChecker.validate(script, yesterday);
    } catch (err) {
      logger.warn(`[generator] Coherence check failed: ${err.message}`);
    }

    // 补充元数据
    script.date = dateStr;
    script.generated_at = now().toISOString();
    script.version = '2.0.0';
    script.personality_snapshot = {
      sharing_tendency: pState.sharing_tendency,
      positive_share_ratio: pState.positive_share_ratio,
      complaint_level: pState.complaint_level,
    };

    // 统计
    script.meta = {
      generated_at: script.generated_at,
      version: script.version,
    };

    logger.info(`[generator] Script generated: ${script.today_vibe}`);
    return script;
  }

  parseLLMResponse(response) {
    // 尝试从可能的 markdown 代码块中提取 JSON
    let json = response.trim();

    // 尝试匹配 ```json ... ``` 或 ``` ... ```
    const codeBlockMatch = json.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) json = codeBlockMatch[1];

    // 移除 BOM 和零宽字符
    json = json.replace(/^\uFEFF/, '').replace(/[\u200B-\u200D\uFEFF]/g, '');

    // 修复未转义的控制字符（ASCII 0-31，除了 \t \n \r）
    // 这些字符在 JSON 字符串中是无效的
    json = json.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

    // 尝试直接解析
    try {
      return JSON.parse(json);
    } catch (e1) {
      // 常见修复：转义字符串内未转义的换行符
      let fixed = json.replace(/(?<=[^\\]"(?:[^"\\]|\\.)*)[\n\r]+(?=(?:[^"\\]|\\.)*[^\\]")/g, '\\n');
      try {
        return JSON.parse(fixed);
      } catch (e2) {
        // 最后手段：尝试用更宽松的方式提取 JSON 对象
        const objMatch = json.match(/\{[\s\S]*\}/);
        if (objMatch) {
          return JSON.parse(objMatch[0]);
        }
        throw e2;
      }
    }
  }

  buildFallbackScript(dateStr, weatherSummary, pState) {
    logger.warn('[generator] Using fallback script');

    return {
      today_vibe: '平平无奇的一天',
      yesterday_summary: '昨天一切正常',
      weather: weatherSummary,
      timeline: [
        {
          time_window: '07:00-10:00',
          state: '早起准备开始新的一天，喝杯咖啡醒醒神',
          reply_mode: 'slow',
          scene_tag: 'commute',
          mood_score: 50,
          active_interactions: [
            { theme: '早安问候', content_hint: '刚喝完一杯咖啡，感觉眼睛睁开了' },
          ],
        },
        {
          time_window: '10:00-12:30',
          state: '上午在处理一些零碎的事情',
          reply_mode: 'slow',
          scene_tag: 'work',
          mood_score: 50,
          active_interactions: [
            { theme: '工作日常', content_hint: '早上过得好快，一看时间已经中午了' },
          ],
        },
        {
          time_window: '14:00-18:00',
          state: '下午继续干活，有点犯困',
          reply_mode: 'slow',
          scene_tag: 'work',
          mood_score: 45,
          active_interactions: [
            { theme: '午后犯困', content_hint: '下午两点多的困意真的扛不住' },
          ],
        },
        {
          time_window: '19:00-23:30',
          state: '下班后终于自由了，瘫在沙发上刷手机',
          reply_mode: 'quick',
          scene_tag: 'relax',
          mood_score: 70,
          active_interactions: [
            { theme: '晚间放松', content_hint: '刚洗完澡躺下来，今天终于结束了哈哈' },
          ],
        },
      ],
    };
  }

  loadYesterdayScript() {
    try {
      const raw = fs.readFileSync(DATA_PATH, 'utf-8');
      const script = JSON.parse(raw);
      if (script.date !== today()) return script;
    } catch {}

    // 主文件已被今天的数据覆盖，尝试 .bak
    try {
      const bakPath = DATA_PATH + '.bak';
      const raw = fs.readFileSync(bakPath, 'utf-8');
      const bak = JSON.parse(raw);
      if (bak.date !== today()) return bak;
    } catch {}

    return null;
  }

  loadPersonaConfig() {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    } catch {
      return {
        companion: { name_cn: 'AREA', role: 'AI伙伴', location: '河北饶阳' },
        user: { name: '陈泽营' },
        immutable_core: ['温暖', '可靠'],
      };
    }
  }
}

export const scriptGenerator = new ScriptGenerator();
export default ScriptGenerator;
