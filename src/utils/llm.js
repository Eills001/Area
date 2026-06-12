/**
 * 统一 LLM 客户端 — 封装 DeepSeek / OpenAI-compatible API 调用
 * 
 * 配置来源（优先级从高到低）：
 * 1. 构造函数参数 config.baseUrl / config.apiKey
 * 2. engine_config.json → llm.baseUrl / llm.apiKeyEnv → process.env[apiKeyEnv]
 * 3. 环境变量 HERMES_GATEWAY_URL / DEEPSEEK_API_KEY
 * 4. 兜底 https://api.deepseek.com/v1
 */
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from ~/.hermes/.env (cron jobs don't auto-load it)
const envPath = path.resolve(__dirname, '../../../../../.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

function loadEngineConfig() {
  try {
    const configPath = path.join(__dirname, '../../config/engine_config.json');
    const raw = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const engineConfig = loadEngineConfig();

const DEFAULT_CONFIG = {
  provider: 'deepseek',
  model: 'deepseek-v4-pro',
  maxTokens: 1024,
  timeoutMs: 120000,
  retryCount: 3,
  retryDelayMs: 1000,
};

function resolveApiKey(apiKeyEnv) {
  if (!apiKeyEnv) return '';
  return process.env[apiKeyEnv] || '';
}

export class LLMClient {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // 优先级：构造参数 > engine_config.json > 环境变量 > 兜底
    const engineLLM = engineConfig?.llm || {};
    this.baseUrl = config.baseUrl 
      || engineLLM.baseUrl 
      || process.env.HERMES_GATEWAY_URL 
      || 'https://api.deepseek.com/v1';
    
    this.apiKey = config.apiKey 
      || resolveApiKey(engineLLM.apiKeyEnv) 
      || process.env.DEEPSEEK_API_KEY 
      || '';

    // Merge engine_config timeouts into config
    if (engineLLM.timeout_ms) {
      this.config.timeoutMs = engineLLM.timeout_ms;
    }
  }

  async chat(messages, options = {}) {
    const { temperature = 0.7, maxTokens = this.config.maxTokens } = options;
    let lastError;

    // Use configured timeout (default 120s)
    const timeoutMs = this.config.timeoutMs || 120000;

    // 规范化 baseUrl：确保末尾没有多余斜杠
    const baseUrl = this.baseUrl.replace(/\/+$/, '');
    const endpoint = baseUrl.endsWith('/v1') 
      ? `${baseUrl}/chat/completions`
      : `${baseUrl}/v1/chat/completions`;

    for (let attempt = 0; attempt < this.config.retryCount; attempt++) {
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;
        const res = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: this.config.model,
            messages,
            temperature,
            max_tokens: maxTokens,
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (!res.ok) throw new Error(`LLM HTTP ${res.status}: ${await res.text()}`);
        const data = await res.json();
        return data.choices[0].message.content;
      } catch (err) {
        lastError = err;
        if (attempt < this.config.retryCount - 1) {
          await sleep(this.config.retryDelayMs * (attempt + 1));
        }
      }
    }
    throw lastError;
  }

  async quickReply(systemPrompt, userMessage, temperature = 0.9) {
    return this.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      { temperature },
    );
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export const llm = new LLMClient();
