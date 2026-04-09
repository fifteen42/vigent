import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { VigentNativeBridge, UIElementWithBounds } from '@vigent/native-swift';
import type { VigentConfig } from '../config.js';

// Module-level element map: populated by screenshot_marked, consumed by click_element
let _lastElementMap: Map<number, UIElementWithBounds> = new Map();

export function getLastElementMap(): Map<number, UIElementWithBounds> {
  return _lastElementMap;
}

export function createVisionTools(bridge: VigentNativeBridge, config: VigentConfig): AgentTool<any>[] {
  // ── screenshot ─────────────────────────────────────────────────────────────
  const screenshotTool: AgentTool<any> = {
    name: 'screenshot',
    label: 'Take Screenshot',
    description: 'Capture the current screen. Use screenshot_marked instead when you need to interact with UI elements — it overlays numbered markers so you can click by element ID.',
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

  // ── screenshot_marked (SoM) ────────────────────────────────────────────────
  const screenshotMarkedTool: AgentTool<any> = {
    name: 'screenshot_marked',
    label: 'Screenshot with Element Markers',
    description: [
      'Take a screenshot with numbered markers (Set-of-Mark) overlaid on all interactive UI elements.',
      'Each element gets a blue circle with its ID number.',
      'After calling this, use click_element with the element ID to click precisely.',
      'This is much more reliable than guessing pixel coordinates.',
    ].join(' '),
    parameters: Type.Object({}),
    execute: async (_id: string, _params: any, _signal?: AbortSignal, onUpdate?: any) => {
      onUpdate?.({ content: [{ type: 'text', text: 'Taking screenshot with element markers...' }], details: {} });

      const result = await bridge.screenshotWithMarks(
        config.screenshotQuality,
        config.screenshotMaxWidth,
        config.screenshotMaxWidth,
      );

      // Update the module-level element map
      _lastElementMap = new Map(result.elements.map(el => [el.id, el]));

      // Build a text summary of elements for the model
      const elementSummary = result.elements.length === 0
        ? 'No interactive elements detected in current window.'
        : result.elements.map(el => {
          const label = el.title ? `"${el.title}"` : el.value ? `value="${el.value}"` : '';
          return `#${el.id} ${el.role}${label ? ' ' + label : ''} at (${Math.round(el.centerX)},${Math.round(el.centerY)})`;
        }).join('\n');

      return {
        content: [
          { type: 'image' as const, data: result.base64, mimeType: 'image/jpeg' },
          {
            type: 'text' as const,
            text: `Screen: ${result.width}×${result.height}px | ${result.elements.length} interactive elements:\n${elementSummary}`,
          },
        ],
        details: {
          width: result.width,
          height: result.height,
          elementCount: result.elements.length,
          elements: result.elements,
        },
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

  return [screenshotTool, screenshotMarkedTool, getElementTool, getScreenInfoTool];
}
