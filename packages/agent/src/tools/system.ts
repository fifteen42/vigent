import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { VigentNativeBridge } from '@vigent/native-swift';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

export function createSystemTools(bridge: VigentNativeBridge): AgentTool<any>[] {
  const openAppTool: AgentTool<any> = {
    name: 'open_app',
    label: 'Open App',
    description: 'Open a macOS application by name.',
    parameters: Type.Object({
      name: Type.String({ description: 'Application name, e.g. "Safari", "TextEdit", "Terminal"' }),
    }),
    execute: async (_id: string, params: any) => {
      await bridge.openApp(params.name);
      await sleep(1500);
      return {
        content: [{ type: 'text' as const, text: `Opened: ${params.name}` }],
        details: { name: params.name },
      };
    },
  };

  const focusAppTool: AgentTool<any> = {
    name: 'focus_app',
    label: 'Focus App',
    description: 'Bring a running application to the foreground using AppleScript.',
    parameters: Type.Object({
      name: Type.String({ description: 'Application name to bring to foreground' }),
    }),
    execute: async (_id: string, params: any) => {
      await execAsync(`osascript -e 'tell application "${params.name}" to activate'`);
      await sleep(500);
      return {
        content: [{ type: 'text' as const, text: `Focused: ${params.name}` }],
        details: { name: params.name },
      };
    },
  };

  const runApplescriptTool: AgentTool<any> = {
    name: 'run_applescript',
    label: 'Run AppleScript',
    description: 'Execute AppleScript for advanced macOS automation. DANGEROUS — requires approval in ask mode.',
    parameters: Type.Object({
      script: Type.String({ description: 'AppleScript code to execute. Use for complex system operations.' }),
    }),
    execute: async (_id: string, params: any) => {
      const { stdout, stderr } = await execAsync(`osascript -e ${JSON.stringify(params.script)}`).catch(e => ({
        stdout: '',
        stderr: String(e.message),
      }));
      const output = stdout.trim() || stderr.trim() || '(no output)';
      return {
        content: [{ type: 'text' as const, text: output }],
        details: { script: params.script, output, error: stderr || null },
      };
    },
  };

  const getClipboardTool: AgentTool<any> = {
    name: 'get_clipboard',
    label: 'Get Clipboard',
    description: 'Read the current clipboard text content.',
    parameters: Type.Object({}),
    execute: async () => {
      const { stdout } = await execAsync('pbpaste');
      const text = stdout.slice(0, 2000);
      return {
        content: [{ type: 'text' as const, text: text || '(clipboard is empty)' }],
        details: { text },
      };
    },
  };

  const setClipboardTool: AgentTool<any> = {
    name: 'set_clipboard',
    label: 'Set Clipboard',
    description: 'Write text to clipboard. Useful for pasting complex content.',
    parameters: Type.Object({
      text: Type.String({ description: 'Text to write to clipboard' }),
    }),
    execute: async (_id: string, params: any) => {
      const proc = exec('pbcopy');
      proc.stdin!.write(params.text);
      proc.stdin!.end();
      await new Promise(r => proc.on('close', r));
      return {
        content: [{ type: 'text' as const, text: `Clipboard set (${params.text.length} chars)` }],
        details: { length: params.text.length },
      };
    },
  };

  return [openAppTool, focusAppTool, runApplescriptTool, getClipboardTool, setClipboardTool];
}
