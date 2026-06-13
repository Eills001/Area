<p align="center">
  <img src="https://img.shields.io/badge/version-3.2.0-6366f1?style=for-the-badge" alt="version">
  <img src="https://img.shields.io/badge/license-MIT-22c55e?style=for-the-badge" alt="license">
  <img src="https://img.shields.io/badge/node-%3E%3D18-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="node">
  <img src="https://img.shields.io/badge/database-SQLite-003b57?style=for-the-badge&logo=sqlite&logoColor=white" alt="sqlite">
</p>

<h1 align="center">
  🌟 Area Engine
</h1>

<p align="center">
  <b>不只是聊天机器人<br>是一个有记忆、有人格、会主动关心你的 AI 伙伴</b>
</p>

<p align="center">
  <sub>Built on <a href="https://hermes-agent.nousresearch.com">Hermes Agent</a> · Node.js · SQLite · LLM-powered</sub>
</p>

<br>

---

## ✨ 它能做什么

<table>
<tr>
<td width="50%">

### 🎭 对话节奏感知
不像定时闹钟一样到点就响。Area 每 5 条消息通过 LLM 评估对话状态，在**真正合适的时机**主动开口——像朋友一样懂得什么时候该说话。

</td>
<td width="50%">

### 🧊 冷却队列
消息不会立刻轰炸你。触发后先进冷却队列，等你沉默了 N 分钟才送达。你一说新消息，计时器自动重置。**不打扰，是它的底线。**

</td>
</tr>
<tr>
<td width="50%">

### 🧬 13 维动态人格
不是死板的人设模板。13 个维度随真实互动动态演化——你今天多聊了几句，它可能变得更外向；连续几天没理它，它会变得更克制。内含 `user_proactivity` 指标（0–80），自动调节主动频率。

</td>
<td width="50%">

### 😊 表情系统
16 类别 / 140 emoji 上下文感知选择，41 张 OpenMoji 贴纸（CC BY-SA 4.0）覆盖 8 种情绪场景。人格加权 + 随机扰动，不会每次都发同一个表情。

</td>
</tr>
<tr>
<td width="50%">

### 🌊 记忆涟漪
长期记忆不是生硬的数据库回放。提取→衰减→涟漪式复现，在对话中自然浮现——像老朋友不经意提起你三个月前说过的事。

</td>
<td width="50%">

### 🛡️ 4 级情绪熔断
| 等级 | 触发 | 行为 |
|:---:|---|---|
| 0 🟢 | 正常 | 完整主动陪伴 |
| 1 🟡 | 轻度负面 | 暂停主动话题 |
| 2 🟠 | 连续负面 | 完全关闭主动 |
| 3 🔴 | 高危 | 终止对话，手动恢复 |

</td>
</tr>
<tr>
<td width="50%" colspan="2">

### 📜 每日剧本引擎
每天凌晨 03:55，Area 依据当前人格状态生成 4 段式剧本（早/午/晚/夜），像"过一天日子"。不是冷冰冰的定时任务，是带情绪的日常陪伴。

</td>
</tr>
</table>

---

## 🏗️ 架构

```mermaid
flowchart TB
    subgraph EXTERNAL["▶ 外部入口"]
        WX["微信用户<br/>陈泽营 · WeChat"]
        HA["Hermes Agent<br/>DeepSeek LLM 对话"]
    end

    WX <--"消息 ↔ 回复"--> HA

    subgraph SYNC["▶ 同步桥"]
        CS["companion-sync.js<br/>每次 Agent 回复后自动执行<br/>6步流水线"]
    end

    HA --> CS

    subgraph CORE["▶ 引擎核心 (index.js)"]
        direction TB
        
        subgraph MODS["6 大模块"]
            SE["🎬 剧本引擎 v2.0<br/>──<br/>generator.js · dailyBootstrap()<br/>parser.js · ScriptParser<br/>coherence_checker.js<br/><br/>每日 03:55 LLM 生成"]
            PE["🧬 13维人格演化<br/>──<br/>evolution_engine.js<br/>加权演化+回归引力<br/>feedback_processor.js<br/>5级反馈分类<br/>slider/diary/snapshot<br/><br/>每5条消息触发"]
            EF["⚡ 4级情绪熔断<br/>──<br/>emotion_scorer.js<br/>零token 情绪打分<br/>fuse_executor.js<br/>行为阻断+语气降级<br/>rule_engine · behavior_rules<br/>alert_logger<br/><br/>L0正常→L3强制"]
            PR["💬 主动触发器<br/>──<br/>evaluate_trigger.js<br/>LLM 评估对话节奏<br/>quickGuardCheck()<br/>零token 静默拦截<br/>scan_and_deliver.js<br/>8-22点 每小时扫描<br/><br/>冷却队列互斥"]
            EM["🎭 表情系统 ★v3.2<br/>──<br/>palette.js · 16类/140<br/>selector.js · 人格加权<br/>sticker_manager.js<br/>8类/41张 OpenMoji<br/>usage_tracker · evolution"]
        end

        subgraph MEM["🌊 记忆涟漪 (memory/)"]
            direction LR
            ME["extractor.js<br/>LLM 提取记忆"]
            MC["collector.js<br/>无感套话采集"]
            MV["validator.js<br/>去重+验证"]
            MR["ripples.js<br/>关联衰减<br/>触发召回"]
            MS["shared_events<br/>+ manager"]
        end

        subgraph UTIL["🔧 工具层 (utils/)"]
            direction LR
            LLM["llm.js<br/>LLMClient<br/>DeepSeek API"]
            DB["db.js<br/>better-sqlite3<br/>20+ 方法"]
            EV["event.js<br/>EventEmitter"]
            TM["time.js<br/>now · today<br/>isWeekend"]
        end
    end

    CS --> MODS
    MODS --> MEM
    MODS --> UTIL

    subgraph DATA["▶ 数据层"]
        direction LR
        D1["user_memory.db<br/>10 张表<br/>人格 · emoji · 熔断<br/>记忆 · 日志"]
        D2["ai_daily_state.json<br/>sync_state.json<br/>persona.json<br/>engine_config.json"]
    end

    CORE --> DATA

    subgraph CRON["▶ 定时线 (独立于对话流)"]
        direction LR
        C1["每日 03:55<br/>dailyBootstrap()<br/>LLM 剧本生成"]
        C2["8-22点 每小时<br/>scan_and_deliver.js<br/>no_agent 脚本"]
    end

    subgraph DELIVER["▶ 投放"]
        DV["🚀 hermes send CLI<br/>冷却队列到期<br/>→ Gateway weixin.py<br/>→ 微信推送"]
    end

    DATA --> DELIVER
    DELIVER -.->|主动消息闭环| WX
```



