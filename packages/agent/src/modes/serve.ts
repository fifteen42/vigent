import { createServer } from 'node:http';
import type { NativeModules } from '../tools/index.js';
import type { VigentConfig } from '../config.js';
import type { AgentEvent } from '@vigent/core';
import { runComputerUse } from './run.js';

interface ActiveTask {
  id: string;
  controller: AbortController;
  startedAt: number;
  task: string;
}

export function startHttpServer(port: number, native: NativeModules, config: VigentConfig) {
  let activeTask: ActiveTask | null = null;

  const server = createServer(async (req, res) => {
    // CORS for local desktop app (Tauri opens localhost)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // ── GET /health ─────────────────────────────────────────────────────────
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        model: config.model,
        version: '0.2.0',
        busy: activeTask !== null,
        activeTask: activeTask
          ? { id: activeTask.id, task: activeTask.task, elapsedMs: Date.now() - activeTask.startedAt }
          : null,
      }));
      return;
    }

    // ── POST /stop ──────────────────────────────────────────────────────────
    if (req.method === 'POST' && req.url === '/stop') {
      if (activeTask) {
        activeTask.controller.abort();
        const stopped = activeTask.task;
        activeTask = null;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ stopped: true, task: stopped }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ stopped: false, message: 'No active task' }));
      }
      return;
    }

    // ── POST /run ───────────────────────────────────────────────────────────
    if (req.method !== 'POST' || req.url !== '/run') {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Unknown endpoint. Use: POST /run { task: string } or POST /stop' }));
      return;
    }

    const body = await readBody(req);
    let parsed: { task?: string; model?: string; maxSteps?: number };
    try {
      parsed = JSON.parse(body);
    } catch {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    if (!parsed.task) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Missing "task" field' }));
      return;
    }

    // Reject if already busy
    if (activeTask) {
      res.writeHead(409);
      res.end(JSON.stringify({
        error: 'Agent is busy',
        activeTask: activeTask.task,
        hint: 'POST /stop to cancel the current task first',
      }));
      return;
    }

    // Set up SSE stream
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const taskId = `task_${Date.now()}`;
    const controller = new AbortController();
    activeTask = { id: taskId, controller, startedAt: Date.now(), task: parsed.task };

    const send = (event: AgentEvent) => {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    };

    const taskConfig: VigentConfig = {
      ...config,
      model: parsed.model ?? config.model,
      maxSteps: parsed.maxSteps ?? config.maxSteps,
    };

    // Clean up if client disconnects
    req.on('close', () => {
      if (activeTask?.id === taskId) {
        controller.abort();
        activeTask = null;
      }
    });

    try {
      await runComputerUse(parsed.task, native, taskConfig, send, controller.signal);
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') {
        send({ type: 'error', message: String(err) });
      } else {
        send({ type: 'error', message: 'Task stopped by user' });
      }
    } finally {
      if (activeTask?.id === taskId) activeTask = null;
      if (!res.writableEnded) res.end();
    }
  });

  server.listen(port, () => {
    process.stderr.write(`Vigent agent ready at http://localhost:${port}\n`);
    process.stderr.write(`  POST /run  { "task": "..." }  → SSE stream\n`);
    process.stderr.write(`  POST /stop                    → cancel active task\n`);
    process.stderr.write(`  GET  /health                  → status\n`);
  });

  return server;
}

async function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => (body += String(chunk)));
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}
