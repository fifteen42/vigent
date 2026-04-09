import type { AgentMessage } from '@mariozechner/pi-agent-core';

// Token estimation
// base64Chars → bytes: bytes = chars × 0.75
// bytes → tokens (Anthropic): tokens ≈ bytes × 2
// text: ~4 chars per token
export function estimateTokens(messages: AgentMessage[]): number {
  let total = 0;
  for (const msg of messages as any[]) {
    if (!msg.content) continue;
    const blocks = Array.isArray(msg.content) ? msg.content : [{ type: 'text', text: String(msg.content) }];
    for (const block of blocks) {
      if (block.type === 'text') {
        total += (block.text?.length ?? 0) / 4;
      } else if (block.type === 'image') {
        // base64Chars × 0.75 = bytes; bytes × 2 ≈ tokens
        total += (block.data?.length ?? 0) * 0.75 * 2;
      }
    }
  }
  return Math.round(total);
}

export interface PruneOptions {
  keepRecentScreenshots?: number;  // keep last N screenshots, default 3
  maxTokens?: number;              // trigger threshold, default 100_000
}

/**
 * Replace old screenshot images with [image] placeholder.
 * Same pattern as Claude Code's stripImagesFromMessages().
 */
export async function pruneScreenshots(
  messages: AgentMessage[],
  opts: PruneOptions = {}
): Promise<AgentMessage[]> {
  const { keepRecentScreenshots = 3, maxTokens = 100_000 } = opts;

  if (estimateTokens(messages) < maxTokens) return messages;

  // Find indices of tool result messages that contain images
  const screenshotIndices: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i] as any;
    if (msg.role === 'toolResult' || msg.role === 'user') {
      const blocks = Array.isArray(msg.content) ? msg.content : [];
      if (blocks.some((b: any) => b.type === 'image')) {
        screenshotIndices.push(i);
      }
    }
  }

  const keepFrom = screenshotIndices.length - keepRecentScreenshots;
  const toPrune = new Set(screenshotIndices.slice(0, Math.max(0, keepFrom)));

  return messages.map((msg, i) => {
    if (!toPrune.has(i)) return msg;
    const m = msg as any;
    const newContent = (Array.isArray(m.content) ? m.content : []).map((b: any) =>
      b.type === 'image' ? { type: 'text', text: '[image]' } : b
    );
    return { ...m, content: newContent };
  }) as AgentMessage[];
}
