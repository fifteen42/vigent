// ── Workflow definition types ──────────────────────────────────────────────────

export type StepAction =
  | { type: 'run'; task: string }           // vigent run
  | { type: 'video'; path: string; question?: string }
  | { type: 'transcribe'; path: string; language?: string }
  | { type: 'generate_video'; prompt: string; outputPath?: string }
  | { type: 'generate_image'; prompt: string; outputPath?: string }
  | { type: 'tts'; text: string; outputPath?: string; voiceId?: string }
  | { type: 'screenshot'; outputPath?: string }
  | { type: 'shell'; command: string }       // raw shell command
  | { type: 'workflow'; path: string };      // inline sub-workflow

export interface WorkflowStep {
  id: string;
  name?: string;
  action: StepAction;
  /** Step IDs that must complete before this step runs */
  dependsOn?: string[];
  /** Skip this step if condition evaluates falsy */
  condition?: string;
  /** Retry policy */
  retry?: { maxAttempts: number; delayMs?: number };
  /** Write step output to this env var for use in later steps */
  outputVar?: string;
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Continue workflow even if this step fails */
  continueOnError?: boolean;
}

export interface WorkflowTrigger {
  /** Cron expression, e.g. "0 9 * * *" */
  cron?: string;
  /** Manual only — no automatic trigger */
  manual?: boolean;
}

export interface WorkflowDefinition {
  name: string;
  description?: string;
  version?: string;
  triggers?: WorkflowTrigger;
  /** Key-value pairs injected into step env */
  env?: Record<string, string>;
  steps: WorkflowStep[];
}

// ── Execution types ────────────────────────────────────────────────────────────

export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface StepResult {
  stepId: string;
  status: StepStatus;
  output?: string;
  error?: string;
  durationMs: number;
  startedAt: number;
}

export interface WorkflowResult {
  name: string;
  status: 'completed' | 'failed';
  steps: StepResult[];
  durationMs: number;
  startedAt: number;
}
