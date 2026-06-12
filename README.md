# Area Engine v3.2

> AI 主动陪伴引擎 — 不只是聊天机器人，是一个有记忆、有人格、会主动关心你的 AI 伙伴。

Area Engine is a Node.js proactive companion engine that powers an AI companion with dynamic personality, memory ripples, emotional awareness, and conversation-rhythm-driven initiative. Built on [Hermes Agent](https://hermes-agent.nousresearch.com).

## Features

### Conversation Rhythm Trigger (v3.0)
Instead of fixed cron schedules, Area evaluates every 5 messages via LLM to decide whether to proactively reach out — like a real friend who knows when to talk.

### Cooldown Queue (v3.1)
Messages wait until you've been silent for N minutes before delivery. If you say something new, the timer resets. No spam.

### 13-Dimensional Dynamic Personality
Your companion's personality evolves based on real interactions, not pre-scripted rules. Includes `user_proactivity` — a 0–80 metric that automatically adjusts how often Area reaches out.

### Emoji & Sticker System (v3.2)
- 16 categories / 140 emoji with context-aware selection
- 41 OpenMoji stickers (CC BY-SA 4.0) across 8 mood categories
- Personality-weighted selection with usage tracking

### Memory Ripples
Long-term memory that surfaces naturally in conversation — not as a database dump, but as organic callbacks.

### 4-Level Emotional Fuse
| Level | Trigger | Behavior |
|-------|---------|----------|
| 0 Normal | Score ≤ 30 | Full proactive companionship |
| 1 Watch | 31–60 | Pause proactive topics |
| 2 Alert | 61–85 | Full proactive shutdown, neutral tone |
| 3 Lockdown | ≥ 86 | Terminate interaction, manual recovery only |

### Daily Script Engine
Every day at 03:55, Area generates a 4-segment daily script (morning/afternoon/evening/night) driven by its current personality state — giving it a sense of "living a day."

## Architecture

```
index.js
├── src/core/script_engine/    → Daily script generation (LLM)
├── src/core/personality/      → 13-dim personality evolution
├── src/core/emoji/            → Emoji palette + sticker manager
├── src/core/memory/           → Memory ripples + extraction
├── src/core/emotion_fuse/     → 4-level emotional fuse
├── src/core/proactive/        → Trigger evaluation + cooldown queue
└── src/utils/                 → LLM, DB, events, time
```

## Quick Start

```bash
# Install
npm install

# Configure
cp config/persona.example.json config/persona.json
cp config/engine_config.example.json config/engine_config.json
# Edit config files with your settings

# Set up database
node index.js init

# Run daily bootstrap (generates today's script)
node run_bootstrap.mjs

# Run tests
node test_fuse.mjs
node test_emoji.mjs
```

## Deployment

Area Engine uses a minimal deployment model:

| Component | Schedule | Purpose |
|-----------|----------|---------|
| Daily Bootstrap | 03:55 daily | Generate 4-segment daily script |
| Sync Bridge | After each agent reply | Emotion fuse + memory extraction + trigger evaluation |
| Active Scan | Hourly 8–22 | Deliver queued messages during silence |

## WeChat Integration

Area Engine is designed to work with [Hermes Agent](https://hermes-agent.nousresearch.com) as the gateway, delivering messages via WeChat:

```bash
hermes send --to "weixin:YOUR_OPENID@im.wechat" "消息内容"
```

## Sticker Gallery

41 OpenMoji stickers (CC BY-SA 4.0) across 8 categories: warm, happy, comfort, tease, morning, night, encourage, fun.

```bash
# Build sticker PNGs from OpenMoji SVGs
npm pack openmoji && tar xf openmoji-*.tgz
python3 scripts/build_stickers.py
```

## Open Source Release

Before publishing, sanitize sensitive data:

```bash
node scripts/sanitize.js    # Clean personal info → .example templates
# ... git commit & push ...
node scripts/sanitize.js --restore  # Restore local configs
```

## Tech Stack

- **Runtime**: Node.js (ES modules)
- **Database**: SQLite (better-sqlite3)
- **LLM**: Configurable (DeepSeek, OpenAI-compatible)
- **Gateway**: Hermes Agent

## License

MIT

## Authors

AREA (艾瑞安) + 陈泽营
