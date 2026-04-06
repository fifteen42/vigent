import { readFileSync } from 'node:fs';
import type { ActionLog } from '@vigent/core';
import { REPLAY_MODE_SYSTEM_PROMPT } from '../prompts.js';
import { allTools } from '../tools.js';
import { gemma4Model } from '../model.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Exact replay mode — replays recorded events using precise coordinates and timing.
 * No model needed, 100% deterministic.
 */
export async function runExactReplayMode(recordingPath: string) {
  const raw = readFileSync(recordingPath, 'utf-8');
  const actionLog: ActionLog = JSON.parse(raw);
  const nativeInput = (await import('@vigent/native-input')).default ?? (await import('@vigent/native-input'));

  console.log(`\n▶️  Exact replay: ${actionLog.id}`);
  console.log(`   Events: ${actionLog.events.length}`);
  console.log(`   Duration: ${((actionLog.endTime - actionLog.startTime) / 1000).toFixed(1)}s`);
  console.log(`   Mode: exact coordinates (no model)\n`);

  // Restore environment: try to open the first event's app
  const firstApp = actionLog.events[0]?.app;
  if (firstApp && firstApp !== 'unknown') {
    console.log(`📱 Restoring environment: opening ${firstApp}...`);
    const { VigentNativeBridge } = await import('@vigent/native-swift');
    const bridge = new VigentNativeBridge();
    bridge.start();
    try {
      await bridge.openApp(firstApp);
      await sleep(2000);
      console.log(`   ${firstApp} is now in foreground.\n`);
    } catch {
      console.log(`   Could not open ${firstApp}, continuing anyway.\n`);
    } finally {
      bridge.stop();
    }
  }

  let lastTimestamp = actionLog.startTime;

  for (let i = 0; i < actionLog.events.length; i++) {
    const event = actionLog.events[i];

    // Wait for the time delta between events
    const delta = event.timestamp - lastTimestamp;
    if (delta > 0) {
      await sleep(Math.min(delta, 5000)); // Cap wait at 5s
    }
    lastTimestamp = event.timestamp;

    const timeStr = ((event.timestamp - actionLog.startTime) / 1000).toFixed(2);
    let desc = `[${timeStr}s] ${event.type}`;

    switch (event.type) {
      case 'click': {
        const { x, y } = event.coordinates!;
        nativeInput.moveMouse(Math.round(x), Math.round(y));
        await sleep(50);
        nativeInput.mouseClick('left', 1);
        await sleep(500); // Wait for UI to respond to click
        desc += ` at (${Math.round(x)}, ${Math.round(y)})`;
        break;
      }
      case 'double_click': {
        const { x, y } = event.coordinates!;
        nativeInput.moveMouse(Math.round(x), Math.round(y));
        await sleep(50);
        nativeInput.mouseClick('left', 2);
        desc += ` at (${Math.round(x)}, ${Math.round(y)})`;
        break;
      }
      case 'right_click': {
        const { x, y } = event.coordinates!;
        nativeInput.moveMouse(Math.round(x), Math.round(y));
        await sleep(50);
        nativeInput.mouseClick('right', 1);
        desc += ` at (${Math.round(x)}, ${Math.round(y)})`;
        break;
      }
      case 'key': {
        if (event.modifiers?.length) {
          nativeInput.pressKeys([...event.modifiers, event.key!]);
          desc += ` ${event.modifiers.join('+')}+${event.key}`;
        } else {
          nativeInput.pressKey(event.key!);
          desc += ` ${event.key}`;
        }
        break;
      }
      case 'scroll': {
        if (event.coordinates) {
          nativeInput.moveMouse(Math.round(event.coordinates.x), Math.round(event.coordinates.y));
          await sleep(50);
        }
        nativeInput.mouseScroll(
          Math.round(event.scrollDelta?.dx ?? 0),
          Math.round(event.scrollDelta?.dy ?? 0)
        );
        desc += ` (${event.scrollDelta?.dx ?? 0}, ${event.scrollDelta?.dy ?? 0})`;
        break;
      }
      default:
        desc += ' (skipped)';
    }

    desc += ` | ${event.app}`;
    console.log(desc);
    await sleep(100); // Small pause between actions
  }

  console.log('\n✅ Exact replay completed.');
}

function formatActionLog(log: ActionLog): string {
  const lines = [`Recording ID: ${log.id}`, `Duration: ${((log.endTime - log.startTime) / 1000).toFixed(1)}s`, ''];

  for (const event of log.events) {
    const time = ((event.timestamp - log.startTime) / 1000).toFixed(2);
    let desc = `[${time}s] ${event.type}`;

    if (event.coordinates) {
      desc += ` at (${event.coordinates.x}, ${event.coordinates.y})`;
    }
    if (event.key) {
      const mods = event.modifiers?.length ? event.modifiers.join('+') + '+' : '';
      desc += ` key: ${mods}${event.key}`;
    }
    if (event.scrollDelta) {
      desc += ` scroll: (${event.scrollDelta.dx}, ${event.scrollDelta.dy})`;
    }
    desc += ` | App: ${event.app} | Window: ${event.windowTitle}`;
    if (event.uiElement) {
      desc += ` | Element: ${event.uiElement}`;
    }

    lines.push(desc);
  }

  return lines.join('\n');
}

export async function runReplayMode(recordingPath: string) {
  const raw = readFileSync(recordingPath, 'utf-8');
  const actionLog: ActionLog = JSON.parse(raw);

  const { Agent } = await import('@mariozechner/pi-agent-core');

  const agent = new Agent({
    initialState: {
      systemPrompt: REPLAY_MODE_SYSTEM_PROMPT,
      model: gemma4Model as any,
      tools: allTools as any,
      messages: [],
    },
  });

  agent.subscribe((event: any) => {
    if (event.type === 'message_update' && event.assistantMessageEvent?.delta) {
      process.stdout.write(event.assistantMessageEvent.delta);
    }
    if (event.type === 'tool_execution_start') {
      console.log(`\n[Tool] ${event.toolName}(${JSON.stringify(event.args)})`);
    }
  });

  const formattedLog = formatActionLog(actionLog);

  console.log(`\n🔄 Replaying recording: ${actionLog.id}`);
  console.log(`   Events: ${actionLog.events.length}`);
  console.log(`   Duration: ${((actionLog.endTime - actionLog.startTime) / 1000).toFixed(1)}s\n`);

  const prompt = `Here is a recorded action sequence. Understand the intent and replay it.\n\n${formattedLog}\n\nStart by taking a screenshot to see the current screen state, then replay the actions.`;
  await agent.prompt(prompt);

  console.log('\n\n✅ Replay completed.');
}