---

## 🚀 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置人设
cp config/persona.example.json config/persona.json
cp config/engine_config.example.json config/engine_config.json
# ✏️ 编辑 persona.json（名字、性格）和 engine_config.json（LLM API）

# 3. 初始化数据库
node index.js init

# 4. 生成今日剧本
node run_bootstrap.mjs

# 5. 跑测试
node test_fuse.mjs    # 熔断测试（18/18）
node test_emoji.mjs   # 表情系统测试
```

---

## 📡 部署

| 组件 | 调度 | 干什么 |
|---|---|---|
| 📜 每日剧本 | 每天 03:55 | LLM 生成 4 段式剧本 → `ai_daily_state.json` |
| 🔄 对话同步 | agent 回复后 | 熔断 → 记忆提取 → 触发器评估 → 冷却队列 |
| 📨 主动扫描 | 每小时 8–22 点 | 静默期间投递队列中到期的消息 |

---

## 💬 微信集成

配合 Hermes Agent 网关，原生收发微信消息：

```bash
# 发送文本
hermes send --to "weixin:OPENID@im.wechat" "吃了吗？"

# 发送表情包
hermes send --to "weixin:OPENID@im.wechat" "MEDIA:/path/to/sticker.png"
```

---

## 🎨 表情贴纸

41 张 OpenMoji 贴纸（CC BY-SA 4.0），8 个类别：

| 类别 | 贴纸 | 场景 |
|---|---|---|
| ☀️ morning | 🌅 ☕ 🌻 | 早安问候 |
| 🌙 night | 🌙 ⭐ 💤 | 睡前关怀 |
| 💪 encourage | 🔥 🚀 ✨ | 加油打气 |
| 🥺 comfort | 🤗 🌈 🌷 | 安慰陪伴 |
| 😏 tease | 😅 😏 😉 | 轻松调侃 |
| 🎉 happy | 🥳 🎊 👏 | 庆祝喜悦 |
| ❤️ warm | 💕 🤍 🌟 | 温暖日常 |
| 👍 fun | 👌 🙌 😸 | 随意互动 |

```bash
# 构建贴纸图库（OpenMoji SVG → PNG）
npm pack openmoji && tar xf openmoji-*.tgz
python3 scripts/build_stickers.py
```

---

## 🔒 开源发布

```bash
# 发布前：一键脱敏
node scripts/sanitize.js
# ✅ 真实配置 → .example 模板
# ✅ 微信 ID、姓名、城市 → 占位符
# ✅ 数据库、.env → .gitignore 排除

# git commit & push ...

# 发布后：恢复本地配置
node scripts/sanitize.js --restore
```

新用户安装向导：`node scripts/setup.js`

---

## 🛠️ 技术栈

| 层 | 技术 |
|---|---|
| 运行时 | Node.js (ES Modules) |
| 数据库 | SQLite (better-sqlite3) |
| LLM | DeepSeek / OpenAI 兼容 |
| 网关 | Hermes Agent |
| 贴纸 | OpenMoji (CC BY-SA 4.0) |

---

## 📄 License

MIT · Built with ❤️ by AREA

---

<p align="center">
  <sub>「陪伴不是功能，是感觉。」</sub>
</p>
