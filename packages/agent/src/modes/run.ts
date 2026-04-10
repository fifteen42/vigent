import { Agent } from '@mariozechner/pi-agent-core';
import type { NativeModules } from '../tools/index.js';
import { createComputerUseTools } from '../tools/index.js';
import { COMPUTER_USE_SYSTEM_PROMPT } from '../prompts.js';
import { resolveModel } from '../models.js';
import { createPermissionGuard } from '../permissions.js';
import { pruneScreenshots } from '../context-manager.js';
import { BudgetTracker } from '../budget-tracker.js';
import { SessionLogger } from '../session-log.js';
import type { VigentConfig } from '../config.js';
import type { EventCallback } from '@vigent/core';

interface FailureRecord {
  count: number;
  lastError: string;
}

export async function runComputerUse(
  task: string,
  native: NativeModules,
  config: VigentConfig,
  onEvent?: EventCallback,
  signal?: AbortSignal,
) {
  const sessionLog = new SessionLogger(task);
  const emit: EventCallback = (event) => {
    onEvent?.(event);
    sessionLog.log(event);
  };
  const model = resolveModel(config.model, config.ollamaBaseUrl);
  const tools = createComputerUseTools(native, config);
  const permissionGuard = createPermissionGuard(config.permissionMode);
  const budget = new BudgetTracker(model.contextWindow ?? 200_000);

  let actionCount = 0;
  const failureTracker = new Map<string, FailureRecord>();
  const MAX_CONSECUTIVE_FAILURES = 3;
  const actionTools = new Set([
    'click', 'click_element', 'type_text', 'press_key', 'press_keys',
    'scroll', 'drag', 'run_applescript', 'run_shell',
  ]);

  const toolStartTimes = new Map<string, number>();

  // Gemini 2.5 Pro requires thinking mode to be enabled
  const needsThinking = model.id === 'gemini-2.5-pro' || /thinking/i.test(model.name);

  const agent = new Agent({
    initialState: {
      systemPrompt: COMPUTER_USE_SYSTEM_PROMPT,
      model,
      tools,
      messages: [],
      thinkingLevel: needsThinking ? 'low' : 'off',
    },
    thinkingBudgets: needsThinking ? { minimal: 512, low: 1024, medium: 4096, high: 16384 } : undefined,
    getApiKey: async (provider: string) => {
      if (provider === 'anthropic') return config.anthropicApiKey;
      if (provider === 'google') return config.googleApiKey;
      return undefined;
    },
    transformContext: (messages) => pruneScreenshots(messages, {
      keepRecentScreenshots: config.keepRecentScreenshots,
      maxTokens: config.maxContextTokens,
    }),
    beforeToolCall: async (ctx) => {
      // Respect abort signal
      if (signal?.aborted) {
        return { block: true, reason: 'Task cancelled by user.' };
      }

      const status = budget.check(ctx.context.messages);
      if (status.isDiminishing) {
        return { block: true, reason: 'Context window nearly full. Wrapping up.' };
      }

      if (actionTools.has(ctx.toolCall.name)) {
        actionCount++;
        emit({ type: 'step', current: actionCount, max: config.maxSteps });
        if (actionCount > config.maxSteps) {
          return { block: true, reason: `Max action limit (${config.maxSteps}) reached.` };
        }
      }

      const record = failureTracker.get(ctx.toolCall.name);
      if (record && record.count >= MAX_CONSECUTIVE_FAILURES) {
        failureTracker.delete(ctx.toolCall.name);
        return {
          block: true,
          reason: `Tool '${ctx.toolCall.name}' failed ${MAX_CONSECUTIVE_FAILURES} times in a row (last error: ${record.lastError}). Try a different approach.`,
        };
      }

      return permissionGuard(ctx);
    },
    afterToolCall: async ({ toolCall, result, isError, context }) => {
      const name = toolCall.name;
      const durationMs = Date.now() - (toolStartTimes.get(name) ?? Date.now());
      toolStartTimes.delete(name);

      emit({ type: 'tool_end', name, durationMs, isError });

      // Emit budget after each tool call so UI can show context usage
      if (context?.messages) {
        const budgetStatus = budget.check(context.messages);
        emit({
          type: 'budget',
          usedTokens: budgetStatus.usedTokens,
          maxTokens: budgetStatus.maxTokens,
          usedPercent: budgetStatus.usedPercent,
        });
      }

      // Emit Gen UI panel events based on tool results
      if (!isError) {
        emitPanelFromResult(name, toolCall.arguments, result, emit);
      }

      if (isError) {
        const prev = failureTracker.get(name) ?? { count: 0, lastError: '' };
        const errorMsg = result.content
          .filter((c: any) => c.type === 'text')
          .map((c: any) => c.text)
          .join(' ')
          .slice(0, 200);
        failureTracker.set(name, { count: prev.count + 1, lastError: errorMsg });

        const consecutiveFails = prev.count + 1;
        const advice = buildRecoveryAdvice(name, consecutiveFails);

        return {
          content: [
            ...result.content,
            {
              type: 'text' as const,
              text: `⚠️ '${name}' failed (attempt ${consecutiveFails}/${MAX_CONSECUTIVE_FAILURES}). ${advice}`,
            },
          ],
        };
      }

      if (failureTracker.has(name)) failureTracker.delete(name);
    },
  });

  agent.subscribe((event: any) => {
    // DEBUG: log all event types
    if (process.env.VIGENT_DEBUG) {
      process.stderr.write(`[debug:event] ${event.type}\n`);
    }
    switch (event.type) {
      case 'message_update':
        if (event.assistantMessageEvent?.type === 'text_delta') {
          const delta: string = event.assistantMessageEvent.delta;
          process.stdout.write(delta);
          emit({ type: 'text', delta });
        }
        break;
      case 'tool_execution_start':
        process.stderr.write(`\n  [→] ${event.toolName}(${formatArgs(event.args)})\n`);
        toolStartTimes.set(event.toolName, Date.now());
        emit({
          type: 'tool_start',
          name: event.toolName,
          label: event.toolName,
          args: event.args ?? {},
        });
        break;
      case 'tool_execution_end':
        process.stderr.write(`  [✓] done\n`);
        break;
      case 'message_end':
        // Surface stopReason / errorMessage from the assistant message
        if (event.message?.role === 'assistant') {
          const stopReason = event.message.stopReason;
          const errorMsg = event.message.errorMessage;
          if (stopReason === 'error' || stopReason === 'aborted') {
            const text = `LLM error (${stopReason}): ${errorMsg ?? 'no details'}`;
            process.stderr.write(`\n❌ ${text}\n`);
            emit({ type: 'error', message: text });
          }
        }
        break;
      case 'agent_end':
        process.stderr.write('\n');
        break;
    }
  });

  process.stderr.write(`\n[Model: ${model.name}] [Task: ${task}]\n\n`);

  try {
    await agent.prompt(
      `Task: ${task}\n\nStart by calling screenshot_marked to observe the current screen state with interactive element markers.`
    );
  } catch (err) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
    process.stderr.write(`\n❌ agent.prompt threw: ${msg}\n`);
    emit({ type: 'error', message: msg.split('\n')[0] });
  }

  // Check if the last message has an error state
  const lastMsg = agent.state.messages[agent.state.messages.length - 1];
  if (lastMsg?.role === 'assistant' && (lastMsg as any).stopReason === 'error') {
    const errText = (lastMsg as any).errorMessage ?? 'unknown LLM error';
    process.stderr.write(`\n❌ Last message error: ${errText}\n`);
    emit({ type: 'error', message: errText });
  }

  emit({ type: 'done', actionCount });
  process.stderr.write(`\nActions taken: ${actionCount}\n`);
  process.stderr.write(`Session log: ${sessionLog.path}\n`);
}

