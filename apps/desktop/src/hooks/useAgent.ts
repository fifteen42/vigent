import { useState, useCallback, useRef } from 'react';
import type { AgentEvent, AgentPanel } from '@vigent/core';

const AGENT_URL = 'http://localhost:3457';

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  panel?: AgentPanel;
}

export interface AgentState {
  messages: AgentMessage[];
  running: boolean;
  error: string | null;
  actionCount: number;
}

export function useAgent() {
  const [state, setState] = useState<AgentState>({
    messages: [],
    running: false,
    error: null,
    actionCount: 0,
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
        throw new Error(`Agent error: ${res.status}`);
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
      setState(s => ({ ...s, error: String(err) }));
    } finally {
      setState(s => ({ ...s, running: false }));
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
          };

        case 'step':
          return { ...s, actionCount: event.current };

        case 'done':
          return { ...s, actionCount: event.actionCount ?? s.actionCount };

        case 'error':
          return { ...s, error: event.message };

        default:
          return s;
      }
    });
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clear = useCallback(() => {
    setState({ messages: [], running: false, error: null, actionCount: 0 });
  }, []);

  return { ...state, run, stop, clear };
}
