import { createServer } from 'node:http';
import type { NativeModules } from '../tools/index.js';
import type { VigentConfig } from '../config.js';
import type { AgentEvent } from '@vigent/core';
import { runComputerUse } from './run.js';

export function startHttpServer(port: number, native: NativeModules, config: VigentConfig) {
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

    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', model: config.model, version: '0.1.0' }));
      return;
    }

    if (req.method !== 'POST' || req.url !== '/run') {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found. Use: POST /run { task: string }' }));
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

    // Stream agent events as SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const send = (event: AgentEvent) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    const taskConfig: VigentConfig = {
      ...config,
      model: parsed.model ?? config.model,
      maxSteps: parsed.maxSteps ?? config.maxSteps,
    };

    try {
      await runComputerUse(parsed.task, native, taskConfig, send);
    } catch (err) {
      send({ type: 'error', message: String(err) });
    } finally {
      res.end();
    }
  });

  server.listen(port, () => {
    process.stderr.write(`Vigent agent ready at http://localhost:${port}\n`);
    process.stderr.write(`POST /run { "task": "..." }  →  SSE stream of AgentEvent\n`);
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
