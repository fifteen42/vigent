import { Type } from '@sinclair/typebox';
import { VigentNativeBridge } from '@vigent/native-swift';

// These will be initialized when the agent starts
let nativeInput: typeof import('@vigent/native-input');
let nativeBridge: VigentNativeBridge;

export function initTools(input: typeof import('@vigent/native-input'), bridge: VigentNativeBridge) {
  nativeInput = input;
  nativeBridge = bridge;
}

export const screenshotTool = {
  name: 'screenshot',
  description: 'Capture the current screen. Returns the screenshot as an image for analysis.',
  parameters: Type.Object({}),
  execute: async () => {
    const result = await nativeBridge.screenshot(0.75, 1280, 800);
    return {
      content: [
        {
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: 'image/jpeg' as const,
            data: result.base64,
          },
        },
        {
          type: 'text' as const,
          text: `Screenshot captured: ${result.width}x${result.height}`,
        },
      ],
    };
  },
};

export const clickTool = {
  name: 'click',
  description: 'Click at screen coordinates.',
  parameters: Type.Object({
    x: Type.Number({ description: 'Screen X coordinate' }),
    y: Type.Number({ description: 'Screen Y coordinate' }),
    button: Type.Optional(
      Type.Union([Type.Literal('left'), Type.Literal('right'), Type.Literal('middle')])
    ),
    count: Type.Optional(Type.Number({ description: 'Click count, 2 = double click' })),
  }),
  execute: async (_id: string, params: { x: number; y: number; button?: string; count?: number }) => {
    nativeInput.moveMouse(params.x, params.y);
    await sleep(50);
    nativeInput.mouseClick(params.button ?? 'left', params.count ?? 1);
    return {
      content: [{ type: 'text' as const, text: `Clicked ${params.button ?? 'left'} at (${params.x}, ${params.y})` }],
    };
  },
};

export const typeTextTool = {
  name: 'type_text',
  description: 'Type text using the keyboard.',
  parameters: Type.Object({
    text: Type.String({ description: 'Text to type' }),
  }),
  execute: async (_id: string, params: { text: string }) => {
    nativeInput.typeText(params.text);
    return {
      content: [{ type: 'text' as const, text: `Typed: "${params.text}"` }],
    };
  },
};

export const pressKeyTool = {
  name: 'press_key',
  description: 'Press a single key. Supported: return, tab, escape, space, backspace, up, down, left, right, f1-f12, etc.',
  parameters: Type.Object({
    key: Type.String({ description: 'Key name (e.g., "return", "tab", "escape")' }),
  }),
  execute: async (_id: string, params: { key: string }) => {
    nativeInput.pressKey(params.key);
    return {
      content: [{ type: 'text' as const, text: `Pressed key: ${params.key}` }],
    };
  },
};

export const pressKeysTool = {
  name: 'press_keys',
  description: 'Press a key combination. Example: ["command", "c"] for Cmd+C, ["command", "shift", "s"] for Cmd+Shift+S.',
  parameters: Type.Object({
    keys: Type.Array(Type.String(), { description: 'Keys to press together' }),
  }),
  execute: async (_id: string, params: { keys: string[] }) => {
    nativeInput.pressKeys(params.keys);
    return {
      content: [{ type: 'text' as const, text: `Pressed keys: ${params.keys.join('+')}` }],
    };
  },
};

export const scrollTool = {
  name: 'scroll',
  description: 'Scroll at the current mouse position.',
  parameters: Type.Object({
    dx: Type.Optional(Type.Number({ description: 'Horizontal scroll (positive = right)' })),
    dy: Type.Optional(Type.Number({ description: 'Vertical scroll (positive = down)' })),
  }),
  execute: async (_id: string, params: { dx?: number; dy?: number }) => {
    nativeInput.mouseScroll(params.dx ?? 0, params.dy ?? 0);
    return {
      content: [{ type: 'text' as const, text: `Scrolled dx=${params.dx ?? 0}, dy=${params.dy ?? 0}` }],
    };
  },
};

export const dragTool = {
  name: 'drag',
  description: 'Drag from one point to another.',
  parameters: Type.Object({
    fromX: Type.Number(),
    fromY: Type.Number(),
    toX: Type.Number(),
    toY: Type.Number(),
  }),
  execute: async (_id: string, params: { fromX: number; fromY: number; toX: number; toY: number }) => {
    nativeInput.moveMouse(params.fromX, params.fromY);
    await sleep(50);
    nativeInput.mouseDown('left');
    await sleep(50);

    // Animate the drag
    const steps = 20;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = Math.round(params.fromX + (params.toX - params.fromX) * t);
      const y = Math.round(params.fromY + (params.toY - params.fromY) * t);
      nativeInput.moveMouse(x, y);
      await sleep(16);
    }

    nativeInput.mouseUp('left');
    return {
      content: [{
        type: 'text' as const,
        text: `Dragged from (${params.fromX}, ${params.fromY}) to (${params.toX}, ${params.toY})`,
      }],
    };
  },
};

export const openAppTool = {
  name: 'open_app',
  description: 'Open a macOS application by name (e.g., "Safari", "TextEdit", "Terminal").',
  parameters: Type.Object({
    name: Type.String({ description: 'Application name' }),
  }),
  execute: async (_id: string, params: { name: string }) => {
    await nativeBridge.openApp(params.name);
    await sleep(1000);
    return {
      content: [{ type: 'text' as const, text: `Opened app: ${params.name}` }],
    };
  },
};

export const waitTool = {
  name: 'wait',
  description: 'Wait for a specified duration in milliseconds.',
  parameters: Type.Object({
    ms: Type.Number({ description: 'Duration to wait in milliseconds' }),
  }),
  execute: async (_id: string, params: { ms: number }) => {
    await sleep(params.ms);
    return {
      content: [{ type: 'text' as const, text: `Waited ${params.ms}ms` }],
    };
  },
};

export const allTools = [
  screenshotTool,
  clickTool,
  typeTextTool,
  pressKeyTool,
  pressKeysTool,
  scrollTool,
  dragTool,
  openAppTool,
  waitTool,
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