// ── Panel emission from tool results ──────────────────────────────────────────

function emitPanelFromResult(
  toolName: string,
  args: unknown,
  result: any,
  emit: EventCallback,
) {
  const a = args as any;

  switch (toolName) {
    case 'screenshot':
    case 'screenshot_marked': {
      const img = result.content?.find((c: any) => c.type === 'image');
      const details = result.details ?? {};
      if (img?.data) {
        emit({
          type: 'panel',
          panel: {
            kind: 'screen_mirror',
            base64: img.data,
            width: details.width ?? 0,
            height: details.height ?? 0,
            elements: details.elements ?? [],
          },
        });
      }
      break;
    }

    case 'generate_video': {
      const text = result.content?.find((c: any) => c.type === 'text')?.text ?? '';
      const url = text.match(/https?:\/\/\S+/)?.[0];
      emit({
        type: 'panel',
        panel: {
          kind: 'video_production',
          prompt: a?.prompt ?? '',
          status: url ? 'done' : 'generating',
          url,
        },
      });
      break;
    }

    case 'generate_image': {
      const text = result.content?.find((c: any) => c.type === 'text')?.text ?? '';
      const urls = [...text.matchAll(/https?:\/\/\S+/g)].map((m: any) => m[0]);
      if (urls.length > 0) {
        emit({
          type: 'panel',
          panel: { kind: 'image_gallery', prompt: a?.prompt ?? '', urls },
        });
      }
      break;
    }

    case 'tts': {
      const path = result.details?.outputPath ?? a?.outputPath ?? '';
      if (path) {
        emit({
          type: 'panel',
          panel: { kind: 'audio_player', localPath: path, text: a?.text },
        });
      }
      break;
    }

    case 'run_shell': {
      const details = result.details ?? {};
      emit({
        type: 'panel',
        panel: {
          kind: 'shell_output',
          command: details.command ?? a?.command ?? '',
          stdout: details.stdout ?? '',
          stderr: details.stderr,
        },
      });
      break;
    }

    case 'transcribe_audio': {
      const details = result.details ?? {};
      if (details.transcript && !details.error) {
        emit({
          type: 'panel',
          panel: {
            kind: 'transcript',
            text: details.transcript,
            language: details.language !== 'auto' ? details.language : undefined,
            sourceFile: details.sourceFile,
          },
        });
      }
      break;
    }

    case 'write_file': {
      const details = result.details ?? {};
      if (details.filePath && !details.error) {
        emit({
          type: 'panel',
          panel: {
            kind: 'file_output',
            localPath: details.filePath,
            sizeBytes: details.size,
          },
        });
      }
      break;
    }

    case 'search_web': {
      const details = result.details ?? {};
      if (details.results && details.results.length > 0) {
        emit({
          type: 'panel',
          panel: {
            kind: 'web_search',
            query: details.query ?? a?.query ?? '',
            results: details.results,
          },
        });
      }
      break;
    }

    case 'fetch_url': {
      const details = result.details ?? {};
      const text = result.content?.find((c: any) => c.type === 'text')?.text ?? '';
      if (!details.error && text) {
        emit({
          type: 'panel',
          panel: {
            kind: 'web_content',
            url: details.url ?? a?.url ?? '',
            content: text,
          },
        });
      }
      break;
    }
  }
}

