import type { SchemaAny } from '@vertz/schema';
import type { LLMAdapter, LoopStatus } from './loop/react-loop';
import type { AdapterFactory } from './providers/types';
import { run } from './run';
import type { AgentDefinition, InferSchema, ToolProvider } from './types';
import { deepFreeze } from './utils';

const NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

// ---------------------------------------------------------------------------
// Utility types
// ---------------------------------------------------------------------------

/** Flatten intersection types into a single object for readable hover previews. */
type Prettify<T> = { [K in keyof T]: T[K] } & {};

// ---------------------------------------------------------------------------
// Step types
// ---------------------------------------------------------------------------

/**
 * Context available to a step's input callback.
 *
 * `TPrev` accumulates step output types through the builder chain.
 * Each step sees only the outputs of steps defined before it.
 */
export interface StepContext<TWorkflowInput = unknown, TPrev = Record<string, unknown>> {
  /** Workflow-level input. */
  readonly workflow: { readonly input: TWorkflowInput };
  /** Accumulated outputs from all preceding steps, keyed by step name. */
  readonly prev: Readonly<TPrev>;
}

/** Approval gate configuration for a step. */
export interface StepApprovalConfig<TInput = unknown, TPrev = Record<string, unknown>> {
  /** Message shown to the human approver. */
  readonly message: string | ((ctx: StepContext<TInput, TPrev>) => string);
  /** How long to wait for approval. */
  readonly timeout?: string;
}

/** The frozen definition of a single step (internal to builder). */
export interface StepDefinition<
  TName extends string = string,
  TOutputSchema extends SchemaAny = SchemaAny,
> {
  readonly kind: 'step';
  readonly name: TName;
  /* eslint-disable @typescript-eslint/no-explicit-any -- agent definitions have varying types */
  readonly agent?: AgentDefinition<any, any, any>;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  /** Generics are erased here — type safety is enforced at builder call site. */
  readonly input?: (ctx: StepContext) => string | { message: string };
  readonly output?: TOutputSchema;
  readonly approval?: StepApprovalConfig;
}

// ---------------------------------------------------------------------------
// Workflow types
// ---------------------------------------------------------------------------

/** The frozen definition returned by `WorkflowBuilder.build()`. */
export interface WorkflowDefinition<TInputSchema extends SchemaAny = SchemaAny> {
  readonly kind: 'workflow';
  readonly name: string;
  readonly input: TInputSchema;
  readonly steps: readonly StepDefinition[];
  readonly access: Partial<Record<'start' | 'approve', unknown>>;
}

// ---------------------------------------------------------------------------
// WorkflowBuilder
// ---------------------------------------------------------------------------

/**
 * Fluent builder for defining multi-step workflows with typed `ctx.prev`.
 *
 * Each `.step()` call returns a new builder with an updated `TPrev` generic
 * that includes the current step's output type. Subsequent steps see all
 * preceding step outputs in their `ctx.prev`.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- empty initial prev is intentional
export interface WorkflowBuilder<TInput, TPrev = {}> {
  /**
   * Add an approval-only step. Approval steps are gates that suspend the
   * workflow — they do not produce output and do not appear in `ctx.prev`.
   */
  step<TName extends string>(
    name: TName,
    config: {
      readonly approval: StepApprovalConfig<TInput, TPrev>;
      readonly agent?: never;
      readonly output?: never;
      readonly input?: never;
    },
  ): WorkflowBuilder<TInput, TPrev>;

  /**
   * Add an agent step to the workflow.
   *
   * - Steps with an `output` schema: `prev[name]` is `InferSchema<TOutputSchema>`
   * - Steps without an `output` schema: `prev[name]` is `{ response: string }`
   */
  step<TName extends string, TOutputSchema extends SchemaAny | undefined = undefined>(
    name: TName,
    config: {
      /* eslint-disable @typescript-eslint/no-explicit-any -- agent definitions have varying state/tool types */
      readonly agent?: AgentDefinition<any, any, any>;
      /* eslint-enable @typescript-eslint/no-explicit-any */
      readonly input?: (ctx: StepContext<TInput, TPrev>) => string | { message: string };
      readonly output?: TOutputSchema;
    },
  ): WorkflowBuilder<
    TInput,
    Prettify<
      TPrev &
        Record<
          TName,
          TOutputSchema extends SchemaAny ? InferSchema<TOutputSchema> : { response: string }
        >
    >
  >;

  /** Finalize the workflow definition. Validates at least one step exists. */
  build(): WorkflowDefinition;
}

