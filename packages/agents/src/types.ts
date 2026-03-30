import type { Schema, SchemaAny } from '@vertz/schema';

// ---------------------------------------------------------------------------
// Type inference helpers
// ---------------------------------------------------------------------------

/** Infer the output type from a Schema instance. */
export type InferSchema<T extends SchemaAny> = T['_output'];

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
}

/** Runtime context available to tool handlers. */
export interface ToolContext {
  readonly agentId: string;
  readonly agentName: string;
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
}

// ---------------------------------------------------------------------------
// Agent types
// ---------------------------------------------------------------------------

/** LLM provider identifier. */
export type ModelProvider = 'cloudflare' | 'anthropic' | 'minimax' | 'openai';

/** LLM model configuration for an agent. */
export interface AgentModelConfig {
  readonly provider: ModelProvider;
  readonly model: string;
  readonly systemPrompt?: string;
  readonly maxTokens?: number;
}

/** What happens when the agent gets stuck (no progress for N iterations). */
export type OnStuckBehavior = 'escalate' | 'stop' | 'retry';

/** ReAct loop configuration. */
export interface AgentLoopConfig {
  readonly maxIterations: number;
  readonly onStuck?: OnStuckBehavior;
  readonly stuckThreshold?: number;
  readonly checkpointEvery?: number;
}

/** Configuration passed to the `agent()` factory. */
export interface AgentConfig<
  TState,
  TStateSchema extends SchemaAny = SchemaAny,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TInput/TOutput must remain any for variance
  TTools extends Record<string, ToolDefinition<any, any>> = Record<
    string,
    ToolDefinition<any, any>
  >,
> {
  readonly state: TStateSchema;
  readonly initialState: NoInfer<TState>;
  readonly tools: TTools;
  readonly model: AgentModelConfig;
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any for variance compat (same pattern as EntityDefinition)
export interface AgentDefinition<
  TState = unknown,
  TTools extends Record<string, ToolDefinition<any, any>> = Record<
    string,
    ToolDefinition<any, any>
  >,
> {
  readonly kind: 'agent';
  readonly name: string;
  readonly state: SchemaAny;
  readonly initialState: TState;
  readonly tools: TTools;
  readonly model: AgentModelConfig;
  readonly loop: AgentLoopConfig;
  readonly access: Partial<Record<string, unknown>>;
  readonly inject: Record<string, unknown>;
  readonly onStart?: (ctx: AgentContext<TState>) => void | Promise<void>;
  readonly onComplete?: (ctx: AgentContext<TState>) => void | Promise<void>;
  readonly onStuck?: (ctx: AgentContext<TState>) => void | Promise<void>;
}
