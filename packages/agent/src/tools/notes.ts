import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';

/**
 * In-session scratch pad for the agent.
 * The agent can write short notes to itself (findings, plans, partial results)
 * and read them back in a later turn. Notes reset when the agent run ends.
 */
export function createNotesTool(): AgentTool<any>[] {
  const notes: Map<string, string> = new Map();

  const saveNoteTool: AgentTool<any> = {
    name: 'save_note',
    label: 'Save Note',
    description: [
      'Save a short text note with a key for later retrieval within this session.',
      'Use this to remember intermediate findings, URLs, file paths, or plans.',
      'Example: save_note key="login_url" value="https://..."',
    ].join(' '),
    parameters: Type.Object({
      key: Type.String({ description: 'Unique key for the note (e.g. "login_url", "step2_result")' }),
      value: Type.String({ description: 'Note content to store' }),
    }),
    execute: async (_id: string, params: any) => {
      notes.set(params.key, params.value);
      return {
        content: [{ type: 'text' as const, text: `Note saved: ${params.key}` }],
        details: { key: params.key },
      };
    },
  };

  const readNoteTool: AgentTool<any> = {
    name: 'read_note',
    label: 'Read Note',
    description: 'Read a previously saved note by key. Returns all notes if no key is provided.',
    parameters: Type.Object({
      key: Type.Optional(Type.String({ description: 'Key of the note to read. Omit to list all notes.' })),
    }),
    execute: async (_id: string, params: any) => {
      if (params.key) {
        const value = notes.get(params.key);
        return {
          content: [{
            type: 'text' as const,
            text: value !== undefined ? value : `No note found for key: ${params.key}`,
          }],
          details: { key: params.key, found: value !== undefined },
        };
      } else {
        if (notes.size === 0) {
          return {
            content: [{ type: 'text' as const, text: 'No notes saved yet.' }],
            details: { count: 0 },
          };
        }
        const list = [...notes.entries()]
          .map(([k, v]) => `[${k}]: ${v}`)
          .join('\n');
        return {
          content: [{ type: 'text' as const, text: list }],
          details: { count: notes.size, keys: [...notes.keys()] },
        };
      }
    },
  };

  return [saveNoteTool, readNoteTool];
}
