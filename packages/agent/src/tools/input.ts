import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { getLastElementMap } from './vision.js';

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

export function createInputTools(nativeInput: typeof import('@vigent/native-input')): AgentTool<any>[] {
  const clickTool: AgentTool<any> = {
    name: 'click',
    label: 'Mouse Click',
    description: 'Click at absolute screen coordinates. Use screenshot to find coordinates first.',
    parameters: Type.Object({
      x: Type.Number({ description: 'Screen X coordinate (absolute pixels)' }),
      y: Type.Number({ description: 'Screen Y coordinate (absolute pixels)' }),
      button: Type.Optional(Type.Union([
        Type.Literal('left'), Type.Literal('right'), Type.Literal('middle'),
      ], { description: 'Mouse button (default: left)' })),
      count: Type.Optional(Type.Number({ description: 'Click count: 1=single, 2=double (default: 1)' })),
    }),
    execute: async (_id: string, params: any) => {
      nativeInput.moveMouse(params.x, params.y);
      await sleep(50);
      nativeInput.mouseClick(params.button ?? 'left', params.count ?? 1);
      await sleep(50);
      return {
        content: [{ type: 'text' as const, text: `Clicked ${params.button ?? 'left'} at (${params.x}, ${params.y})${params.count === 2 ? ' (double)' : ''}` }],
        details: { x: params.x, y: params.y, button: params.button ?? 'left', count: params.count ?? 1 },
      };
    },
  };

  const typeTextTool: AgentTool<any> = {
    name: 'type_text',
    label: 'Type Text',
    description: 'Type text using the keyboard. Click the target field first.',
    parameters: Type.Object({
      text: Type.String({ description: 'Text to type. Click the target input field first.' }),
    }),
    execute: async (_id: string, params: any) => {
      nativeInput.typeText(params.text);
      return {
        content: [{ type: 'text' as const, text: `Typed: "${params.text.slice(0, 50)}${params.text.length > 50 ? '...' : ''}"` }],
        details: { text: params.text },
      };
    },
  };

  const pressKeyTool: AgentTool<any> = {
    name: 'press_key',
    label: 'Press Key',
    description: 'Press a single key.',
    parameters: Type.Object({
      key: Type.String({ description: 'Key name: return, tab, escape, space, backspace, up, down, left, right, f1-f12, etc.' }),
    }),
    execute: async (_id: string, params: any) => {
      nativeInput.pressKey(params.key);
      return {
        content: [{ type: 'text' as const, text: `Pressed: ${params.key}` }],
        details: { key: params.key },
      };
    },
  };

  const pressKeysTool: AgentTool<any> = {
    name: 'press_keys',
    label: 'Press Key Combo',
    description: 'Press a keyboard shortcut (modifier + key combination).',
    parameters: Type.Object({
      keys: Type.Array(Type.String(), {
        description: 'Keys to press simultaneously. E.g. ["command","c"] for Cmd+C',
      }),
    }),
    execute: async (_id: string, params: any) => {
      nativeInput.pressKeys(params.keys);
      return {
        content: [{ type: 'text' as const, text: `Pressed: ${params.keys.join('+')}` }],
        details: { keys: params.keys },
      };
    },
  };

  const scrollTool: AgentTool<any> = {
    name: 'scroll',
    label: 'Scroll',
    description: 'Scroll at the specified or current position.',
    parameters: Type.Object({
      x: Type.Optional(Type.Number({ description: 'X position to scroll at (default: current)' })),
      y: Type.Optional(Type.Number({ description: 'Y position to scroll at (default: current)' })),
      dx: Type.Optional(Type.Number({ description: 'Horizontal scroll amount (positive = right)' })),
      dy: Type.Optional(Type.Number({ description: 'Vertical scroll amount (positive = down)' })),
    }),
    execute: async (_id: string, params: any) => {
      if (params.x !== undefined && params.y !== undefined) {
        nativeInput.moveMouse(params.x, params.y);
        await sleep(30);
      }
      nativeInput.mouseScroll(params.dx ?? 0, params.dy ?? 0);
      return {
        content: [{ type: 'text' as const, text: `Scrolled dx=${params.dx ?? 0} dy=${params.dy ?? 0}` }],
        details: { dx: params.dx, dy: params.dy },
      };
    },
  };

  const dragTool: AgentTool<any> = {
    name: 'drag',
    label: 'Drag',
    description: 'Drag from one screen position to another (animated, 20 steps).',
    parameters: Type.Object({
      fromX: Type.Number({ description: 'Start X' }),
      fromY: Type.Number({ description: 'Start Y' }),
      toX: Type.Number({ description: 'End X' }),
      toY: Type.Number({ description: 'End Y' }),
    }),
    execute: async (_id: string, params: any) => {
      nativeInput.moveMouse(params.fromX, params.fromY);
      await sleep(50);
      nativeInput.mouseDown('left');
      await sleep(50);
      const steps = 20;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        nativeInput.moveMouse(
          Math.round(params.fromX + (params.toX - params.fromX) * t),
          Math.round(params.fromY + (params.toY - params.fromY) * t),
        );
        await sleep(16);
      }
      nativeInput.mouseUp('left');
      return {
        content: [{ type: 'text' as const, text: `Dragged (${params.fromX},${params.fromY}) → (${params.toX},${params.toY})` }],
        details: params,
      };
    },
  };

  // ── click_element (SoM) ───────────────────────────────────────────────────
  const clickElementTool: AgentTool<any> = {
    name: 'click_element',
    label: 'Click Element by ID',
    description: [
      'Click a UI element by its marker ID from the last screenshot_marked call.',
      'This is the preferred way to click — more reliable than pixel coordinates.',
      'Always call screenshot_marked first to get element IDs.',
    ].join(' '),
    parameters: Type.Object({
      elementId: Type.Number({ description: 'The element number shown in the screenshot markers (e.g. 7)' }),
      button: Type.Optional(Type.Union([
        Type.Literal('left'), Type.Literal('right'), Type.Literal('middle'),
      ], { description: 'Mouse button (default: left)' })),
      count: Type.Optional(Type.Number({ description: 'Click count: 1=single, 2=double (default: 1)' })),
    }),
    execute: async (_id: string, params: any) => {
      const elementMap = getLastElementMap();
      const element = elementMap.get(params.elementId);

      if (!element) {
        const available = Array.from(elementMap.keys()).join(', ');
        return {
          content: [{
            type: 'text' as const,
            text: `Element #${params.elementId} not found. Available IDs: ${available || 'none — call screenshot_marked first'}`,
          }],
          details: { error: 'element_not_found', elementId: params.elementId },
        };
      }

      const x = Math.round(element.centerX);
      const y = Math.round(element.centerY);
      nativeInput.moveMouse(x, y);
      await sleep(50);
      nativeInput.mouseClick(params.button ?? 'left', params.count ?? 1);
      await sleep(50);

      const label = element.title ?? element.value ?? element.role;
      return {
        content: [{
          type: 'text' as const,
          text: `Clicked #${params.elementId} "${label}" at (${x},${y})${params.count === 2 ? ' (double)' : ''}`,
        }],
        details: { elementId: params.elementId, x, y, element },
      };
    },
  };

  return [clickTool, clickElementTool, typeTextTool, pressKeyTool, pressKeysTool, scrollTool, dragTool];
}
