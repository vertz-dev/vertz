import type { SchemaAny } from '@vertz/schema';
import type { LLMAdapter } from './loop/react-loop';
import { run } from './run';
import type { AgentDefinition, InferSchema } from './types';
import { deepFreeze } from './utils';

const NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

// ---------------------------------------------------------------------------
// Step types
// ---------------------------------------------------------------------------

/** Context available to a step's input callback. */
export interface StepContext<TWorkflowInput = unknown> {
  /** Workflow-level input. */
  readonly workflow: { readonly input: TWorkflowInput };
  /** Accumulated outputs from all preceding steps, keyed by step name. */
  readonly prev: Record<string, unknown>;
}

/** Configuration passed to the `step()` factory. */
export interface StepConfig<TOutputSchema extends SchemaAny = SchemaAny> {
  /** The agent to execute for this step. */
  /* eslint-disable @typescript-eslint/no-explicit-any -- agent definitions have varying state/tool types */
  readonly agent?: AgentDefinition<any, any, any>;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  /** Transform workflow context into the message sent to the agent. */
  readonly input?: (ctx: StepContext) => string | { message: string };
  /** Schema for validating step output. */
  readonly output: TOutputSchema;
}

/** The frozen definition returned by `step()`. */
export interface StepDefinition<
  TName extends string = string,
  TOutputSchema extends SchemaAny = SchemaAny,
> {
  readonly kind: 'step';
  readonly name: TName;
  /* eslint-disable @typescript-eslint/no-explicit-any -- agent definitions have varying types */
  readonly agent?: AgentDefinition<any, any, any>;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  readonly input?: (ctx: StepContext) => string | { message: string };
  readonly output: TOutputSchema;
}

// ---------------------------------------------------------------------------
// step() factory
// ---------------------------------------------------------------------------

/**
 * Define a workflow step.
 *
 * Steps are the unit of workflow execution. Each step optionally invokes an
 * agent and produces a typed output that subsequent steps can reference via
 * `ctx.prev`.
 */
export function step<TName extends string, TOutputSchema extends SchemaAny>(
  name: TName,
  config: StepConfig<TOutputSchema>,
): StepDefinition<TName, TOutputSchema> {
  if (!name || !NAME_PATTERN.test(name)) {
    throw new Error(
      `step() name must be a non-empty lowercase string matching /^[a-z][a-z0-9-]*$/. Got: "${name}"`,
    );
  }

  const def: StepDefinition<TName, TOutputSchema> = {
    kind: 'step',
    name,
    agent: config.agent,
    input: config.input,
    output: config.output,
  };

  return deepFreeze(def);
}

// ---------------------------------------------------------------------------
// Workflow types
// ---------------------------------------------------------------------------

/** Configuration passed to the `workflow()` factory. */
export interface WorkflowConfig<TInputSchema extends SchemaAny = SchemaAny> {
  /** Schema for the workflow input. */
  readonly input: TInputSchema;
  /** Ordered list of steps to execute sequentially. */
  readonly steps: readonly StepDefinition[];
  /** Access control — who can start or approve the workflow. */
  readonly access?: Partial<Record<'start' | 'approve', unknown>>;
}

/** The frozen definition returned by `workflow()`. */
export interface WorkflowDefinition<TInputSchema extends SchemaAny = SchemaAny> {
  readonly kind: 'workflow';
  readonly name: string;
  readonly input: TInputSchema;
  readonly steps: readonly StepDefinition[];
  readonly access: Partial<Record<'start' | 'approve', unknown>>;
}

// ---------------------------------------------------------------------------
// workflow() factory
// ---------------------------------------------------------------------------

/**
 * Define a multi-step workflow that coordinates agents and approval gates.
 *
 * v1 supports linear sequential steps only. Each step executes in order,
 * with outputs accumulated in `ctx.prev` for subsequent steps.
 */
