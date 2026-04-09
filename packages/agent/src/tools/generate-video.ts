import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { MinimaxClient } from '../client/minimax.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { tmpdir } from 'node:os';

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.webp': 'image/webp',
};

export function createGenerateVideoTool(client: MinimaxClient): AgentTool<any> {
  return {
    name: 'generate_video',
    label: 'Generate Video',
    description: 'Generate a video from text description using MiniMax Hailuo-2.3. Takes 1-3 minutes.',
    parameters: Type.Object({
      prompt: Type.String({ description: 'Video content description in English (more detail = better result)' }),
      firstFramePath: Type.Optional(Type.String({ description: 'Local image path or URL for first frame control' })),
      downloadPath: Type.Optional(Type.String({ description: 'Save path for the video, e.g. ./output.mp4' })),
      model: Type.Optional(Type.String({ description: 'Model: MiniMax-Hailuo-2.3 (default) or MiniMax-Hailuo-2.3-Fast' })),
      noWait: Type.Optional(Type.Boolean({ description: 'Return task ID immediately without waiting (default: false)' })),
    }),
    execute: async (_id: string, params: any, _signal?: AbortSignal, onUpdate?: any) => {
      onUpdate?.({ content: [{ type: 'text', text: '[MiniMax] Submitting video generation...' }], details: { status: 'submitting' } });

      let firstFrameImage: string | undefined;
      if (params.firstFramePath) {
        if (params.firstFramePath.startsWith('http')) {
          firstFrameImage = params.firstFramePath;
        } else {
          const { readFileSync } = await import('node:fs');
          const imgData = readFileSync(params.firstFramePath);
          const ext = extname(params.firstFramePath).toLowerCase();
          const mime = MIME_TYPES[ext] ?? 'image/jpeg';
          firstFrameImage = `data:${mime};base64,${imgData.toString('base64')}`;
        }
      }

      const taskId = await client.generateVideo({
        prompt: params.prompt,
        model: params.model,
        firstFrameImage,
      });

      if (params.noWait) {
        return {
          content: [{ type: 'text' as const, text: `Video task submitted. Task ID: ${taskId}` }],
          details: { taskId, status: 'submitted' },
        };
      }

      onUpdate?.({ content: [{ type: 'text', text: `[MiniMax] Task ${taskId} — waiting for completion...` }], details: { taskId, status: 'processing' } });

      const downloadUrl = await client.waitForVideo(taskId, {
        onStatus: (s: string) => onUpdate?.({ content: [{ type: 'text', text: `[MiniMax] Status: ${s}` }], details: { taskId, status: s } }),
      });

      const destPath = params.downloadPath ?? join(tmpdir(), 'vigent-video', `${taskId}.mp4`);
      mkdirSync(dirname(destPath), { recursive: true });

      const res = await fetch(downloadUrl);
      if (!res.ok) throw new Error(`Failed to download video: ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(destPath, new Uint8Array(buf));

      return {
        content: [{ type: 'text' as const, text: `Video saved to: ${destPath} (${formatBytes(buf.length)})` }],
        details: { taskId, path: destPath, sizeBytes: buf.length },
      };
    },
  };
}

function formatBytes(n: number) { return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.round(n / 1024)}KB`; }
