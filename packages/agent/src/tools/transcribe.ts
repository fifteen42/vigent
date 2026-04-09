import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { existsSync, statSync } from 'node:fs';
import { extname, resolve } from 'node:path';

const AUDIO_MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.opus': 'audio/opus',
  '.webm': 'audio/webm',
};

const VIDEO_MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.m4v': 'video/x-m4v',
};

const SUPPORTED_EXTS = [...Object.keys(AUDIO_MIME), ...Object.keys(VIDEO_MIME)].join(', ');

function getMimeType(filePath: string): string | null {
  const ext = extname(filePath).toLowerCase();
  return AUDIO_MIME[ext] ?? VIDEO_MIME[ext] ?? null;
}

export function createTranscribeTool(googleApiKey: string | undefined): AgentTool<any> | null {
  if (!googleApiKey) return null;

  return {
    name: 'transcribe_audio',
    label: 'Transcribe Audio/Video',
    description: [
      'Transcribe speech from an audio or video file using Gemini.',
      'Supports: mp3, wav, m4a, aac, ogg, flac, opus, webm, mp4, mov, mkv.',
      'Returns a timestamped transcript with speaker labels.',
      'Use this when the user provides a recording they want transcribed.',
    ].join(' '),
    parameters: Type.Object({
      filePath: Type.String({
        description: 'Absolute or home-relative path to the audio/video file (e.g. ~/Desktop/recording.m4a)',
      }),
      language: Type.Optional(Type.String({
        description: 'Language hint, e.g. "Chinese", "English", "Japanese" (default: auto-detect)',
      })),
      prompt: Type.Optional(Type.String({
        description: 'Context hint to improve accuracy, e.g. domain-specific terms or speaker names',
      })),
    }),
    execute: async (_id: string, params: any) => {
      // Expand ~ in path
      const rawPath = params.filePath.replace(/^~/, process.env.HOME ?? '');
      const filePath = resolve(rawPath);

      if (!existsSync(filePath)) {
        return {
          content: [{ type: 'text' as const, text: `File not found: ${filePath}` }],
          details: { error: 'File not found', filePath },
        };
      }

      const mimeType = getMimeType(filePath);
      if (!mimeType) {
        const ext = extname(filePath);
        return {
          content: [{ type: 'text' as const, text: `Unsupported format: ${ext}\nSupported: ${SUPPORTED_EXTS}` }],
          details: { error: 'Unsupported format', ext },
        };
      }

      const fileSize = statSync(filePath).size;
      const isAudio = mimeType.startsWith('audio/');
      const mediaType = isAudio ? 'audio' : 'video';

      try {
        const { uploadVideoToGemini, waitForFileActive } = await import('@vigent/video');

        // Upload file to Gemini File API
        const uploaded = await uploadVideoToGemini(filePath, googleApiKey!, (_pct) => {});
        const activeFile = await waitForFileActive(uploaded.name, googleApiKey!);

        // Build Gemini request
        const langInstruction = params.language
          ? `Transcribe in ${params.language}.`
          : 'Auto-detect language.';
        const promptContext = params.prompt ? ` Context: ${params.prompt}.` : '';

        const systemInstruction = [
          `Transcribe the ${mediaType} exactly as spoken.`,
          langInstruction,
          promptContext,
          'Add timestamps every 30 seconds in [MM:SS] format.',
          'If multiple speakers, label them Speaker 1, Speaker 2, etc.',
          'Output only the transcript — no preamble or commentary.',
        ].join(' ');

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${googleApiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              system_instruction: { parts: [{ text: systemInstruction }] },
              contents: [{
                parts: [{
                  fileData: {
                    mimeType,
                    fileUri: activeFile.uri,
                  },
                }],
              }],
              generationConfig: { temperature: 0.1 },
            }),
          }
        );

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Gemini API error: ${response.status} ${errText.slice(0, 300)}`);
        }

        const data = await response.json() as any;
        const transcript = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '(no transcript)';
        const sizeMB = (fileSize / 1024 / 1024).toFixed(1);

        return {
          content: [{ type: 'text' as const, text: transcript }],
          details: {
            transcript,
            filePath,
            mimeType,
            sizeMB,
            language: params.language ?? 'auto',
            sourceFile: filePath.split('/').pop(),
          },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: `Transcription failed: ${msg}` }],
          details: { error: msg, filePath },
        };
      }
    },
  };
}