export function workflow<TInputSchema extends SchemaAny>(
  name: string,
  config: WorkflowConfig<TInputSchema>,
): WorkflowDefinition<TInputSchema> {
  if (!name || !NAME_PATTERN.test(name)) {
    throw new Error(
      `workflow() name must be a non-empty lowercase string matching /^[a-z][a-z0-9-]*$/. Got: "${name}"`,
    );
  }

  if (config.steps.length === 0) {
    throw new Error('workflow() must have at least one step.');
  }

  // Check for duplicate step names
  const names = new Set<string>();
  for (const s of config.steps) {
    if (names.has(s.name)) {
      throw new Error(`Duplicate step name "${s.name}" in workflow "${name}".`);
    }
    names.add(s.name);
  }

  const def: WorkflowDefinition<TInputSchema> = {
    kind: 'workflow',
    name,
    input: config.input,
    steps: config.steps,
    access: config.access ?? {},
  };

  return deepFreeze(def);
}

// ---------------------------------------------------------------------------
// Workflow execution
// ---------------------------------------------------------------------------

/** Status of a completed workflow. */
export type WorkflowStatus = 'complete' | 'error';

/** Result of a single step execution. */
export interface StepResult {
  readonly status: 'complete' | 'max-iterations' | 'stuck' | 'error';
  readonly response: string;
  readonly iterations: number;
}

/** Options for running a workflow. */
export interface RunWorkflowOptions<TInput = unknown> {
  /** Validated input matching the workflow's input schema. */
  readonly input: TInput;
  /** The LLM adapter to use for all agent steps. */
  readonly llm: LLMAdapter;
}

/** Result of a workflow execution. */
export interface WorkflowResult {
  readonly status: WorkflowStatus;
  /** Per-step results keyed by step name. */
  readonly stepResults: Record<string, StepResult>;
  /** Step name where the workflow stopped (only set on error). */
  readonly failedStep?: string;
}

/**
 * Execute a workflow by running each step sequentially.
 *
 * Each step invokes its agent via `run()`, passes the result to the next
 * step via `ctx.prev`, and validates step outputs against their schemas.
 */
export async function runWorkflow<TInputSchema extends SchemaAny>(
  workflowDef: WorkflowDefinition<TInputSchema>,
  options: RunWorkflowOptions<InferSchema<TInputSchema>>,
): Promise<WorkflowResult> {
  const { input, llm } = options;

  // Validate input against workflow schema
  const parseResult = workflowDef.input.parse(input);
  if (!parseResult.ok) {
    throw new Error(
      `Workflow "${workflowDef.name}" input validation failed: ${JSON.stringify(parseResult.error)}`,
    );
  }

  const stepResults: Record<string, StepResult> = {};
  const prev: Record<string, unknown> = {};

  for (const stepDef of workflowDef.steps) {
    if (!stepDef.agent) {
      throw new Error(`Step "${stepDef.name}" has no agent assigned.`);
    }

    // Build step context
    const ctx: StepContext = {
      workflow: { input },
      prev: { ...prev },
    };

    // Resolve the message for this step
    let message: string;
    if (stepDef.input) {
      const result = stepDef.input(ctx);
      message = typeof result === 'string' ? result : result.message;
    } else {
      message = `Execute step "${stepDef.name}"`;
    }

    // Run the agent
    const agentResult = await run(stepDef.agent, { message, llm });

    const stepResult: StepResult = {
      status: agentResult.status,
      response: agentResult.response,
      iterations: agentResult.iterations,
    };

    stepResults[stepDef.name] = stepResult;

    // If step failed, stop the workflow
    if (agentResult.status === 'error') {
      return {
        status: 'error',
        stepResults,
        failedStep: stepDef.name,
      };
    }

    // Store step output for subsequent steps
    prev[stepDef.name] = {
      response: agentResult.response,
      status: agentResult.status,
    };
  }

  return {
    status: 'complete',
    stepResults,
  };
}
