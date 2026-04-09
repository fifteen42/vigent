import type { BeforeToolCallContext, BeforeToolCallResult } from '@mariozechner/pi-agent-core';
import * as readline from 'node:readline';

export type RiskLevel = 'safe' | 'moderate' | 'dangerous';

const TOOL_RISK: Record<string, RiskLevel> = {
  // Safe — read-only, no side effects
  screenshot: 'safe',
  get_element_at: 'safe',
  get_screen_info: 'safe',
  wait: 'safe',
  wait_for_change: 'safe',
  get_clipboard: 'safe',

  // Moderate — write operations, UI changes
  click: 'moderate',
  type_text: 'moderate',
  press_key: 'moderate',
  press_keys: 'moderate',
  scroll: 'moderate',
  drag: 'moderate',
  open_app: 'moderate',
  focus_app: 'moderate',
  set_clipboard: 'moderate',

  // Generation (async, reversible)
  generate_video: 'moderate',
  generate_image: 'moderate',
  text_to_speech: 'moderate',

  // Dangerous — can execute arbitrary code
  run_applescript: 'dangerous',
};

export type PermissionMode = 'auto' | 'ask' | 'deny';

export function createPermissionGuard(mode: PermissionMode) {
  return async (ctx: BeforeToolCallContext): Promise<BeforeToolCallResult | undefined> => {
    const risk = TOOL_RISK[ctx.toolCall.name] ?? 'dangerous';

    if (mode === 'deny' && risk !== 'safe') {
      return {
        block: true,
        reason: `Tool '${ctx.toolCall.name}' blocked in deny mode (risk: ${risk})`,
      };
    }

    if (mode === 'ask' && risk === 'dangerous') {
      const approved = await promptUser(
        `\n⚠️  Agent wants to run: ${ctx.toolCall.name}(${JSON.stringify(ctx.args)})\nApprove? [y/N]: `
      );
      if (!approved) {
        return { block: true, reason: 'User denied the action' };
      }
    }

    return undefined;
  };
}

async function promptUser(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}
