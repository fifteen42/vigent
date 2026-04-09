import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { VigentNativeBridge } from '@vigent/native-swift';
import { createHash } from 'node:crypto';

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

export function createTimingTools(bridge: VigentNativeBridge): AgentTool<any>[] {
  const waitTool: AgentTool<any> = {
    name: 'wait',
    label: 'Wait',
    description: 'Wait for a fixed duration. Use after opening apps or triggering animations.',
    parameters: Type.Object({
      ms: Type.Number({ description: 'Duration in milliseconds (e.g. 1000 = 1 second)', minimum: 0, maximum: 30_000 }),
    }),
    execute: async (_id: string, params: any) => {
      await sleep(params.ms);
      return {
        content: [{ type: 'text' as const, text: `Waited ${params.ms}ms` }],
        details: { ms: params.ms },
      };
    },
  };

  const waitForChangeTool: AgentTool<any> = {
    name: 'wait_for_change',
    label: 'Wait For Screen Change',
    description: 'Poll for screen changes by comparing screenshot hashes. Returns when screen changes or times out.',
    parameters: Type.Object({
      timeoutMs: Type.Number({ description: 'Maximum wait time in ms (default: 10000)', minimum: 500, maximum: 60_000 }),
      pollIntervalMs: Type.Optional(Type.Number({ description: 'Check interval in ms (default: 500)' })),
    }),
    execute: async (_id: string, params: any) => {
      const interval = params.pollIntervalMs ?? 500;
      const deadline = Date.now() + params.timeoutMs;

      const first = await bridge.screenshot(0.5, 640, 480);
      let prevHash = hashImage(first.base64);

      while (Date.now() < deadline) {
        await sleep(interval);
        const current = await bridge.screenshot(0.5, 640, 480);
        const currentHash = hashImage(current.base64);
        if (currentHash !== prevHash) {
          const elapsed = params.timeoutMs - (deadline - Date.now());
          return {
            content: [{ type: 'text' as const, text: `Screen changed after ${elapsed}ms` }],
            details: { changed: true, elapsedMs: elapsed },
          };
        }
        prevHash = currentHash;
      }

      return {
        content: [{ type: 'text' as const, text: `Timeout: no screen change detected after ${params.timeoutMs}ms` }],
        details: { changed: false, elapsedMs: params.timeoutMs },
      };
    },
  };

  return [waitTool, waitForChangeTool];
}

function hashImage(base64: string): string {
  return createHash('md5').update(base64.slice(0, 10_000)).digest('hex');
}
