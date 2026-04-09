import { execSync, execFileSync } from 'node:child_process';
import type {
  WorkflowDefinition, WorkflowStep, StepResult, WorkflowResult, StepStatus,
} from './types.js';

export interface RunnerOptions {
  /** Path to the vigent CLI binary */
  vigentBin?: string;
  /** Extra environment variables injected into every step */
  env?: Record<string, string>;
  /** Called when a step starts */
  onStepStart?: (step: WorkflowStep) => void;
  /** Called when a step completes */
  onStepEnd?: (step: WorkflowStep, result: StepResult) => void;
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

export async function runWorkflow(
  workflow: WorkflowDefinition,
  opts: RunnerOptions = {}
): Promise<WorkflowResult> {
  const workflowStart = Date.now();
  const vigentBin = opts.vigentBin ?? 'vigent';

  // Build merged env: process.env + workflow.env + caller env
  const baseEnv: Record<string, string> = {
    ...process.env as Record<string, string>,
    ...(workflow.env ?? {}),
    ...(opts.env ?? {}),
  };

  const stepResults = new Map<string, StepResult>();
  // Output values exported by steps (outputVar → value)
  const outputVars: Record<string, string> = {};

  const allStepIds = new Set(workflow.steps.map(s => s.id));
  const completed = new Set<string>();
  const failed = new Set<string>();

  let overallFailed = false;

  // Topological execution: keep iterating until all steps are resolved
  const pending = new Set(workflow.steps.map(s => s.id));

  while (pending.size > 0) {
    // Find steps whose dependencies are all satisfied
    const ready: WorkflowStep[] = [];
    for (const step of workflow.steps) {
      if (!pending.has(step.id)) continue;
      const deps = step.dependsOn ?? [];
      const depsOk = deps.every(d => completed.has(d) || (failed.has(d) && workflow.steps.find(s => s.id === d)?.continueOnError));
      if (depsOk) ready.push(step);
    }

    if (ready.length === 0) {
      // Check for circular or unresolvable deps
      const blocked = Array.from(pending);
      process.stderr.write(`\n[Workflow] Stuck — cannot resolve steps: ${blocked.join(', ')}\n`);
      break;
    }

    // Run all ready steps (could parallelize, but sequential for predictability)
    for (const step of ready) {
      pending.delete(step.id);

      // Evaluate condition if present
      if (step.condition) {
        const condResult = evalCondition(step.condition, outputVars);
        if (!condResult) {
          stepResults.set(step.id, {
            stepId: step.id, status: 'skipped', durationMs: 0, startedAt: Date.now(),
          });
          completed.add(step.id);
          process.stderr.write(`\n[Workflow] ⏭  Skipped: ${step.name ?? step.id} (condition false)\n`);
          continue;
        }
      }

      opts.onStepStart?.(step);
      const stepStart = Date.now();
      process.stderr.write(`\n[Workflow] ▶  ${step.name ?? step.id}\n`);

      let result: StepResult;
      try {
        const output = await executeStepWithRetry(step, vigentBin, baseEnv, outputVars);
        const durationMs = Date.now() - stepStart;
        result = { stepId: step.id, status: 'completed', output, durationMs, startedAt: stepStart };

        // Export output to env var if requested
        if (step.outputVar && output) {
          outputVars[step.outputVar] = output.trim();
          process.stderr.write(`  → ${step.outputVar}=${outputVars[step.outputVar].slice(0, 80)}\n`);
        }

        completed.add(step.id);
        process.stderr.write(`[Workflow] ✓  ${step.name ?? step.id} (${durationMs}ms)\n`);
      } catch (err: any) {
        const durationMs = Date.now() - stepStart;
        const error = err?.message ?? String(err);
        result = { stepId: step.id, status: 'failed', error, durationMs, startedAt: stepStart };

        if (step.continueOnError) {
          process.stderr.write(`[Workflow] ⚠  ${step.name ?? step.id} failed (continuing): ${error}\n`);
          failed.add(step.id);
          completed.add(step.id); // treat as "done" for dependency resolution
        } else {
          process.stderr.write(`[Workflow] ✗  ${step.name ?? step.id} failed: ${error}\n`);
          failed.add(step.id);
          overallFailed = true;
          // Mark remaining dependent steps as failed
          cancelDependents(step.id, workflow.steps, pending, stepResults, failed);
        }
      }

      stepResults.set(step.id, result);
      opts.onStepEnd?.(step, result);
    }
  }

  const durationMs = Date.now() - workflowStart;
  const status = overallFailed ? 'failed' : 'completed';
  process.stderr.write(`\n[Workflow] ${status === 'completed' ? '✓ Done' : '✗ Failed'} in ${(durationMs / 1000).toFixed(1)}s\n`);

  return {
    name: workflow.name,
    status,
    steps: workflow.steps.map(s => stepResults.get(s.id) ?? {
      stepId: s.id, status: 'skipped', durationMs: 0, startedAt: 0,
    }),
    durationMs,
    startedAt: workflowStart,
  };
}

async function executeStepWithRetry(
  step: WorkflowStep,
  vigentBin: string,
  env: Record<string, string>,
  outputVars: Record<string, string>
): Promise<string> {
  const maxAttempts = step.retry?.maxAttempts ?? 1;
  const delayMs = step.retry?.delayMs ?? 2000;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (attempt > 1) {
        process.stderr.write(`  ↻ Retry ${attempt}/${maxAttempts}...\n`);
        await sleep(delayMs);
      }
      return await executeStep(step, vigentBin, env, outputVars);
    } catch (err: any) {
      lastError = err;
    }
  }

  throw lastError;
}

