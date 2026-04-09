// Platform-agnostic types — usable by any Vigent-compatible agent or UI

export type {
  ScreenshotResult,
  MousePosition,
  MouseButton,
  AppInfo,
  UIElement,
  ScreenInfo,
} from './types.js';

export type {
  // Gen UI panels
  AgentPanel,
  ScreenMirrorPanel,
  VideoProductionPanel,
  TranscriptPanel,
  ImageGalleryPanel,
  AudioPlayerPanel,
  FileOutputPanel,
  ShellOutputPanel,
  WebSearchPanel,
  WebContentPanel,
  UIElementMark,

  // Agent event stream
  AgentEvent,
  AgentTextEvent,
  AgentToolStartEvent,
  AgentToolEndEvent,
  AgentPanelEvent,
  AgentStepEvent,
  AgentDoneEvent,
  AgentErrorEvent,

  // Utility
  EventCallback,
} from './events.js';
