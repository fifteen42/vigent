import { NATURAL_MODE_SYSTEM_PROMPT } from '../prompts.js';
import { allTools } from '../tools.js';
import { gemma4Model } from '../model.js';

export async function runNaturalMode(task: string) {
  // Dynamic import pi-mono (may not resolve until deps installed)
  const { Agent } = await import('@mariozechner/pi-agent-core');

  const agent = new Agent({
    initialState: {
      systemPrompt: NATURAL_MODE_SYSTEM_PROMPT,
      model: gemma4Model as any,
      tools: allTools as any,
      messages: [],
    },
  });

  // Subscribe to events for real-time output
  agent.subscribe((event: any) => {
    if (event.type === 'message_update' && event.assistantMessageEvent?.delta) {
      process.stdout.write(event.assistantMessageEvent.delta);
    }
    if (event.type === 'tool_execution_start') {
      console.log(`\n[Tool] ${event.toolName}(${JSON.stringify(event.args)})`);
    }
    if (event.type === 'tool_execution_end') {
      console.log(`[Tool] ${event.toolName} → done`);
    }
  });

  console.log(`\n🎯 Task: ${task}\n`);

  // Prepend instruction to screenshot first
  const prompt = `Task: ${task}\n\nStart by taking a screenshot to see the current screen state.`;
  await agent.prompt(prompt);

  console.log('\n\n✅ Task completed.');
}
