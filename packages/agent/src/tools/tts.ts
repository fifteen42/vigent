import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { MinimaxClient } from '../client/minimax.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function createTtsTool(client: MinimaxClient): AgentTool<any> {
  return {
    name: 'text_to_speech',
    label: 'Text to Speech',
    description: 'Convert text to speech using MiniMax TTS. Saves audio file and returns path.',
    parameters: Type.Object({
      text: Type.String({ description: 'Text to convert to speech' }),
      outputPath: Type.String({ description: 'Output file path, e.g. ./output.mp3' }),
      voiceId: Type.Optional(Type.String({
        description: 'Voice ID. Options: English_expressive_narrator (default), Bowen-ZH, Ruoruo-ZH, Xiaoyi-ZH, etc.',
      })),
      model: Type.Optional(Type.String({ description: 'TTS model (default: speech-2.8-hd)' })),
      speed: Type.Optional(Type.Number({ description: 'Speech speed multiplier (0.5-2.0, default: 1.0)' })),
    }),
    execute: async (_id: string, params: any, _signal?: AbortSignal, onUpdate?: any) => {
      onUpdate?.({ content: [{ type: 'text', text: `[MiniMax TTS] Synthesizing ${params.text.length} chars...` }], details: { status: 'synthesizing' } });

      const audioBuffer = await client.synthesizeSpeech({
        text: params.text,
        voiceId: params.voiceId,
        model: params.model,
        speed: params.speed,
      });

      const dir = dirname(params.outputPath);
      if (dir && dir !== '.') mkdirSync(dir, { recursive: true });
      writeFileSync(params.outputPath, new Uint8Array(audioBuffer));

      return {
        content: [{ type: 'text' as const, text: `Speech saved to: ${params.outputPath} (${audioBuffer.length} bytes)` }],
        details: { path: params.outputPath, sizeBytes: audioBuffer.length, voice: params.voiceId },
      };
    },
  };
}
