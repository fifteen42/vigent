import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { MinimaxClient } from '../client/minimax.js';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export function createGenerateImageTool(client: MinimaxClient): AgentTool<any> {
  return {
    name: 'generate_image',
    label: 'Generate Image',
    description: 'Generate images from text using MiniMax image-01 model. Returns image content directly.',
    parameters: Type.Object({
      prompt: Type.String({ description: 'Image description' }),
      aspectRatio: Type.Optional(Type.String({ description: 'Aspect ratio: 1:1 (default), 16:9, 9:16, 4:3, 3:4' })),
      n: Type.Optional(Type.Number({ description: 'Number of images (default: 1, max: 4)' })),
      downloadDir: Type.Optional(Type.String({ description: 'Directory to save images (default: current dir)' })),
    }),
    execute: async (_id: string, params: any, _signal?: AbortSignal, onUpdate?: any) => {
      onUpdate?.({ content: [{ type: 'text', text: '[MiniMax] Generating image...' }], details: { status: 'generating' } });

      const imageUrls = await client.generateImage({
        prompt: params.prompt,
        aspectRatio: params.aspectRatio,
        n: params.n ?? 1,
      });

      if (imageUrls.length === 0) throw new Error('MiniMax returned no images');

      const outDir = params.downloadDir ?? '.';
      if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

      const savedPaths: string[] = [];
      const imageContents: Array<{ type: 'image'; data: string; mimeType: string }> = [];

      for (let i = 0; i < imageUrls.length; i++) {
        const res = await fetch(imageUrls[i]!);
        if (!res.ok) throw new Error(`Failed to download image ${i}: ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        const base64 = buf.toString('base64');

        const filename = `image_${String(i + 1).padStart(3, '0')}.jpg`;
        const destPath = join(outDir, filename);
        writeFileSync(destPath, new Uint8Array(buf));
        savedPaths.push(destPath);

        imageContents.push({ type: 'image' as const, data: base64, mimeType: 'image/jpeg' });
      }

      return {
        content: [
          ...imageContents,
          { type: 'text' as const, text: `Generated ${imageUrls.length} image(s). Saved to: ${savedPaths.join(', ')}` },
        ],
        details: { paths: savedPaths, count: savedPaths.length },
      };
    },
  };
}