// ---------------------------------------------------------------------------
// Internal builder implementation
// ---------------------------------------------------------------------------

class WorkflowBuilderImpl<TInput, TPrev = {}> implements WorkflowBuilder<TInput, TPrev> {
  private readonly _name: string;
  private readonly _inputSchema: SchemaAny;
  private readonly _access: Partial<Record<'start' | 'approve', unknown>>;
  private readonly _steps: StepDefinition[];
  private readonly _stepNames: Set<string>;

  constructor(
    name: string,
    inputSchema: SchemaAny,
    access: Partial<Record<'start' | 'approve', unknown>>,
    steps: StepDefinition[] = [],
    stepNames: Set<string> = new Set(),
  ) {
    this._name = name;
    this._inputSchema = inputSchema;
    this._access = access;
    this._steps = steps;
    this._stepNames = stepNames;
  }

  step<TName extends string, TOutputSchema extends SchemaAny | undefined = undefined>(
    name: TName,
    config: {
      /* eslint-disable @typescript-eslint/no-explicit-any -- agent definitions have varying state/tool types */
      readonly agent?: AgentDefinition<any, any, any>;
      /* eslint-enable @typescript-eslint/no-explicit-any */
      readonly input?: (ctx: StepContext<TInput, TPrev>) => string | { message: string };
      readonly output?: TOutputSchema;
      readonly approval?: StepApprovalConfig<TInput, TPrev>;
    },
  ): WorkflowBuilder<
    TInput,
    Prettify<
      TPrev &
        Record<
          TName,
          TOutputSchema extends SchemaAny ? InferSchema<TOutputSchema> : { response: string }
        >
    >
  > {
    if (!name || !NAME_PATTERN.test(name)) {
      throw new Error(
        `step() name must be a non-empty lowercase string matching /^[a-z][a-z0-9-]*$/. Got: "${name}"`,
      );
    }

    if (this._stepNames.has(name)) {
      throw new Error(`Duplicate step name "${name}" in workflow "${this._name}".`);
    }

    const stepDef: StepDefinition = {
      kind: 'step',
      name,
      agent: config.agent,
      input: config.input as StepDefinition['input'],
      output: config.output,
      approval: config.approval as StepDefinition['approval'],
    };

    const newSteps = [...this._steps, stepDef];
    const newNames = new Set(this._stepNames);
    newNames.add(name);

    // Safe: type safety is enforced by the interface overloads on WorkflowBuilder.
    // The runtime class doesn't track generics — they exist only at compile time.
    /* eslint-disable @typescript-eslint/no-explicit-any -- generic erasure at runtime */
    return new WorkflowBuilderImpl(
      this._name,
      this._inputSchema,
      this._access,
      newSteps,
      newNames,
    ) as any;
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }

  build(): WorkflowDefinition {
    if (this._steps.length === 0) {
      throw new Error('workflow() must have at least one step.');
    }

    const def: WorkflowDefinition = {
      kind: 'workflow',
      name: this._name,
      input: this._inputSchema,
      steps: this._steps,
      access: this._access,
    };

    return deepFreeze(def);
  }
}

// ---------------------------------------------------------------------------
// workflow() factory
// ---------------------------------------------------------------------------

/**
 * Define a multi-step workflow that coordinates agents and approval gates.
 *
 * Returns a `WorkflowBuilder` — call `.step()` to add steps, then `.build()`
 * to finalize. Each step's `ctx.prev` is strongly typed based on preceding
 * steps' output schemas.
 *
 * ```typescript
 * const pipeline = workflow('my-pipeline', { input: s.object({ name: s.string() }) })
 *   .step('greet', { agent: greeterAgent, output: s.object({ greeting: s.string() }) })
 *   .step('summarize', {
 *     agent: summarizerAgent,
 *     input: (ctx) => ctx.prev.greet.greeting, // typed!
 *   })
 *   .build();
 * ```
 */
