/**
 * Session log — saves each run as a JSON Lines file in ~/.vigent/sessions/
 * Useful for reviewing what the agent did, debugging, and future memory features.
 */

import { mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentEvent } from '@vigent/core';

const SESSIONS_DIR = join(process.env.HOME ?? '/tmp', '.vigent', 'sessions');

export interface SessionEntry {
  ts: number;
  event: AgentEvent | { type: 'task'; task: string };
}

export class SessionLogger {
  private readonly logPath: string;
  private readonly sessionId: string;

  constructor(task: string) {
    this.sessionId = `${Date.now()}_${task.slice(0, 30).replace(/[^a-z0-9]/gi, '_')}`;
    this.logPath = join(SESSIONS_DIR, `${this.sessionId}.jsonl`);

    try {
      mkdirSync(SESSIONS_DIR, { recursive: true });
      // Write header line
      writeFileSync(
        this.logPath,
        JSON.stringify({ ts: Date.now(), event: { type: 'task', task } }) + '\n',
        'utf8'
      );
    } catch {
      // Non-fatal — session logging is best-effort
    }
  }

  log(event: AgentEvent) {
    try {
      appendFileSync(
        this.logPath,
        JSON.stringify({ ts: Date.now(), event }) + '\n',
        'utf8'
      );
    } catch {
      // Non-fatal
    }
  }

  get path(): string {
    return this.logPath;
  }
}
