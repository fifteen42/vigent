import { Agent } from '@mariozechner/pi-agent-core';
import type { NativeModules } from '../tools/index.js';
import { createComputerUseTools } from '../tools/index.js';
import { COMPUTER_USE_SYSTEM_PROMPT } from '../prompts.js';
import { resolveModel } from '../models.js';
import { createPermissionGuard } from '../permissions.js';
import { pruneScreenshots } from '../context-manager.js';
import { BudgetTracker } from '../budget-tracker.js';
import type { VigentConfig } from '../config.js';

// Track consecutive failures for a tool to implement retry logic
interface FailureRecord {
  count: number;
  lastError: string;
}

export async function runComputerUse(task: string, native: NativeModules, config: VigentConfig) {
  const model = resolveModel(config.model, config.ollamaBaseUrl);
  const tools = createComputerUseTools(native, config);
  const permissionGuard = createPermissionGuard(config.permissionMode);
  const budget = new BudgetTracker(model.contextWindow ?? 200_000);

  let actionCount = 0;
  const failureTracker = new Map<string, FailureRecord>();
  const MAX_CONSECUTIVE_FAILURES = 3;

  const actionTools = new Set(['click', 'click_element', 'type_text', 'press_key', 'press_keys', 'scroll', 'drag', 'run_applescript']);

  const agent = new Agent({
    initialState: {
      systemPrompt: COMPUTER_USE_SYSTEM_PROMPT,
      model,
      tools,
      messages: [],
    },
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
      // Budget check
      const status = budget.check(ctx.context.messages);
      if (status.isDiminishing) {
        return { block: true, reason: 'Context window nearly full. Wrapping up.' };
      }

      // Action step limit
      if (actionTools.has(ctx.toolCall.name)) {
        actionCount++;
        if (actionCount > config.maxSteps) {
          return { block: true, reason: `Max action limit (${config.maxSteps}) reached.` };
        }
      }

      // Check if this tool has failed too many times consecutively
      const record = failureTracker.get(ctx.toolCall.name);
      if (record && record.count >= MAX_CONSECUTIVE_FAILURES) {
        failureTracker.delete(ctx.toolCall.name); // reset so model can try differently
        return {
          block: true,
          reason: `Tool '${ctx.toolCall.name}' failed ${MAX_CONSECUTIVE_FAILURES} times in a row (last error: ${record.lastError}). Try a different approach.`,
        };
      }

      // Permission check
      return permissionGuard(ctx);
    },
    afterToolCall: async ({ toolCall, result, isError }) => {
      const name = toolCall.name;

      if (isError) {
        // Update failure tracker
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

      // Success — reset failure counter for this tool
      if (failureTracker.has(name)) {
        failureTracker.delete(name);
      }
    },
  });

  agent.subscribe((event: any) => {
    switch (event.type) {
      case 'message_update':
        if (event.assistantMessageEvent?.type === 'text_delta') {
          process.stdout.write(event.assistantMessageEvent.delta);
        }
        break;
      case 'tool_execution_start':
        process.stderr.write(`\n  [→] ${event.toolName}(${formatArgs(event.args)})\n`);
        break;
      case 'tool_execution_end':
        process.stderr.write(`  [✓] done\n`);
        break;
      case 'agent_end':
        process.stderr.write('\n');
        break;
    }
  });

  process.stderr.write(`\n[Model: ${model.name}] [Task: ${task}]\n\n`);

  await agent.prompt(`Task: ${task}\n\nStart by calling screenshot_marked to observe the current screen state with interactive element markers.`);

  process.stderr.write(`\nActions taken: ${actionCount}\n`);
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
      'Try using direct UI interaction (click, type_text) instead.',
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
