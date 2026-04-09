import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';
import type { WorkflowDefinition, WorkflowStep, StepAction } from './types.js';

export function parseWorkflow(filePath: string): WorkflowDefinition {
  const raw = readFileSync(filePath, 'utf-8');
  const doc = yaml.load(raw) as any;

  if (!doc || typeof doc !== 'object') {
    throw new Error('Invalid workflow file: must be a YAML object');
  }
  if (!doc.name) throw new Error('Workflow must have a "name" field');
  if (!Array.isArray(doc.steps) || doc.steps.length === 0) {
    throw new Error('Workflow must have at least one step in "steps"');
  }

  const steps: WorkflowStep[] = doc.steps.map((raw: any, idx: number) => {
    if (!raw.id) throw new Error(`Step ${idx + 1} missing required "id" field`);
    const action = parseAction(raw, idx);
    return {
      id: raw.id,
      name: raw.name,
      action,
      dependsOn: raw.dependsOn ?? raw.depends_on,
      condition: raw.condition,
      retry: raw.retry,
      outputVar: raw.outputVar ?? raw.output_var,
      timeoutMs: raw.timeoutMs ?? raw.timeout_ms,
      continueOnError: raw.continueOnError ?? raw.continue_on_error ?? false,
    } satisfies WorkflowStep;
  });

  // Validate dependencies reference real step IDs
  const stepIds = new Set(steps.map(s => s.id));
  for (const step of steps) {
    for (const dep of step.dependsOn ?? []) {
      if (!stepIds.has(dep)) {
        throw new Error(`Step "${step.id}" depends on unknown step "${dep}"`);
      }
    }
  }

  return {
    name: doc.name,
    description: doc.description,
    version: doc.version,
    triggers: doc.triggers,
    env: doc.env,
    steps,
  };
}

function parseAction(raw: any, idx: number): StepAction {
  const type = raw.action?.type ?? raw.type;
  if (!type) throw new Error(`Step ${idx + 1} (id="${raw.id}") missing "action.type"`);

  switch (type) {
    case 'run':
      if (!raw.action?.task && !raw.task) throw new Error(`Step "${raw.id}": run requires "task"`);
      return { type: 'run', task: raw.action?.task ?? raw.task };

    case 'video':
      if (!raw.action?.path && !raw.path) throw new Error(`Step "${raw.id}": video requires "path"`);
      return { type: 'video', path: raw.action?.path ?? raw.path, question: raw.action?.question ?? raw.question };

    case 'transcribe':
      if (!raw.action?.path && !raw.path) throw new Error(`Step "${raw.id}": transcribe requires "path"`);
      return { type: 'transcribe', path: raw.action?.path ?? raw.path, language: raw.action?.language ?? raw.language };

    case 'generate_video':
      if (!raw.action?.prompt && !raw.prompt) throw new Error(`Step "${raw.id}": generate_video requires "prompt"`);
      return { type: 'generate_video', prompt: raw.action?.prompt ?? raw.prompt, outputPath: raw.action?.outputPath ?? raw.output_path };

    case 'generate_image':
      if (!raw.action?.prompt && !raw.prompt) throw new Error(`Step "${raw.id}": generate_image requires "prompt"`);
      return { type: 'generate_image', prompt: raw.action?.prompt ?? raw.prompt, outputPath: raw.action?.outputPath ?? raw.output_path };

    case 'tts':
      if (!raw.action?.text && !raw.text) throw new Error(`Step "${raw.id}": tts requires "text"`);
      return { type: 'tts', text: raw.action?.text ?? raw.text, outputPath: raw.action?.outputPath ?? raw.output_path, voiceId: raw.action?.voiceId ?? raw.voice_id };

    case 'screenshot':
      return { type: 'screenshot', outputPath: raw.action?.outputPath ?? raw.output_path };

    case 'shell':
      if (!raw.action?.command && !raw.command) throw new Error(`Step "${raw.id}": shell requires "command"`);
      return { type: 'shell', command: raw.action?.command ?? raw.command };

    case 'workflow':
      if (!raw.action?.path && !raw.path) throw new Error(`Step "${raw.id}": workflow requires "path"`);
      return { type: 'workflow', path: raw.action?.path ?? raw.path };

    default:
      throw new Error(`Step "${raw.id}": unknown action type "${type}"`);
  }
}
