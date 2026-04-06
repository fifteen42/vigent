#!/usr/bin/env node

import { VigentNativeBridge } from '@vigent/native-swift';
import { initTools } from './tools.js';
import { runNaturalMode } from './modes/natural.js';
import { runReplayMode, runExactReplayMode } from './modes/replay.js';

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  // Initialize native modules
  const nativeInput = await import('@vigent/native-input');
  const nativeBridge = new VigentNativeBridge();
  nativeBridge.start();

  // Check accessibility permission
  const hasAccess = await nativeBridge.checkAccessibility();
  if (!hasAccess) {
    console.error('❌ Accessibility permission required.');
    console.error('   Go to System Settings → Privacy & Security → Accessibility');
    console.error('   and grant permission to your terminal app.');
    process.exit(1);
  }

  // Initialize tools with native modules
  initTools(nativeInput, nativeBridge);

  try {
    switch (command) {
      case 'run': {
        const task = args.slice(1).join(' ');
        if (!task) {
          console.error('Usage: vigent run "task description"');
          process.exit(1);
        }
        await runNaturalMode(task);
        break;
      }

      case 'replay': {
        const recordingPath = args[1];
        if (!recordingPath) {
          console.error('Usage: vigent replay <path>          Exact replay (default)');
          console.error('       vigent replay --ai <path>     AI-assisted replay');
          process.exit(1);
        }
        if (recordingPath === '--ai') {
          await runReplayMode(args[2]);
        } else {
          nativeBridge.stop(); // exact replay manages its own resources
          await runExactReplayMode(recordingPath);
          return;
        }
        break;
      }

      case 'record': {
        // Record mode doesn't need native-input, just native-swift
        const { startRecording } = await import('@vigent/recorder');
        const outputDir = args[1] || `recordings/${new Date().toISOString().replace(/[:.]/g, '-')}`;
        nativeBridge.stop(); // startRecording manages its own bridge
        await startRecording(outputDir);
        return; // startRecording handles exit
      }

      default:
        console.log('Vigent — macOS Computer Use Agent\n');
        console.log('Commands:');
        console.log('  vigent run "task"       Run a task using natural language');
        console.log('  vigent replay <path>    Replay a recorded action sequence');
        console.log('  vigent record           Record your actions (coming soon)');
        break;
    }
  } finally {
    nativeBridge.stop();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
