// MiniMax API client for Vigent
// Endpoints from minimax-cli/src/client/endpoints.ts

export interface MinimaxClientConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface VideoGenResponse { task_id: string; base_resp: { status_code: number } }
export interface VideoTaskResponse {
  task_id: string;
  status: 'Queueing' | 'Processing' | 'Success' | 'Failed';
  file_id?: string;
}
export interface FileRetrieveResponse {
  file: { file_id: string; download_url: string; filename: string };
}
export interface ImageGenResponse {
  data: { image_urls: string[]; task_id: string; success_count: number; failed_count: number };
}
export interface SpeechResponse {
  data: { audio: string }; // hex-encoded audio
  extra_info?: { audio_length?: number; audio_sample_rate?: number; audio_size?: number };
}

export class MinimaxClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(cfg: MinimaxClientConfig) {
    this.apiKey = cfg.apiKey;
    this.baseUrl = cfg.baseUrl ?? 'https://api.minimax.io';
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`MiniMax API error ${res.status}: ${text}`);
    }
    const data = await res.json() as T & { base_resp?: { status_code?: number; status_msg?: string } };
    if ((data as any).base_resp?.status_code && (data as any).base_resp.status_code !== 0) {
      throw new Error(`MiniMax API error: ${(data as any).base_resp.status_msg}`);
    }
    return data;
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { 'Authorization': `Bearer ${this.apiKey}` },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`MiniMax API error ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
  }

  // ── Video ─────────────────────────────────────────────────────────────────

  async generateVideo(params: {
    prompt: string;
    model?: string;
    firstFrameImage?: string; // base64 data URI or URL
    callbackUrl?: string;
  }): Promise<string> {
    const body: Record<string, unknown> = {
      model: params.model ?? 'MiniMax-Hailuo-2.3',
      prompt: params.prompt,
    };
    if (params.firstFrameImage) body.first_frame_image = params.firstFrameImage;
    if (params.callbackUrl) body.callback_url = params.callbackUrl;

    const resp = await this.post<VideoGenResponse>('/v1/video_generation', body);
    return resp.task_id;
  }

  async queryVideoTask(taskId: string): Promise<VideoTaskResponse> {
    return this.get<VideoTaskResponse>(`/v1/query/video_generation?task_id=${taskId}`);
  }

  async retrieveFile(fileId: string): Promise<FileRetrieveResponse> {
    return this.get<FileRetrieveResponse>(`/v1/files/retrieve?file_id=${fileId}`);
  }

  /** Poll until Success or Failed. Returns download URL. */
  async waitForVideo(
    taskId: string,
    opts: { intervalMs?: number; timeoutMs?: number; onStatus?: (s: string) => void } = {}
  ): Promise<string> {
    const { intervalMs = 5000, timeoutMs = 300_000, onStatus } = opts;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const task = await this.queryVideoTask(taskId);
      onStatus?.(task.status);

      if (task.status === 'Success') {
        if (!task.file_id) throw new Error('Task succeeded but no file_id');
        const file = await this.retrieveFile(task.file_id);
        return file.file.download_url;
      }
      if (task.status === 'Failed') {
        throw new Error(`Video generation failed (task_id: ${taskId})`);
      }

      await sleep(intervalMs);
    }
    throw new Error(`Video generation timed out after ${timeoutMs}ms`);
  }

  // ── Image ─────────────────────────────────────────────────────────────────

  async generateImage(params: {
    prompt: string;
    aspectRatio?: string;
    n?: number;
  }): Promise<string[]> {
    const body: Record<string, unknown> = {
      model: 'image-01',
      prompt: params.prompt,
      n: params.n ?? 1,
    };
    if (params.aspectRatio) body.aspect_ratio = params.aspectRatio;

    const resp = await this.post<ImageGenResponse>('/v1/image_generation', body);
    return resp.data.image_urls;
  }

  // ── TTS ───────────────────────────────────────────────────────────────────

  async synthesizeSpeech(params: {
    text: string;
    voiceId?: string;
    model?: string;
    speed?: number;
    volume?: number;
    pitch?: number;
    format?: string;
    sampleRate?: number;
  }): Promise<Buffer> {
    const body = {
      model: params.model ?? 'speech-2.8-hd',
      text: params.text,
      voice_setting: {
        voice_id: params.voiceId ?? 'English_expressive_narrator',
        speed: params.speed,
        vol: params.volume,
        pitch: params.pitch,
      },
      audio_setting: {
        format: params.format ?? 'mp3',
        sample_rate: params.sampleRate ?? 32_000,
        bitrate: 128_000,
        channel: 1,
      },
      output_format: 'hex',
    };

    const resp = await this.post<SpeechResponse>('/v1/t2a_v2', body);
    return Buffer.from(resp.data.audio, 'hex');
  }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