export function workflow<TInputSchema extends SchemaAny>(
  name: string,
  config: { input: TInputSchema; access?: Partial<Record<'start' | 'approve', unknown>> },
): WorkflowBuilder<InferSchema<TInputSchema>> {
  if (!name || !NAME_PATTERN.test(name)) {
    throw new Error(
      `workflow() name must be a non-empty lowercase string matching /^[a-z][a-z0-9-]*$/. Got: "${name}"`,
    );
  }

  return new WorkflowBuilderImpl(name, config.input, config.access ?? {});
}

// ---------------------------------------------------------------------------
// Workflow execution
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Step progress events
// ---------------------------------------------------------------------------

/** Event emitted during workflow execution to track step progress. */
export interface StepProgressEvent {
  readonly step: string;
  readonly type: 'step-started' | 'step-completed' | 'step-failed';
  readonly timestamp: number;
  readonly iterations?: number;
  readonly response?: string;
}

/** Status of a workflow execution. */
export type WorkflowStatus = 'complete' | 'error' | 'pending';

/** Result of a single step execution. */
export interface StepResult {
  readonly status: LoopStatus;
  readonly response: string;
  readonly iterations: number;
}

/** Options for running a workflow. */
export interface RunWorkflowOptions<TInput = unknown> {
  /** Validated input matching the workflow's input schema. */
  readonly input: TInput;
  /** The LLM adapter to use for all agent steps. When `createAdapter` is provided, this is used as a fallback. */
  readonly llm: LLMAdapter;
  /**
   * Optional adapter factory that creates per-agent adapters with the agent's tools.
   * When provided, each agent step gets an adapter created with its specific tools,
   * so the LLM knows which tools are available for function calling.
   */
  readonly createAdapter?: AdapterFactory;
  /**
   * Tool handler implementations to inject at runtime.
   * Passed to each agent's `run()` call. Provider handlers override
   * handlers defined on the tool itself.
   */
  readonly tools?: ToolProvider;
  /** Resume execution after a specific step (e.g., after approval). Steps up to and including this step are skipped. */
  readonly resumeAfter?: string;
  /** Previous step results to restore when resuming. */
  readonly previousResults?: Record<string, StepResult>;
  /** Optional callback for step progress events. Fire-and-forget (synchronous). */
  readonly onStepProgress?: (event: StepProgressEvent) => void;
}

/**
 * Why a workflow errored — distinguishes agent failures from output validation issues.
 *
 * Note: workflow-level input validation failures throw an Error rather than
 * returning a WorkflowResult. Only step-level failures produce error results.
 */
export type WorkflowErrorReason = 'agent-failed' | 'invalid-json' | 'schema-mismatch';

/** Result of a workflow execution. */
export interface WorkflowResult {
  readonly status: WorkflowStatus;
  /** Per-step results keyed by step name. */
  readonly stepResults: Record<string, StepResult>;
  /** Step name where the workflow stopped (only set on error). */
  readonly failedStep?: string;
  /** Why the workflow errored (only set on error). */
  readonly errorReason?: WorkflowErrorReason;
  /** Step name where the workflow is waiting for approval (only set on pending). */
  readonly pendingStep?: string;
  /** Approval message for the pending step. */
  readonly approvalMessage?: string;
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
  const {
    input,
    llm,
    createAdapter,
    tools: toolProvider,
    resumeAfter,
    previousResults,
    onStepProgress,
  } = options;

  // Validate input against workflow schema
  const parseResult = workflowDef.input.parse(input);
  if (!parseResult.ok) {
    throw new Error(
      `Workflow "${workflowDef.name}" input validation failed: ${JSON.stringify(parseResult.error)}`,
    );
  }

  const stepResults: Record<string, StepResult> = {};
  const prev: Record<string, unknown> = {};

  // When resuming, restore previous results and skip steps
  if (previousResults) {
    for (const [name, result] of Object.entries(previousResults)) {
      stepResults[name] = result;
      prev[name] = { response: result.response, status: result.status };
    }
  }

  // Validate resumeAfter step exists
  let skipping = !!resumeAfter;
  if (resumeAfter) {
    const stepExists = workflowDef.steps.some((s) => s.name === resumeAfter);
    if (!stepExists) {
      throw new Error(`Step "${resumeAfter}" not found in workflow "${workflowDef.name}".`);
    }
  }

