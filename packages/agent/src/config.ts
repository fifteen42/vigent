export interface VigentConfig {
  // Model selection
  model: string;

  // API keys
  anthropicApiKey?: string;
  googleApiKey?: string;
  minimaxApiKey?: string;
  minimaxBaseUrl: string;
  ollamaBaseUrl: string;

  // Behavior
  permissionMode: 'auto' | 'ask' | 'deny';
  maxSteps: number;

  // Screenshot settings
  screenshotQuality: number;   // JPEG quality 0-1, default 0.75
  screenshotMaxWidth: number;  // px, default 1280

  // Context management
  maxContextTokens: number;    // trigger pruning above this
  keepRecentScreenshots: number;

  // Generation defaults
  minimaxVideoModel: string;
  minimaxTtsVoice: string;
}

export function loadConfig(overrides?: Partial<VigentConfig>): VigentConfig {
  return {
    model: process.env.VIGENT_MODEL ?? 'balanced',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    googleApiKey: process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY,
    minimaxApiKey: process.env.MINIMAX_API_KEY,
    minimaxBaseUrl: process.env.MINIMAX_BASE_URL ?? 'https://api.minimax.io',
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
    permissionMode: (process.env.VIGENT_PERMISSION ?? 'auto') as VigentConfig['permissionMode'],
    maxSteps: parseInt(process.env.VIGENT_MAX_STEPS ?? '50', 10),
    screenshotQuality: 0.75,
    screenshotMaxWidth: 1280,
    maxContextTokens: 100_000,
    keepRecentScreenshots: 3,
    minimaxVideoModel: 'MiniMax-Hailuo-2.3',
    minimaxTtsVoice: 'English_expressive_narrator',
    ...overrides,
  };
}
