import { createServer } from 'node:http';
import type { NativeModules } from '../tools/index.js';
import type { VigentConfig } from '../config.js';
import { runComputerUse } from './run.js';

export function startHttpServer(port: number, native: NativeModules, config: VigentConfig) {
  const server = createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', model: config.model }));
      return;
    }

    if (req.method !== 'POST' || req.url !== '/run') {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found. POST /run { task: string }' }));
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
      res.end(JSON.stringify({ error: 'Missing task' }));
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    const taskConfig: VigentConfig = {
      ...config,
      model: parsed.model ?? config.model,
      maxSteps: parsed.maxSteps ?? config.maxSteps,
    };

    // Redirect stdout to SSE
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: any) => {
      res.write(`data: ${JSON.stringify({ type: 'text', delta: String(chunk) })}\n\n`);
      return true;
    };

    try {
      await runComputerUse(parsed.task, native, taskConfig);
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    } catch (err) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: String(err) })}\n\n`);
    } finally {
      process.stdout.write = origWrite;
      res.end();
    }
  });

  server.listen(port, () => {
    process.stderr.write(`Vigent HTTP server running on http://localhost:${port}\n`);
    process.stderr.write(`POST /run { "task": "..." }\n`);
  });

  return server;
}

async function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += String(chunk));
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}
