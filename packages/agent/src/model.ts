// Gemma 4 E4B model config for Ollama
// E4B supports: text, vision, audio, tools, thinking
// Running locally via Ollama at localhost:11434

export const gemma4Model = {
  id: 'gemma4:e4b',
  api: 'openai-completions' as const,
  provider: 'ollama',
  baseUrl: 'http://localhost:11434/v1',
  reasoning: false,
  input: ['text', 'image'] as const,
  contextWindow: 131072,
  cost: { input: 0, output: 0 },
  compat: {
    supportsDeveloperRole: false,
    supportsReasoningEffort: false,
    supportsStore: false,
    maxTokensField: 'max_tokens' as const,
  },
};
