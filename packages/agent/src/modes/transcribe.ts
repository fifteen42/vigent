import { statSync, existsSync } from 'node:fs';
import { extname } from 'node:path';
import type { VigentConfig } from '../config.js';

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

function getMimeType(filePath: string): string | null {
  const ext = extname(filePath).toLowerCase();
  return AUDIO_MIME[ext] ?? VIDEO_MIME[ext] ?? null;
}

export async function runTranscribe(
  filePath: string,
  config: VigentConfig,
  opts: { language?: string; prompt?: string } = {}
) {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const mimeType = getMimeType(filePath);
  if (!mimeType) {
    const ext = extname(filePath);
    throw new Error(
      `Unsupported file format: ${ext}\nSupported: ${[...Object.keys(AUDIO_MIME), ...Object.keys(VIDEO_MIME)].join(', ')}`
    );
  }

  if (!config.googleApiKey) {
    throw new Error('GOOGLE_API_KEY (or GEMINI_API_KEY) required for transcription.');
  }

  const fileSize = statSync(filePath).size;
  const isAudio = mimeType.startsWith('audio/');
  const mediaType = isAudio ? 'audio' : 'video';

  process.stderr.write(`[Transcribe] Uploading ${mediaType} (${(fileSize / 1024 / 1024).toFixed(1)} MB)...\n`);

  // Upload to Gemini File API
  const { uploadVideoToGemini, waitForFileActive } = await import('@vigent/video');
  const uploaded = await uploadVideoToGemini(filePath, config.googleApiKey, (pct) => {
    process.stderr.write(`[Transcribe] Upload ${pct}%\r`);
  });
  process.stderr.write('\n[Transcribe] Processing...\n');

  const file = await waitForFileActive(uploaded.uri, config.googleApiKey);
  process.stderr.write('[Transcribe] Ready. Transcribing...\n\n');

  // Build transcription prompt
  const langNote = opts.language ? ` Transcribe in ${opts.language}.` : '';
  const extraNote = opts.prompt ? ` ${opts.prompt}` : '';
  const instructions = `Please transcribe all spoken content in this ${mediaType} file accurately.${langNote}${extraNote}
Include speaker labels if multiple speakers are present (e.g. "Speaker 1:", "Speaker 2:").
Include timestamps every 30 seconds in [MM:SS] format.
Preserve natural punctuation.
Output only the transcription — no commentary or metadata.`;

  // Call Gemini with File API reference
  const model = 'gemini-2.5-pro';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${config.googleApiKey}`;

  const body = {
    contents: [{
      role: 'user',
      parts: [
        { fileData: { fileUri: file.uri, mimeType: file.mimeType } },
        { text: instructions },
      ],
    }],
    generationConfig: { maxOutputTokens: 16384 },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Gemini API error ${res.status}: ${text}`);
  }

  // Stream SSE response
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;
      try {
        const chunk = JSON.parse(data);
        const text = chunk?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) process.stdout.write(text);
      } catch {
        // ignore parse errors
      }
    }
  }

  process.stdout.write('\n');
}
