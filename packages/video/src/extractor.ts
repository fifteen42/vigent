import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdir, rm } from 'node:fs/promises';

const execFileAsync = promisify(execFile);

export interface VideoInfo {
  durationSeconds: number;
  width: number;
  height: number;
  fps: number;
  fileSizeBytes: number;
  codec: string;
}

export interface ExtractedFrame {
  index: number;
  timestampSeconds: number;
  base64: string;
  mimeType: 'image/jpeg';
}

export async function getVideoInfo(videoPath: string): Promise<VideoInfo> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_streams', '-show_format',
    videoPath,
  ]);

  const info = JSON.parse(stdout);
  const vs = info.streams.find((s: any) => s.codec_type === 'video');
  if (!vs) throw new Error(`No video stream found in ${videoPath}`);

  const [fpNum, fpDen] = (vs.r_frame_rate as string).split('/').map(Number);
  const fps = fpNum! / (fpDen || 1);

  return {
    durationSeconds: parseFloat(info.format.duration),
    width: vs.width,
    height: vs.height,
    fps,
    fileSizeBytes: parseInt(info.format.size, 10),
    codec: vs.codec_name,
  };
}

export async function extractFrames(
  videoPath: string,
  opts: {
    frameCount?: number;     // total frames, default 8
    maxWidth?: number;       // scale width, default 1280
    quality?: number;        // ffmpeg JPEG quality 1-31 (lower=better), default 3
    startSeconds?: number;
    endSeconds?: number;
  } = {}
): Promise<ExtractedFrame[]> {
  const { frameCount = 8, maxWidth = 1280, quality = 3 } = opts;
  const info = await getVideoInfo(videoPath);

  const start = opts.startSeconds ?? 0;
  const end = opts.endSeconds ?? info.durationSeconds;
  const duration = end - start;

  const outDir = join(tmpdir(), `vigent-frames-${Date.now()}`);
  await mkdir(outDir, { recursive: true });

  try {
    const targetFps = frameCount / duration;

    await execFileAsync('ffmpeg', [
      '-ss', String(start),
      '-to', String(end),
      '-i', videoPath,
      '-vf', `fps=${targetFps.toFixed(4)},scale=${maxWidth}:-2`,
      '-q:v', String(quality),
      '-frames:v', String(frameCount),
      join(outDir, 'frame_%04d.jpg'),
    ]);

    const frames: ExtractedFrame[] = [];
    for (let i = 1; i <= frameCount; i++) {
      const framePath = join(outDir, `frame_${String(i).padStart(4, '0')}.jpg`);
      if (!existsSync(framePath)) break;

      const data = readFileSync(framePath);
      frames.push({
        index: i - 1,
        timestampSeconds: start + duration * ((i - 1) / Math.max(1, frameCount - 1)),
        base64: data.toString('base64'),
        mimeType: 'image/jpeg',
      });
    }

    return frames;
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
}

export async function videoToImageContents(
  videoPath: string,
  frameCount = 8
): Promise<Array<{ type: 'image'; data: string; mimeType: string }>> {
  const frames = await extractFrames(videoPath, { frameCount });
  return frames.map(f => ({ type: 'image' as const, data: f.base64, mimeType: f.mimeType }));
}

/** Short video check: < 30s AND < 10MB */
export async function isShortVideo(videoPath: string): Promise<boolean> {
  const info = await getVideoInfo(videoPath);
  return info.durationSeconds < 30 && info.fileSizeBytes < 10 * 1024 * 1024;
}
