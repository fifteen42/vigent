import { readFileSync, statSync } from 'node:fs';
import { basename, extname } from 'node:path';

export interface GeminiFile {
  name: string;
  uri: string;
  mimeType: string;
  sizeBytes: number;
  state: 'PROCESSING' | 'ACTIVE' | 'FAILED';
  expirationTime: string;
}

const MIME_MAP: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.m4v': 'video/x-m4v',
};

function guessMime(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return MIME_MAP[ext] ?? 'video/mp4';
}

/**
 * Upload a video file to Gemini File API (resumable upload).
 * Returned file has state=PROCESSING initially — call waitForActive() before use.
 * File expires after 48 hours.
 */
export async function uploadVideoToGemini(
  videoPath: string,
  apiKey: string,
  onProgress?: (percent: number) => void
): Promise<GeminiFile> {
  const fileData = readFileSync(videoPath);
  const fileSize = statSync(videoPath).size;
  const mimeType = guessMime(videoPath);
  const displayName = basename(videoPath);

  // Step 1: Initialize resumable upload
  const initRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(fileSize),
        'X-Goog-Upload-Header-Content-Type': mimeType,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file: { display_name: displayName } }),
    }
  );

  if (!initRes.ok) throw new Error(`Gemini upload init failed: ${initRes.status}`);
  const uploadUrl = initRes.headers.get('X-Goog-Upload-URL');
  if (!uploadUrl) throw new Error('No upload URL from Gemini');

  // Step 2: Upload file body
  onProgress?.(0);
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(fileSize),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: new Uint8Array(fileData),
  });

  if (!uploadRes.ok) throw new Error(`Gemini upload failed: ${uploadRes.status}`);
  onProgress?.(100);

  const result = await uploadRes.json() as { file: GeminiFile };
  return result.file;
}

/**
 * Poll until file state is ACTIVE (PROCESSING → ACTIVE).
 */
export async function waitForFileActive(
  fileUri: string,
  apiKey: string,
  maxWaitMs = 120_000
): Promise<GeminiFile> {
  const deadline = Date.now() + maxWaitMs;
  const fileName = fileUri.split('/').slice(-2).join('/'); // "files/<id>"

  while (Date.now() < deadline) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`
    );
    if (!res.ok) throw new Error(`Gemini file status check failed: ${res.status}`);
    const file = await res.json() as GeminiFile;

    if (file.state === 'ACTIVE') return file;
    if (file.state === 'FAILED') throw new Error('Gemini file processing failed');

    await sleep(2000);
  }

  throw new Error(`Timeout: Gemini file not ready after ${maxWaitMs}ms`);
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
