import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface, type Interface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BINARY_PATH = join(__dirname, '..', '.build', 'release', 'vigent-native');

interface NativeResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

interface ScreenshotData {
  base64: string;
  width: number;
  height: number;
  displayId: number;
}

interface AppInfoData {
  name: string;
  bundleId: string;
}

interface UIElementData {
  role: string;
  title?: string;
  value?: string;
  description?: string;
}

class VigentNativeBridge {
  private process: ChildProcess | null = null;
  private readline: Interface | null = null;
  private pending: Array<{
    resolve: (value: NativeResponse) => void;
    reject: (error: Error) => void;
  }> = [];

  start(): void {
    if (this.process) return;

    this.process = spawn(BINARY_PATH, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.readline = createInterface({ input: this.process.stdout! });
    this.readline.on('line', (line: string) => {
      const pending = this.pending.shift();
      if (pending) {
        try {
          pending.resolve(JSON.parse(line));
        } catch {
          pending.reject(new Error(`Invalid JSON: ${line}`));
        }
      }
    });

    this.process.on('exit', () => {
      this.process = null;
      this.readline = null;
      for (const p of this.pending) {
        p.reject(new Error('Native process exited'));
      }
      this.pending = [];
    });
  }

  stop(): void {
    this.process?.kill();
    this.process = null;
    this.readline = null;
  }

  private send(action: string, params?: Record<string, unknown>): Promise<NativeResponse> {
    if (!this.process?.stdin) {
      throw new Error('Native process not started. Call start() first.');
    }

    return new Promise((resolve, reject) => {
      this.pending.push({ resolve, reject });
      const command = JSON.stringify({ action, params });
      this.process!.stdin!.write(command + '\n');
    });
  }

  async screenshot(
    quality = 0.75,
    maxWidth = 1280,
    maxHeight = 800
  ): Promise<ScreenshotData> {
    const res = await this.send('screenshot', { quality, maxWidth, maxHeight });
    if (!res.success) throw new Error(res.error ?? 'Screenshot failed');
    return res.data as ScreenshotData;
  }

  async getFrontmostApp(): Promise<AppInfoData> {
    const res = await this.send('frontmost_app');
    if (!res.success) throw new Error(res.error ?? 'Failed to get frontmost app');
    return res.data as AppInfoData;
  }

  async listRunningApps(): Promise<AppInfoData[]> {
    const res = await this.send('running_apps');
    if (!res.success) throw new Error(res.error ?? 'Failed to list apps');
    return res.data as AppInfoData[];
  }

  async openApp(name: string): Promise<void> {
    const res = await this.send('open_app', { name });
    if (!res.success) throw new Error(res.error ?? `Failed to open ${name}`);
  }

  async openAppByBundleId(bundleId: string): Promise<void> {
    const res = await this.send('open_app_bundle', { bundleId });
    if (!res.success) throw new Error(res.error ?? `Failed to open ${bundleId}`);
  }

  async getElementAtPoint(x: number, y: number): Promise<UIElementData> {
    const res = await this.send('element_at_point', { x, y });
    if (!res.success) throw new Error(res.error ?? 'No element at point');
    return res.data as UIElementData;
  }

  async getWindowTitle(): Promise<string> {
    const res = await this.send('window_title');
    if (!res.success) throw new Error(res.error ?? 'No window title');
    return res.data as string;
  }

  async checkAccessibility(): Promise<boolean> {
    const res = await this.send('check_accessibility');
    if (!res.success) throw new Error(res.error ?? 'Check failed');
    return res.data as boolean;
  }

  async startRecording(): Promise<void> {
    const res = await this.send('start_recording');
    if (!res.success) throw new Error(res.error ?? 'Failed to start recording');
  }

  async stopRecording(): Promise<RecordedEventData[]> {
    const res = await this.send('stop_recording');
    if (!res.success) throw new Error(res.error ?? 'Failed to stop recording');
    return (res.data as RecordedEventData[]) ?? [];
  }

  async pollEvents(): Promise<RecordedEventData[]> {
    const res = await this.send('poll_events');
    if (!res.success) throw new Error(res.error ?? 'Failed to poll events');
    return (res.data as RecordedEventData[]) ?? [];
  }
}

interface RecordedEventData {
  timestamp: number;
  type: string;
  x?: number;
  y?: number;
  button?: string;
  clickCount?: number;
  key?: string;
  keyCode?: number;
  modifiers: string[];
  scrollDeltaX?: number;
  scrollDeltaY?: number;
}

export { VigentNativeBridge };
export type { ScreenshotData, AppInfoData, UIElementData, RecordedEventData };