  for (const stepDef of workflowDef.steps) {
    // Skip steps until we pass the resumeAfter step
    if (skipping) {
      if (stepDef.name === resumeAfter) {
        skipping = false;
      }
      continue;
    }
    // Build step context (shared by both agent and approval steps)
    const ctx: StepContext = {
      workflow: { input },
      prev: { ...prev },
    };

    // Approval gate — suspend workflow
    if (stepDef.approval) {
      const approvalMsg =
        typeof stepDef.approval.message === 'function'
          ? stepDef.approval.message(ctx)
          : stepDef.approval.message;

      return {
        status: 'pending',
        stepResults,
        pendingStep: stepDef.name,
        approvalMessage: approvalMsg,
      };
    }

    // Agent step — requires an agent
    if (!stepDef.agent) {
      throw new Error(`Step "${stepDef.name}" has no agent assigned.`);
    }

    // Emit step-started event
    onStepProgress?.({ step: stepDef.name, type: 'step-started', timestamp: Date.now() });

    // Resolve the message for this step
    let message: string;
    if (stepDef.input) {
      const result = stepDef.input(ctx);
      message = typeof result === 'string' ? result : result.message;
    } else {
      message = `Execute step "${stepDef.name}"`;
    }

    // Run the agent — use per-agent adapter when factory is provided
    const stepLlm = createAdapter
      ? createAdapter({ config: stepDef.agent.model, tools: stepDef.agent.tools })
      : llm;
    const agentResult = await run(stepDef.agent, { message, llm: stepLlm, tools: toolProvider });

    const stepResult: StepResult = {
      status: agentResult.status,
      response: agentResult.response,
      iterations: agentResult.iterations,
    };

    stepResults[stepDef.name] = stepResult;

    // If step did not complete successfully, stop the workflow.
    // Exception: 'max-iterations' with a non-empty response is treated as soft-complete —
    // the agent ran out of iterations but likely produced useful output (e.g., wrote files).
    const softComplete = agentResult.status === 'max-iterations' && agentResult.response.length > 0;
    if (agentResult.status !== 'complete' && !softComplete) {
      onStepProgress?.({
        step: stepDef.name,
        type: 'step-failed',
        timestamp: Date.now(),
        iterations: agentResult.iterations,
        response: agentResult.response,
      });
      return {
        status: 'error',
        stepResults,
        failedStep: stepDef.name,
        errorReason: 'agent-failed',
      };
    }

    // Validate step output against schema (if output schema defined)
    let stepOutput: unknown = { response: agentResult.response };
    if (stepDef.output) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(agentResult.response);
      } catch {
        onStepProgress?.({
          step: stepDef.name,
          type: 'step-failed',
          timestamp: Date.now(),
          iterations: agentResult.iterations,
          response: agentResult.response,
        });
        return {
          status: 'error',
          stepResults,
          failedStep: stepDef.name,
          errorReason: 'invalid-json',
        };
      }

      try {
        const validated = stepDef.output.parse(parsed);
        if (!validated.ok) {
          onStepProgress?.({
            step: stepDef.name,
            type: 'step-failed',
            timestamp: Date.now(),
            iterations: agentResult.iterations,
            response: agentResult.response,
          });
          return {
            status: 'error',
            stepResults,
            failedStep: stepDef.name,
            errorReason: 'schema-mismatch',
          };
        }
        stepOutput = validated.data;
      } catch {
        onStepProgress?.({
          step: stepDef.name,
          type: 'step-failed',
          timestamp: Date.now(),
          iterations: agentResult.iterations,
          response: agentResult.response,
        });
        return {
          status: 'error',
          stepResults,
          failedStep: stepDef.name,
          errorReason: 'schema-mismatch',
        };
      }
    }

    // Emit step-completed event (after validation passes)
    onStepProgress?.({
      step: stepDef.name,
      type: 'step-completed',
      timestamp: Date.now(),
      iterations: agentResult.iterations,
      response: agentResult.response,
    });

    // Store step output for subsequent steps
    prev[stepDef.name] = stepOutput;
  }

  return {
    status: 'complete',
    stepResults,
  };
}
