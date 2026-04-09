// API image limits (from Claude Code constants/apiLimits.ts)
export const API_IMAGE_MAX_BASE64_BYTES = 5 * 1024 * 1024;    // 5MB hard cap
export const IMAGE_MAX_DIMENSION = 2000;                        // px
export const IMAGE_TARGET_RAW_BYTES = 3.75 * 1024 * 1024;      // 3.75MB target
export const API_MAX_MEDIA_PER_REQUEST = 100;                   // images per request

// Context management
export const AUTOCOMPACT_BUFFER_TOKENS = 13_000;
export const MAX_CONCURRENT_TOOLS = parseInt(
  process.env.VIGENT_MAX_TOOL_CONCURRENCY ?? '10', 10
);

// Screenshot defaults (same as Claude Code)
export const SCREENSHOT_JPEG_QUALITY = 0.75;
export const SCREENSHOT_MAX_WIDTH = 1280;
