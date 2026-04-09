import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { VigentNativeBridge } from '@vigent/native-swift';
import type { VigentConfig } from '../config.js';

export function createVisionTools(bridge: VigentNativeBridge, config: VigentConfig): AgentTool<any>[] {
  // ── screenshot ─────────────────────────────────────────────────────────────
  const screenshotTool: AgentTool<any> = {
    name: 'screenshot',
    label: 'Take Screenshot',
    description: 'Capture the current screen. Always call this first to observe state before acting.',
    parameters: Type.Object({
      displayId: Type.Optional(Type.Number({ description: 'Display ID (default: primary)' })),
    }),
    execute: async (_id: string, _params: any, _signal?: AbortSignal, onUpdate?: any) => {
      onUpdate?.({ content: [{ type: 'text', text: 'Taking screenshot...' }], details: {} });
      const result = await bridge.screenshot(
        config.screenshotQuality,
        config.screenshotMaxWidth,
        config.screenshotMaxWidth,
      );
      return {
        content: [
          { type: 'image' as const, data: result.base64, mimeType: 'image/jpeg' },
          { type: 'text' as const, text: `Screen: ${result.width}×${result.height}px` },
        ],
        details: { width: result.width, height: result.height, displayId: result.displayId },
      };
    },
  };

  // ── get_element_at ─────────────────────────────────────────────────────────
  const getElementTool: AgentTool<any> = {
    name: 'get_element_at',
    label: 'Get UI Element',
    description: 'Get the UI element (button, input, etc.) at screen coordinates using Accessibility API.',
    parameters: Type.Object({
      x: Type.Number({ description: 'Screen X coordinate' }),
      y: Type.Number({ description: 'Screen Y coordinate' }),
    }),
    execute: async (_id: string, params: any) => {
      const el = await bridge.getElementAtPoint(params.x, params.y);
      const summary = [
        `role: ${el.role}`,
        el.title ? `title: "${el.title}"` : null,
        el.value ? `value: "${el.value}"` : null,
        el.description ? `desc: "${el.description}"` : null,
      ].filter(Boolean).join(', ');
      return {
        content: [{ type: 'text' as const, text: summary || 'No element found' }],
        details: el,
      };
    },
  };

  // ── get_screen_info ────────────────────────────────────────────────────────
  const getScreenInfoTool: AgentTool<any> = {
    name: 'get_screen_info',
    label: 'Get Screen Info',
    description: 'Get current screen state: frontmost app, window title, running apps, mouse position.',
    parameters: Type.Object({}),
    execute: async () => {
      const [frontmost, apps] = await Promise.all([
        bridge.getFrontmostApp(),
        bridge.listRunningApps(),
      ]);
      const title = await bridge.getWindowTitle().catch(() => '');
      const info = {
        frontmostApp: frontmost.name,
        bundleId: frontmost.bundleId,
        windowTitle: title,
        runningApps: apps.map((a: any) => a.name).join(', '),
      };
      const text = `App: ${info.frontmostApp} (${info.bundleId})\nWindow: ${info.windowTitle}\nRunning: ${info.runningApps}`;
      return {
        content: [{ type: 'text' as const, text }],
        details: info,
      };
    },
  };

  return [screenshotTool, getElementTool, getScreenInfoTool];
}
