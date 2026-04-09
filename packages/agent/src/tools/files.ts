import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

const MAX_READ_CHARS = 8_000;

function expandPath(p: string): string {
  return resolve(p.replace(/^~/, process.env.HOME ?? ''));
}

export function createFileTools(): AgentTool<any>[] {
  // ── read_file ──────────────────────────────────────────────────────────────
  const readFileTool: AgentTool<any> = {
    name: 'read_file',
    label: 'Read File',
    description: [
      'Read the contents of a text file. Supports txt, md, json, csv, yaml, py, js, ts, etc.',
      `Returns up to ${MAX_READ_CHARS} characters. For large files, use the offset parameter.`,
      'Use this to inspect configuration files, scripts, or any text content.',
    ].join(' '),
    parameters: Type.Object({
      path: Type.String({ description: 'File path (~ expanded). E.g. ~/Desktop/notes.txt' }),
      offset: Type.Optional(Type.Number({ description: 'Character offset to start reading from (default: 0)' })),
    }),
    execute: async (_id: string, params: any) => {
      const filePath = expandPath(params.path);

      if (!existsSync(filePath)) {
        return {
          content: [{ type: 'text' as const, text: `File not found: ${filePath}` }],
          details: { error: 'not_found', filePath },
        };
      }

      try {
        const raw = readFileSync(filePath, 'utf8');
        const offset = params.offset ?? 0;
        const slice = raw.slice(offset, offset + MAX_READ_CHARS);
        const truncated = raw.length > offset + MAX_READ_CHARS;
        const ext = extname(filePath).slice(1);

        const text = truncated
          ? `${slice}\n\n...(${raw.length - offset - MAX_READ_CHARS} more characters — use offset=${offset + MAX_READ_CHARS} to continue)`
          : slice;

        return {
          content: [{ type: 'text' as const, text }],
          details: { filePath, size: raw.length, ext, offset, truncated },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: `Read failed: ${msg}` }],
          details: { error: msg, filePath },
        };
      }
    },
  };

  // ── write_file ─────────────────────────────────────────────────────────────
  const writeFileTool: AgentTool<any> = {
    name: 'write_file',
    label: 'Write File',
    description: [
      'Write text content to a file. Creates the file and any parent directories if needed.',
      'Use for saving transcripts, reports, scripts, config files, etc.',
      'For appending to an existing file, use append: true.',
    ].join(' '),
    parameters: Type.Object({
      path: Type.String({ description: 'File path (~ expanded). E.g. ~/Desktop/output.txt' }),
      content: Type.String({ description: 'Text content to write' }),
      append: Type.Optional(Type.Boolean({ description: 'Append to existing file instead of overwriting (default: false)' })),
    }),
    execute: async (_id: string, params: any) => {
      const filePath = expandPath(params.path);

      try {
        mkdirSync(dirname(filePath), { recursive: true });
        if (params.append && existsSync(filePath)) {
          const existing = readFileSync(filePath, 'utf8');
          writeFileSync(filePath, existing + params.content, 'utf8');
        } else {
          writeFileSync(filePath, params.content, 'utf8');
        }
        const size = params.content.length;
        const action = params.append ? 'Appended' : 'Written';
        return {
          content: [{ type: 'text' as const, text: `${action} ${size} characters to ${filePath}` }],
          details: { filePath, size, append: params.append ?? false },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: `Write failed: ${msg}` }],
          details: { error: msg, filePath },
        };
      }
    },
  };

  // ── list_files ─────────────────────────────────────────────────────────────
  const listFilesTool: AgentTool<any> = {
    name: 'list_files',
    label: 'List Files',
    description: 'List files in a directory. Returns names, sizes, and modification dates.',
    parameters: Type.Object({
      path: Type.String({ description: 'Directory path (~ expanded). E.g. ~/Desktop' }),
      pattern: Type.Optional(Type.String({ description: 'Optional glob pattern to filter, e.g. "*.mp4"' })),
    }),
    execute: async (_id: string, params: any) => {
      const dirPath = expandPath(params.path);
      const pattern = params.pattern ? ` -name "${params.pattern}"` : '';

      try {
        const { stdout } = await execAsync(
          `ls -lah ${JSON.stringify(dirPath)}${pattern ? ` | grep -E '${params.pattern?.replace('.', '\\.').replace('*', '.*')}'` : ''}`,
          { shell: '/bin/zsh' }
        );
        const lines = stdout.trim().split('\n').filter(l => l && !l.startsWith('total')).slice(0, 50);
        const summary = lines.length === 0 ? '(empty directory)' : lines.join('\n');
        const truncated = lines.length === 50 ? '\n...(truncated to 50 entries)' : '';

        return {
          content: [{ type: 'text' as const, text: summary + truncated }],
          details: { dirPath, count: lines.length },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: `List failed: ${msg}` }],
          details: { error: msg, dirPath },
        };
      }
    },
  };

  // ── open_file ──────────────────────────────────────────────────────────────
  const openFileTool: AgentTool<any> = {
    name: 'open_file',
    label: 'Open File',
    description: 'Open a file in its default macOS application (like double-clicking it in Finder).',
    parameters: Type.Object({
      path: Type.String({ description: 'File path (~ expanded)' }),
    }),
    execute: async (_id: string, params: any) => {
      const filePath = expandPath(params.path);
      try {
        await execAsync(`open ${JSON.stringify(filePath)}`);
        return {
          content: [{ type: 'text' as const, text: `Opened: ${filePath}` }],
          details: { filePath },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: `Open failed: ${msg}` }],
          details: { error: msg, filePath },
        };
      }
    },
  };

  return [readFileTool, writeFileTool, listFilesTool, openFileTool];
}