function buildRecoveryAdvice(toolName: string, failCount: number): string {
  const suggestions: Record<string, string[]> = {
    click: [
      'Verify the coordinates using screenshot_marked.',
      'Try using click_element with an element ID instead.',
      'Check if the target app is focused using get_screen_info.',
    ],
    click_element: [
      'Call screenshot_marked again to refresh element IDs — the UI may have changed.',
      'Fall back to click with coordinates if the element is visible but not in the list.',
    ],
    type_text: [
      'Click the input field first to focus it, then try typing.',
      'Try using press_key or keyboard shortcuts instead.',
    ],
    run_applescript: [
      'Check if the application supports AppleScript.',
      'Try using run_shell with a shell command instead.',
    ],
    run_shell: [
      'Check the command syntax. Use get_clipboard or screenshot to inspect output.',
      'Try breaking the command into smaller parts.',
    ],
  };

  const tips = suggestions[toolName] ?? [
    'Take screenshot_marked to reassess the screen state.',
    'Try a different tool or approach.',
  ];
  return tips[(failCount - 1) % tips.length];
}

function formatArgs(args: unknown): string {
  if (!args || typeof args !== 'object') return '';
  const s = JSON.stringify(args);
  return s.length > 80 ? s.slice(0, 77) + '...' : s;
}
