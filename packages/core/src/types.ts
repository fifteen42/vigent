// Vigent shared types
// Recording/replay types removed — Vigent is now a native multimodal agent

export interface ScreenshotResult {
  base64: string;
  width: number;
  height: number;
  displayId: number;
}

export interface MousePosition {
  x: number;
  y: number;
}

export type MouseButton = 'left' | 'right' | 'middle';

export interface AppInfo {
  name: string;
  bundleId: string;
}

export interface UIElement {
  role: string;
  title?: string;
  value?: string;
  description?: string;
}

export interface ScreenInfo {
  frontmostApp: AppInfo;
  windowTitle: string;
  screenWidth: number;
  screenHeight: number;
  mousePosition: MousePosition;
  runningApps: AppInfo[];
}
