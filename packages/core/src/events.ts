/**
 * @vigent/core — Agent event & Gen UI panel types
 *
 * These are the canonical event shapes that any Vigent-compatible agent
 * emits over SSE (or any other transport). The desktop app, web app,
 * or any other consumer subscribes to these to drive its UI.
 *
 * Design principle: platform-agnostic. Nothing here assumes macOS,
 * a specific model provider, or a specific UI framework.
 */

// ── Gen UI Panels ──────────────────────────────────────────────────────────────
// Each panel describes a "task-specific view" the UI should render.
// The agent emits a panel event when it knows what kind of task it's doing.

export type AgentPanel =
  | ScreenMirrorPanel
  | VideoProductionPanel
  | TranscriptPanel
  | ImageGalleryPanel
  | AudioPlayerPanel
  | FileOutputPanel
  | ShellOutputPanel;

/** Live screen mirror — emitted when agent takes a screenshot */
export interface ScreenMirrorPanel {
  kind: 'screen_mirror';
  base64: string;       // JPEG base64
  width: number;
  height: number;
  /** Elements visible on screen with SoM marker IDs */
  elements?: UIElementMark[];
}

export interface UIElementMark {
  id: number;
  role: string;
  title?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Video generation progress */
export interface VideoProductionPanel {
  kind: 'video_production';
  prompt: string;
  status: 'generating' | 'done' | 'failed';
  /** Download URL when done */
  url?: string;
  /** Local file path after download */
  localPath?: string;
  taskId?: string;
}

/** Transcription output — streams text as it arrives */
export interface TranscriptPanel {
  kind: 'transcript';
  /** Full transcript text so far */
  text: string;
  language?: string;
  sourceFile?: string;
}

/** Image generation result */
export interface ImageGalleryPanel {
  kind: 'image_gallery';
  prompt: string;
  urls: string[];
}

/** TTS / audio file output */
export interface AudioPlayerPanel {
  kind: 'audio_player';
  localPath: string;
  text?: string;
  voiceId?: string;
  durationSec?: number;
}

/** Generic file written to disk */
export interface FileOutputPanel {
  kind: 'file_output';
  localPath: string;
  mimeType?: string;
  sizeBytes?: number;
  label?: string;
}

/** Shell command output */
export interface ShellOutputPanel {
  kind: 'shell_output';
  command: string;
  stdout: string;
  stderr?: string;
  exitCode?: number;
}

// ── Agent Events ───────────────────────────────────────────────────────────────
// The full event union streamed from agent → UI over SSE (or IPC).

export type AgentEvent =
  | AgentTextEvent
  | AgentToolStartEvent
  | AgentToolEndEvent
  | AgentPanelEvent
  | AgentStepEvent
  | AgentDoneEvent
  | AgentErrorEvent;

/** Streamed LLM text delta */
export interface AgentTextEvent {
  type: 'text';
  delta: string;
}

/** Agent is about to call a tool */
export interface AgentToolStartEvent {
  type: 'tool_start';
  name: string;
  label: string;
  args: unknown;
}

/** Tool call finished */
export interface AgentToolEndEvent {
  type: 'tool_end';
  name: string;
  durationMs: number;
  isError: boolean;
}

/** Emit a Gen UI panel — the UI should display/update this panel */
export interface AgentPanelEvent {
  type: 'panel';
  panel: AgentPanel;
}

/** Progress update (step N of M) */
export interface AgentStepEvent {
  type: 'step';
  current: number;
  max: number;
  description?: string;
}

/** Task finished successfully */
export interface AgentDoneEvent {
  type: 'done';
  summary?: string;
  actionCount?: number;
}

/** Fatal error */
export interface AgentErrorEvent {
  type: 'error';
  message: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

export type EventCallback = (event: AgentEvent) => void;
