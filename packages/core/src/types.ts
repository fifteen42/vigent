export interface ActionEvent {
  timestamp: number;
  type: 'click' | 'double_click' | 'right_click' | 'key' | 'scroll' | 'drag';
  coordinates?: { x: number; y: number };
  key?: string;
  modifiers?: string[];
  scrollDelta?: { dx: number; dy: number };
  dragTo?: { x: number; y: number };
  app: string;
  windowTitle: string;
  uiElement?: string;
  screenshotPath: string;
}

export interface ActionLog {
  id: string;
  startTime: number;
  endTime: number;
  events: ActionEvent[];
}

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
