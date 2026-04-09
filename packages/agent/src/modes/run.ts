import { Agent } from '@mariozechner/pi-agent-core';
import type { NativeModules } from '../tools/index.js';
import { createComputerUseTools } from '../tools/index.js';
import { COMPUTER_USE_SYSTEM_PROMPT } from '../prompts.js';
import { resolveModel } from '../models.js';
import { createPermissionGuard } from '../permissions.js';
import { pruneScreenshots } from '../context-manager.js';
import { BudgetTracker } from '../budget-tracker.js';
import type { VigentConfig } from '../config.js';

export async function runComputerUse(task: string, native: NativeModules, config: VigentConfig) {
  const model = resolveModel(config.model, config.ollamaBaseUrl);
  const tools = createComputerUseTools(native, config);
  const permissionGuard = createPermissionGuard(config.permissionMode);
  const budget = new BudgetTracker(model.contextWindow ?? 200_000);

  let actionCount = 0;

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
      const actionTools = new Set(['click', 'type_text', 'press_key', 'press_keys', 'scroll', 'drag', 'run_applescript']);
      if (actionTools.has(ctx.toolCall.name)) {
        actionCount++;
        if (actionCount > config.maxSteps) {
          return { block: true, reason: `Max action limit (${config.maxSteps}) reached.` };
        }
      }

      // Permission check
      return permissionGuard(ctx);
    },
    afterToolCall: async ({ toolCall, result, isError }) => {
      if (isError) {
        return {
          content: [
            ...result.content,
            { type: 'text' as const, text: `⚠️ Tool '${toolCall.name}' failed. Try: 1) Verify coordinates via screenshot 2) Check app is focused 3) Alternative approach` },
          ],
        };
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

  await agent.prompt(`Task: ${task}\n\nStart by taking a screenshot to observe the current screen state.`);

  process.stderr.write(`\nActions taken: ${actionCount}\n`);
}

function formatArgs(args: unknown): string {
  if (!args || typeof args !== 'object') return '';
  const s = JSON.stringify(args);
  return s.length > 80 ? s.slice(0, 77) + '...' : s;
}
