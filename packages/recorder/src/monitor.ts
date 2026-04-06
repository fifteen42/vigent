import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { VigentNativeBridge, type RecordedEventData } from '@vigent/native-swift';
import type { ActionEvent, ActionLog } from '@vigent/core';

export async function startRecording(outputDir: string): Promise<void> {
  const bridge = new VigentNativeBridge();
  bridge.start();

  const hasAccess = await bridge.checkAccessibility();
  if (!hasAccess) {
    console.error('❌ Accessibility permission required.');
    console.error('   System Settings → Privacy & Security → Accessibility');
    bridge.stop();
    process.exit(1);
  }

  // Create output directory
  const screenshotDir = join(outputDir, 'screenshots');
  mkdirSync(screenshotDir, { recursive: true });

  const events: ActionEvent[] = [];
  const startTime = Date.now();
  let eventCount = 0;
  let isRunning = true;

  console.log('📹 Recording started. Press Ctrl+C to stop.\n');

  // Start event monitoring
  await bridge.startRecording();

  // Handle Ctrl+C
  const cleanup = async () => {
    if (!isRunning) return;
    isRunning = false;

    console.log('\n\n⏹  Stopping recording...');

    await bridge.stopRecording();

    const actionLog: ActionLog = {
      id: new Date().toISOString().replace(/[:.]/g, '-'),
      startTime,
      endTime: Date.now(),
      events,
    };

    const logPath = join(outputDir, 'actions.json');
    writeFileSync(logPath, JSON.stringify(actionLog, null, 2));

    console.log(`✅ Recording saved:`);
    console.log(`   Events: ${events.length}`);
    console.log(`   Duration: ${((actionLog.endTime - actionLog.startTime) / 1000).toFixed(1)}s`);
    console.log(`   Output: ${logPath}`);

    bridge.stop();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // Poll for events
  while (isRunning) {
    await sleep(300);
    if (!isRunning) break;

    let rawEvents: RecordedEventData[];
    try {
      rawEvents = await bridge.pollEvents();
    } catch {
      break;
    }

    for (const raw of rawEvents) {
      eventCount++;
      const padded = String(eventCount).padStart(3, '0');

      // Take screenshot for this event
      let screenshotPath = '';
      try {
        const shot = await bridge.screenshot(0.5, 1512, 982);
        const filename = `${padded}-${raw.type}.jpg`;
        screenshotPath = join(screenshotDir, filename);
        writeFileSync(screenshotPath, new Uint8Array(Buffer.from(shot.base64, 'base64')));
      } catch {
        // Screenshot failed, continue without it
      }

      // Get app info
      let appName = 'unknown';
      let windowTitle = 'unknown';
      try {
        const app = await bridge.getFrontmostApp();
        appName = app.name;
      } catch {}
      try {
        windowTitle = await bridge.getWindowTitle();
      } catch {}

      // Convert to ActionEvent
      const actionEvent: ActionEvent = {
        timestamp: startTime + raw.timestamp * 1000,
        type: raw.type as ActionEvent['type'],
        coordinates: raw.x != null && raw.y != null ? { x: raw.x, y: raw.y } : undefined,
        key: raw.key ?? undefined,
        modifiers: raw.modifiers.length > 0 ? raw.modifiers : undefined,
        scrollDelta: raw.scrollDeltaX != null || raw.scrollDeltaY != null
          ? { dx: raw.scrollDeltaX ?? 0, dy: raw.scrollDeltaY ?? 0 }
          : undefined,
        app: appName,
        windowTitle,
        screenshotPath,
      };

      events.push(actionEvent);

      // Print event to console
      const timeStr = raw.timestamp.toFixed(2).padStart(8);
      let desc = `[${timeStr}s] ${raw.type}`;
      if (raw.x != null) desc += ` at (${Math.round(raw.x)}, ${Math.round(raw.y!)})`;
      if (raw.key) {
        const mods = raw.modifiers.length > 0 ? raw.modifiers.join('+') + '+' : '';
        desc += ` key: ${mods}${raw.key}`;
      }
      if (raw.scrollDeltaY) desc += ` scroll: ${raw.scrollDeltaY!.toFixed(1)}`;
      desc += ` | ${appName}`;
      console.log(desc);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
