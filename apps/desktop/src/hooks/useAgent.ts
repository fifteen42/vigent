import { useState, useCallback, useRef } from 'react';
import type { AgentEvent, AgentPanel } from '@vigent/core';

const AGENT_URL = 'http://localhost:3457';

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  panel?: AgentPanel;
}

export interface ActiveTool {
  name: string;
  label: string;
  startedAt: number;
}

export interface PanelEntry {
  panel: AgentPanel;
  ts: number;
}

export interface AgentState {
  messages: AgentMessage[];
  running: boolean;
  error: string | null;
  actionCount: number;
  activeTool: ActiveTool | null;
  panelHistory: PanelEntry[];
  contextUsedPercent: number;
}

export function useAgent() {
  const [state, setState] = useState<AgentState>({
    messages: [],
    running: false,
    error: null,
    actionCount: 0,
    activeTool: null,
    panelHistory: [],
    contextUsedPercent: 0,
  });

  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async (task: string) => {
    if (state.running) return;

    const userMsgId = crypto.randomUUID();
    const assistantMsgId = crypto.randomUUID();

    setState(s => ({
      ...s,
      running: true,
      error: null,
      activeTool: null,
      actionCount: 0,
      panelHistory: [],
      contextUsedPercent: 0,
      messages: [
        ...s.messages,
        { id: userMsgId, role: 'user', text: task },
        { id: assistantMsgId, role: 'assistant', text: '' },
      ],
    }));

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch(`${AGENT_URL}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task }),
        signal: abort.signal,
      });

      if (!res.ok || !res.body) {
        // Try to parse error body
        const errText = await res.text().catch(() => '');
        let errMsg = `Agent error: ${res.status}`;
        try {
          const errJson = JSON.parse(errText);
          if (errJson.error) errMsg = errJson.error;
          if (errJson.hint) errMsg += `. ${errJson.hint}`;
        } catch { /* ignore */ }
        throw new Error(errMsg);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event: AgentEvent = JSON.parse(line.slice(6));
            handleEvent(event, assistantMsgId);
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      // Translate network errors to actionable messages
      const raw = String(err);
      const msg = raw.includes('Failed to fetch') || raw.includes('NetworkError')
        ? 'Cannot connect to agent. Make sure vigent serve is running on port 3457.'
        : raw;
      setState(s => ({ ...s, error: msg }));
    } finally {
      setState(s => ({ ...s, running: false, activeTool: null }));
      abortRef.current = null;
    }
  }, [state.running]);

  const handleEvent = useCallback((event: AgentEvent, msgId: string) => {
    setState(s => {
      switch (event.type) {
        case 'text':
          return {
            ...s,
            messages: s.messages.map(m =>
              m.id === msgId ? { ...m, text: m.text + event.delta } : m
            ),
          };

        case 'panel':
          return {
            ...s,
            messages: s.messages.map(m =>
              m.id === msgId ? { ...m, panel: event.panel } : m
            ),
            // Append to panel history — deduplicate screen_mirror (keep only latest)
            panelHistory: event.panel.kind === 'screen_mirror'
              ? [
                  ...s.panelHistory.filter(p => p.panel.kind !== 'screen_mirror'),
                  { panel: event.panel, ts: Date.now() },
                ]
              : [...s.panelHistory, { panel: event.panel, ts: Date.now() }],
          };

        case 'tool_start':
          return {
            ...s,
            activeTool: { name: event.name, label: event.label ?? event.name, startedAt: Date.now() },
          };

        case 'tool_end':
          return { ...s, activeTool: null };

        case 'step':
          return { ...s, actionCount: event.current };

        case 'budget':
          return { ...s, contextUsedPercent: event.usedPercent };

        case 'done':
          return { ...s, actionCount: event.actionCount ?? s.actionCount, activeTool: null };

        case 'error':
          return { ...s, error: event.message, activeTool: null };

        default:
          return s;
      }
    });
  }, []);

  const stop = useCallback(async () => {
    // Signal the server to stop the task (graceful)
    try {
      await fetch(`${AGENT_URL}/stop`, { method: 'POST' });
    } catch { /* server may not respond if crashed */ }
    // Also abort the SSE connection
    abortRef.current?.abort();
  }, []);

  const clear = useCallback(() => {
    setState({ messages: [], running: false, error: null, actionCount: 0, activeTool: null, panelHistory: [], contextUsedPercent: 0 });
  }, []);

  return { ...state, run, stop, clear };
}
