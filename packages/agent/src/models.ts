import type { Model } from '@mariozechner/pi-ai';

// ── Cloud models ──────────────────────────────────────────────────────────────

export const CLAUDE_OPUS: Model<'anthropic'> = {
  id: 'claude-opus-4-6',
  name: 'Claude Opus 4.6',
  api: 'anthropic',
  provider: 'anthropic',
  baseUrl: 'https://api.anthropic.com',
  reasoning: false,
  input: ['text', 'image'],
  contextWindow: 200_000,
  maxTokens: 32_000,
  cost: { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
};

export const CLAUDE_SONNET: Model<'anthropic'> = {
  id: 'claude-sonnet-4-6',
  name: 'Claude Sonnet 4.6',
  api: 'anthropic',
  provider: 'anthropic',
  baseUrl: 'https://api.anthropic.com',
  reasoning: false,
  input: ['text', 'image'],
  contextWindow: 200_000,
  maxTokens: 32_000,
  cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
};

export const CLAUDE_HAIKU: Model<'anthropic'> = {
  id: 'claude-haiku-4-5-20251001',
  name: 'Claude Haiku 4.5',
  api: 'anthropic',
  provider: 'anthropic',
  baseUrl: 'https://api.anthropic.com',
  reasoning: false,
  input: ['text', 'image'],
  contextWindow: 200_000,
  maxTokens: 8_192,
  cost: { input: 0.8, output: 4, cacheRead: 0.08, cacheWrite: 1 },
};

export const GEMINI_25_PRO: Model<'google'> = {
  id: 'gemini-2.5-pro',
  name: 'Gemini 2.5 Pro',
  api: 'google',
  provider: 'google',
  baseUrl: 'https://generativelanguage.googleapis.com',
  reasoning: false,
  input: ['text', 'image'],
  contextWindow: 1_000_000,
  maxTokens: 65_536,
  cost: { input: 1.25, output: 10, cacheRead: 0, cacheWrite: 0 },
};

export const GEMINI_20_FLASH: Model<'google'> = {
  id: 'gemini-2.0-flash',
  name: 'Gemini 2.0 Flash',
  api: 'google',
  provider: 'google',
  baseUrl: 'https://generativelanguage.googleapis.com',
  reasoning: false,
  input: ['text', 'image'],
  contextWindow: 1_000_000,
  maxTokens: 8_192,
  cost: { input: 0.1, output: 0.4, cacheRead: 0, cacheWrite: 0 },
};

// ── Local models ──────────────────────────────────────────────────────────────

export function makeGemma4Local(baseUrl: string): Model<'openai-completions'> {
  return {
    id: 'gemma4:e4b',
    name: 'Gemma 4 E4B (Local)',
    api: 'openai-completions',
    provider: 'ollama',
    baseUrl: `${baseUrl}/v1`,
    reasoning: false,
    input: ['text', 'image'],
    contextWindow: 131_072,
    maxTokens: 8_192,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      supportsStore: false,
      maxTokensField: 'max_tokens',
    },
  };
}

// ── Preset routing ────────────────────────────────────────────────────────────

export type ModelPreset = 'best' | 'balanced' | 'fast' | 'video' | 'local';

export function resolveModel(preset: string, ollamaBaseUrl: string): Model<any> {
  const map: Record<ModelPreset, Model<any>> = {
    best: CLAUDE_OPUS,
    balanced: CLAUDE_SONNET,
    fast: CLAUDE_HAIKU,
    video: GEMINI_25_PRO,
    local: makeGemma4Local(ollamaBaseUrl),
  };
  return map[preset as ModelPreset] ?? CLAUDE_SONNET;
}
