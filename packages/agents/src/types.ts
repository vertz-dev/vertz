import type { Schema, SchemaAny } from '@vertz/schema';

// ---------------------------------------------------------------------------
// Type inference helpers
// ---------------------------------------------------------------------------

/** Infer the output type from a Schema instance. */
export type InferSchema<T extends SchemaAny> = T['_output'];

/** Infer the output type of an agent. Resolves to the output schema type if defined, otherwise `{ response: string }`. */
/* eslint-disable @typescript-eslint/no-explicit-any -- any needed for conditional type matching */
export type InferAgentOutput<T extends AgentDefinition<any, any, any>> =
  T extends AgentDefinition<any, any, infer TOutput>
    ? TOutput extends SchemaAny
      ? InferSchema<TOutput>
      : { response: string }
    : { response: string };
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Tool types
// ---------------------------------------------------------------------------

/** Configuration for a tool that requires human approval before execution. */
export interface ToolApprovalConfig<TInput> {
  readonly required: true;
  readonly message: string | ((input: TInput) => string);
  readonly timeout?: string;
}

/** Where the tool executes. */
export type ToolExecution = 'server' | 'client';

/** Configuration passed to the `tool()` factory. */
export interface ToolConfig<
  TInput,
  TOutput,
  TInputSchema extends Schema<TInput, unknown> = Schema<TInput, unknown>,
  TOutputSchema extends Schema<TOutput, unknown> = Schema<TOutput, unknown>,
> {
  readonly description: string;
  readonly input: TInputSchema;
  readonly output: TOutputSchema;
  readonly handler?: (input: TInput, ctx: ToolContext) => TOutput | Promise<TOutput>;
  readonly approval?: ToolApprovalConfig<TInput>;
  readonly execution?: ToolExecution;
  /** When true, this tool can execute concurrently with other parallel tools. Default: false. */
  readonly parallel?: boolean;
}

/** Options for invoking another agent. */
export interface InvokeOptions {
  readonly message: string;
  readonly instanceId?: string;
}

/** Agent invocation capability on tool context. */
export interface AgentInvoker {
  /* eslint-disable @typescript-eslint/no-explicit-any -- agent definitions have varying types */
  invoke(
    agentDef: AgentDefinition<any, any, any>,
    options: InvokeOptions,
  ): Promise<{ response: string }>;
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

/** Runtime context available to tool handlers. */
export interface ToolContext {
  readonly agentId: string;
  readonly agentName: string;
  /** Invoke another agent from within a tool handler. */
  readonly agents: AgentInvoker;
}

/** The frozen definition returned by `tool()`. */
export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  readonly kind: 'tool';
  readonly description: string;
  readonly input: SchemaAny;
  readonly output: SchemaAny;
  readonly handler?: (input: TInput, ctx: ToolContext) => TOutput | Promise<TOutput>;
  readonly approval?: ToolApprovalConfig<TInput>;
  readonly execution: ToolExecution;
  /** When true, this tool can execute concurrently with other parallel tools. */
  readonly parallel?: boolean;
}

// ---------------------------------------------------------------------------
// Agent types
// ---------------------------------------------------------------------------

/** LLM provider identifier. */
export type ModelProvider = 'cloudflare' | 'anthropic' | 'minimax' | 'openai';

/** LLM model selection for an agent. Provider credentials are environment-level, not code. */
export interface AgentModelConfig {
  readonly provider: ModelProvider;
  readonly model: string;
}

/** Agent prompt and behavior configuration. */
export interface AgentPromptConfig {
  readonly system?: string;
  readonly maxTokens?: number;
}

/** What happens when the agent gets stuck (no progress for N iterations). */
export type OnStuckBehavior = 'escalate' | 'stop' | 'retry';

/** ReAct loop configuration. */
export interface AgentLoopConfig {
  readonly maxIterations: number;
  readonly onStuck?: OnStuckBehavior;
  readonly stuckThreshold?: number;
  readonly checkpointInterval?: number;
  readonly tokenBudget?: import('./loop/react-loop').TokenBudgetConfig;
  readonly diminishingReturns?: import('./loop/react-loop').DiminishingReturnsConfig;
  readonly maxToolConcurrency?: number;
  readonly contextCompression?: import('./loop/react-loop').ContextCompressionConfig;
}

/** Configuration passed to the `agent()` factory. */
/* eslint-disable @typescript-eslint/no-explicit-any -- TInput/TOutput must remain any for variance */
export interface AgentConfig<
  TState,
  TStateSchema extends SchemaAny = SchemaAny,
  TTools extends Record<string, ToolDefinition<any, any>> = Record<
    string,
    ToolDefinition<any, any>
  >,
  TOutputSchema extends SchemaAny | undefined = undefined,
> {
  /* eslint-enable @typescript-eslint/no-explicit-any */ readonly description?: string;
  readonly state: TStateSchema;
  readonly initialState: NoInfer<TState>;
  readonly output?: TOutputSchema;
  readonly tools: TTools;
  readonly model: AgentModelConfig;
  readonly prompt?: AgentPromptConfig;
  readonly loop?: AgentLoopConfig;
  readonly access?: Partial<Record<'invoke' | 'approve', unknown>>;
  readonly inject?: Record<string, unknown>;
  readonly onStart?: (ctx: AgentContext<TState>) => void | Promise<void>;
  readonly onComplete?: (ctx: AgentContext<TState>) => void | Promise<void>;
  readonly onStuck?: (ctx: AgentContext<TState>) => void | Promise<void>;
}

/** Runtime context available to agent lifecycle hooks. */
export interface AgentContext<TState = unknown> {
  readonly agent: { readonly id: string; readonly name: string };
  state: TState;
  readonly userId: string | null;
  readonly tenantId: string | null;
  authenticated(): boolean;
}

/** The frozen definition returned by `agent()`. */
/* eslint-disable @typescript-eslint/no-explicit-any -- any for variance compat (same pattern as EntityDefinition) */
export interface AgentDefinition<
  TState = unknown,
  TTools extends Record<string, ToolDefinition<any, any>> = Record<
    string,
    ToolDefinition<any, any>
  >,
  TOutputSchema extends SchemaAny | undefined = undefined,
> {
  /* eslint-enable @typescript-eslint/no-explicit-any */ readonly kind: 'agent';
  readonly name: string;
  readonly description?: string;
  readonly state: SchemaAny;
  readonly initialState: TState;
  readonly output?: TOutputSchema;
  readonly tools: TTools;
  readonly model: AgentModelConfig;
  readonly prompt: AgentPromptConfig;
  readonly loop: AgentLoopConfig;
  readonly access: Partial<Record<string, unknown>>;
  readonly inject: Record<string, unknown>;
  readonly onStart?: (ctx: AgentContext<TState>) => void | Promise<void>;
  readonly onComplete?: (ctx: AgentContext<TState>) => void | Promise<void>;
  readonly onStuck?: (ctx: AgentContext<TState>) => void | Promise<void>;
}
