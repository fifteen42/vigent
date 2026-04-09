#!/usr/bin/env node

import { VigentNativeBridge } from '@vigent/native-swift';
import { loadConfig } from './config.js';
import { MinimaxClient } from './client/minimax.js';
import { runComputerUse } from './modes/run.js';
import { runVideoAnalysis } from './modes/video.js';
import { runTranscribe } from './modes/transcribe.js';
import { startHttpServer } from './modes/serve.js';
import type { NativeModules } from './tools/index.js';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

const args = process.argv.slice(2);
const command = args[0];

function usage() {
  process.stderr.write(`
Vigent — Native Multimodal Agent

Usage:
  vigent run "task"                    Run a computer use task
  vigent video <path> "question"       Analyze a video file
  vigent transcribe <path>             Transcribe audio/video to text (Gemini)
  vigent generate video "prompt"       Generate a video (MiniMax)
  vigent generate image "prompt"       Generate images (MiniMax)
  vigent tts "text"                    Text-to-speech (MiniMax)
  vigent screenshot [output.jpg]       Take a screenshot
  vigent serve [--port 3000]           Start HTTP server (POST /run, POST /stop)
  vigent sessions                      List recent session logs
  vigent info                          Show config and system info

Environment variables:
  ANTHROPIC_API_KEY
  GOOGLE_API_KEY
  MINIMAX_API_KEY
  VIGENT_MODEL         best|balanced|fast|video|local (default: best)
  VIGENT_MAX_STEPS     (default: 50)
  VIGENT_PERMISSIONS   auto|ask|deny (default: ask)
`);
}

async function initNative(): Promise<NativeModules> {
  const input = await import('@vigent/native-input');
  const bridge = new VigentNativeBridge();
  bridge.start();

  const hasAccess = await bridge.checkAccessibility();
  if (!hasAccess) {
    process.stderr.write('❌ Accessibility permission required.\n');
    process.stderr.write('   System Settings → Privacy & Security → Accessibility\n');
    process.exit(1);
  }

  return { input, bridge };
}