async function executeStep(
  step: WorkflowStep,
  vigentBin: string,
  env: Record<string, string>,
  outputVars: Record<string, string>
): Promise<string> {
  const action = step.action;
  const timeout = step.timeoutMs;

  // Interpolate outputVars into string values
  const interpolate = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => outputVars[k] ?? '');

  switch (action.type) {
    case 'run': {
      const task = interpolate(action.task);
      return runCli([vigentBin, 'run', task], env, timeout);
    }
    case 'video': {
      const path = interpolate(action.path);
      const question = action.question ? interpolate(action.question) : 'Describe this video.';
      return runCli([vigentBin, 'video', path, question], env, timeout);
    }
    case 'transcribe': {
      const path = interpolate(action.path);
      const langArgs = action.language ? ['--language', action.language] : [];
      return runCli([vigentBin, 'transcribe', path, ...langArgs], env, timeout);
    }
    case 'generate_video': {
      const prompt = interpolate(action.prompt);
      const output = await runCli([vigentBin, 'generate', 'video', prompt], env, timeout);
      if (action.outputPath && output.trim()) {
        // Download the video URL to outputPath
        const url = output.trim().split('\n').pop()!;
        await downloadFile(url, interpolate(action.outputPath));
      }
      return output;
    }
    case 'generate_image': {
      const prompt = interpolate(action.prompt);
      return runCli([vigentBin, 'generate', 'image', prompt], env, timeout);
    }
    case 'tts': {
      const text = interpolate(action.text);
      const outPath = action.outputPath ? interpolate(action.outputPath) : `tts_${Date.now()}.mp3`;
      const voiceArgs = action.voiceId ? ['--voice', action.voiceId] : [];
      return runCli([vigentBin, 'tts', text, '--output', outPath, ...voiceArgs], env, timeout);
    }
    case 'screenshot': {
      const outPath = action.outputPath ? interpolate(action.outputPath) : `screenshot_${Date.now()}.jpg`;
      return runCli([vigentBin, 'screenshot', outPath], env, timeout);
    }
    case 'shell': {
      const command = interpolate(action.command);
      return runShell(command, env, timeout);
    }
    case 'workflow': {
      // Import parser lazily to avoid circular dep
      const { parseWorkflow } = await import('./parser.js');
      const sub = parseWorkflow(interpolate(action.path));
      const result = await runWorkflow(sub, { vigentBin, env });
      if (result.status === 'failed') throw new Error(`Sub-workflow "${sub.name}" failed`);
      return `Sub-workflow "${sub.name}" completed`;
    }
    default:
      throw new Error(`Unknown action type: ${(action as any).type}`);
  }
}

function runCli(args: string[], env: Record<string, string>, timeoutMs?: number): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const output = execFileSync(args[0], args.slice(1), {
        env,
        timeout: timeoutMs,
        encoding: 'utf-8',
        stdio: ['inherit', 'pipe', 'inherit'],
      });
      resolve(output);
    } catch (err: any) {
      reject(new Error(err.stderr ?? err.message ?? String(err)));
    }
  });
}

function runShell(command: string, env: Record<string, string>, timeoutMs?: number): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const output = execSync(command, {
        env,
        timeout: timeoutMs,
        encoding: 'utf-8',
        stdio: ['inherit', 'pipe', 'inherit'],
      });
      resolve(output);
    } catch (err: any) {
      reject(new Error(err.stderr ?? err.message ?? String(err)));
    }
  });
}

async function downloadFile(url: string, destPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const { writeFileSync } = await import('node:fs');
  const buffer = await res.arrayBuffer();
  writeFileSync(destPath, new Uint8Array(buffer));
}

function evalCondition(condition: string, vars: Record<string, string>): boolean {
  // Simple condition: check if a var is non-empty, or evaluate basic expressions
  // E.g. "VIDEO_URL" (truthy if non-empty), "STEP_OUTPUT != error"
  const interpolated = condition.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
  const trimmed = interpolated.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false' || trimmed === '') return false;
  // Check if it's a var name that's non-empty
  if (/^\w+$/.test(trimmed)) return Boolean(vars[trimmed]);
  return Boolean(trimmed);
}

function cancelDependents(
  failedId: string,
  steps: WorkflowStep[],
  pending: Set<string>,
  results: Map<string, StepResult>,
  failed: Set<string>
): void {
  for (const step of steps) {
    if (!pending.has(step.id)) continue;
    if (step.dependsOn?.includes(failedId)) {
      pending.delete(step.id);
      failed.add(step.id);
      results.set(step.id, {
        stepId: step.id, status: 'skipped',
        error: `Skipped because dependency "${failedId}" failed`,
        durationMs: 0, startedAt: Date.now(),
      });
      // Cascade
      cancelDependents(step.id, steps, pending, results, failed);
    }
  }
}
