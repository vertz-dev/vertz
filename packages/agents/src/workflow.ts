import type { SchemaAny } from '@vertz/schema';
import type { AgentDefinition } from './types';
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