async function main() {
  const config = loadConfig();

  switch (command) {
    case 'run': {
      const task = args.slice(1).join(' ');
      if (!task) { usage(); process.exit(1); }

      const native = await initNative();
      try {
        await runComputerUse(task, native, config);
      } finally {
        native.bridge.stop();
      }
      break;
    }

    case 'video': {
      const forceGemini = args.includes('--gemini');
      const forceClaude = args.includes('--claude');
      const filteredArgs = args.slice(1).filter(a => !a.startsWith('--'));
      const videoPath = filteredArgs[0];
      const question = filteredArgs.slice(1).join(' ') || 'Describe what happens in this video.';
      if (!videoPath) {
        process.stderr.write('Usage: vigent video [--gemini|--claude] <path> "question"\n');
        process.exit(1);
      }
      const forceModel = forceGemini ? 'gemini' : forceClaude ? 'claude' : undefined;
      await runVideoAnalysis(videoPath, question, config, forceModel);
      break;
    }

    case 'generate': {
      const subcommand = args[1];

      if (subcommand === 'video') {
        const prompt = args.slice(2).join(' ');
        if (!prompt) {
          process.stderr.write('Usage: vigent generate video "prompt"\n');
          process.exit(1);
        }
        if (!config.minimaxApiKey) {
          process.stderr.write('Error: MINIMAX_API_KEY required for video generation\n');
          process.exit(1);
        }
        const minimax = new MinimaxClient({ apiKey: config.minimaxApiKey, baseUrl: config.minimaxBaseUrl });
        process.stderr.write('[Video] Submitting generation task...\n');
        const taskId = await minimax.generateVideo({
          model: config.minimaxVideoModel,
          prompt,
        });
        process.stderr.write(`[Video] Task ID: ${taskId}\n`);
        process.stderr.write('[Video] Waiting for completion...\n');
        const downloadUrl = await minimax.waitForVideo(taskId, {
          onStatus: (status) => process.stderr.write(`[Video] Status: ${status}\r`),
        });
        process.stderr.write(`\n[Video] Done. Download: ${downloadUrl}\n`);
        process.stdout.write(downloadUrl + '\n');
      } else if (subcommand === 'image') {
        const prompt = args.slice(2).join(' ');
        if (!prompt) {
          process.stderr.write('Usage: vigent generate image "prompt"\n');
          process.exit(1);
        }
        if (!config.minimaxApiKey) {
          process.stderr.write('Error: MINIMAX_API_KEY required for image generation\n');
          process.exit(1);
        }
        const minimax = new MinimaxClient({ apiKey: config.minimaxApiKey, baseUrl: config.minimaxBaseUrl });
        process.stderr.write('[Image] Generating...\n');
        const urls = await minimax.generateImage({ prompt });
        process.stderr.write(`[Image] ${urls.length} image(s) generated.\n`);
        for (const url of urls) {
          process.stdout.write(url + '\n');
        }
      } else {
        process.stderr.write('Usage: vigent generate <video|image> "prompt"\n');
        process.exit(1);
      }
      break;
    }

    case 'tts': {
      const text = args.slice(1).filter(a => !a.startsWith('--')).join(' ');
      const outputFlag = args.indexOf('--output');
      const outputPath = outputFlag >= 0 ? args[outputFlag + 1] : `tts_${Date.now()}.mp3`;

      if (!text) {
        process.stderr.write('Usage: vigent tts "text" [--output file.mp3]\n');
        process.exit(1);
      }
      if (!config.minimaxApiKey) {
        process.stderr.write('Error: MINIMAX_API_KEY required for TTS\n');
        process.exit(1);
      }

      const minimax = new MinimaxClient({ apiKey: config.minimaxApiKey, baseUrl: config.minimaxBaseUrl });
      process.stderr.write('[TTS] Synthesizing...\n');
      const audio = await minimax.synthesizeSpeech({
        model: 'speech-2.8-hd',
        text,
        voiceId: config.minimaxTtsVoice,
        format: 'mp3',
      });
      await fs.writeFile(outputPath, new Uint8Array(audio));
      process.stderr.write(`[TTS] Saved to ${outputPath}\n`);
      process.stdout.write(outputPath + '\n');
      break;
    }

    case 'transcribe': {
      const mediaPath = args[1];
      if (!mediaPath) {
        process.stderr.write('Usage: vigent transcribe <audio-or-video-file> [--language en] [--prompt "hint"]\n');
        process.exit(1);
      }
      const langFlag = args.indexOf('--language');
      const promptFlag = args.indexOf('--prompt');
      await runTranscribe(mediaPath, config, {
        language: langFlag >= 0 ? args[langFlag + 1] : undefined,
        prompt: promptFlag >= 0 ? args[promptFlag + 1] : undefined,
      });
      break;
    }

    case 'screenshot': {
      const outputPath = args[1] ?? `screenshot_${Date.now()}.jpg`;
      const native = await initNative();
      try {
        const result = await native.bridge.screenshot(config.screenshotQuality, config.screenshotMaxWidth, config.screenshotMaxWidth);
        const buffer = Buffer.from(result.base64, 'base64');
        await fs.writeFile(outputPath, new Uint8Array(buffer));
        process.stderr.write(`Screenshot saved: ${outputPath} (${result.width}×${result.height})\n`);
        process.stdout.write(outputPath + '\n');
      } finally {
        native.bridge.stop();
      }
      break;
    }

    case 'serve': {
      const portFlag = args.indexOf('--port');
      const port = portFlag >= 0 ? parseInt(args[portFlag + 1], 10) : 3000;
      const native = await initNative();
      startHttpServer(port, native, config);
      // Server runs until killed — don't call native.bridge.stop()
      break;
    }

    case 'sessions': {
      const sessionsDir = path.join(process.env.HOME ?? '/tmp', '.vigent', 'sessions');
      try {
        const files = await fs.readdir(sessionsDir);
        const jsonlFiles = files.filter(f => f.endsWith('.jsonl')).sort().reverse().slice(0, 20);
        if (jsonlFiles.length === 0) {
          process.stdout.write('No sessions found. Run a task first.\n');
        } else {
          process.stdout.write(`Recent sessions (${sessionsDir}):\n`);
          for (const f of jsonlFiles) {
            const fullPath = path.join(sessionsDir, f);
            const stat = await fs.stat(fullPath);
            const first = (await fs.readFile(fullPath, 'utf8')).split('\n')[0];
            const header = JSON.parse(first);
            const task = header.event?.task ?? '(unknown)';
            const date = new Date(header.ts).toLocaleString();
            process.stdout.write(`  ${date}  "${task.slice(0, 60)}"\n    → ${fullPath}\n`);
          }
        }
      } catch {
        process.stdout.write(`No sessions directory found at ${sessionsDir}\n`);
      }
      break;
    }

    case 'info': {
      process.stdout.write(JSON.stringify({
        model: config.model,
        permissionMode: config.permissionMode,
        maxSteps: config.maxSteps,
        anthropicApiKey: config.anthropicApiKey ? '***' : undefined,
        googleApiKey: config.googleApiKey ? '***' : undefined,
        minimaxApiKey: config.minimaxApiKey ? '***' : undefined,
        minimaxBaseUrl: config.minimaxBaseUrl,
        ollamaBaseUrl: config.ollamaBaseUrl,
        keepRecentScreenshots: config.keepRecentScreenshots,
        maxContextTokens: config.maxContextTokens,
      }, null, 2) + '\n');
      break;
    }

    default: {
      usage();
      process.exit(command ? 1 : 0);
    }
  }
}

main().catch(err => {
  process.stderr.write(`Fatal: ${err}\n`);
  process.exit(1);
});
