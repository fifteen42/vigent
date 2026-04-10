import { getModel, registerBuiltInApiProviders } from '@mariozechner/pi-ai';
import type { Model } from '@mariozechner/pi-ai';

// ── Initialize pi-ai providers on module load ────────────────────────────────
// This registers all built-in API providers (Anthropic, Google, OpenAI, etc.)
// so the agent loop can actually talk to the models.
registerBuiltInApiProviders();

// ── Local models (Ollama) ────────────────────────────────────────────────────
// Not in pi-ai catalog, so we define it manually.

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
  } as unknown as Model<'openai-completions'>;
}

// ── Named model constants (for direct import by non-preset consumers) ───────

export const CLAUDE_OPUS = getModel('anthropic', 'claude-opus-4-6') as Model<any>;
export const CLAUDE_SONNET = getModel('anthropic', 'claude-sonnet-4-6') as Model<any>;
export const CLAUDE_HAIKU = getModel('anthropic', 'claude-haiku-4-5-20251001') as Model<any>;
export const GEMINI_25_PRO = getModel('google', 'gemini-2.5-pro') as Model<any>;
export const GEMINI_20_FLASH = getModel('google', 'gemini-2.0-flash') as Model<any>;

// ── Preset routing ───────────────────────────────────────────────────────────

export type ModelPreset =
  | 'best'
  | 'balanced'
  | 'fast'
  | 'video'
  | 'gemini'
  | 'gemini-flash'
  | 'local';

export function resolveModel(preset: string, ollamaBaseUrl: string): Model<any> {
  try {
    switch (preset as ModelPreset) {
      case 'best':
        return getModel('anthropic', 'claude-opus-4-6') as Model<any>;
      case 'balanced':
        return getModel('anthropic', 'claude-sonnet-4-6') as Model<any>;
      case 'fast':
        return getModel('anthropic', 'claude-haiku-4-5-20251001') as Model<any>;
      case 'video':
      case 'gemini':
        return getModel('google', 'gemini-2.5-pro') as Model<any>;
      case 'gemini-flash':
        return getModel('google', 'gemini-2.0-flash') as Model<any>;
      case 'local':
        return makeGemma4Local(ollamaBaseUrl) as Model<any>;
      default:
        return getModel('anthropic', 'claude-sonnet-4-6') as Model<any>;
    }
  } catch (err) {
    throw new Error(
      `Failed to resolve model preset "${preset}": ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
