// @vertz/agents — Public API

// Types
export type {
  AgentConfig,
  AgentContext,
  AgentDefinition,
  AgentInvoker,
  AgentLoopConfig,
  AgentModelConfig,
  AgentPromptConfig,
  InferAgentOutput,
  InferSchema,
  InvokeOptions,
  ModelProvider,
  OnStuckBehavior,
  ToolApprovalConfig,
  ToolConfig,
  ToolContext,
  ToolDefinition,
  ToolExecution,
} from './types';

// Factories
export { agent } from './agent';
export { tool } from './tool';

// ReAct loop
export type {
  ContextCompressionConfig,
  DiminishingReturnsConfig,
  LLMAdapter,
  LLMResponse,
  LoopResult,
  LoopStatus,
  Message,
  ReactLoopOptions,
  TokenBudgetConfig,
  TokenUsage,
  TokenUsageSummary,
  ToolCall,
  ToolCallSummaryEntry,
} from './loop/react-loop';
export { reactLoop } from './loop/react-loop';

// Agent runner
export type {
  RunOptions,
  RunOptionsStateless,
  RunOptionsWithStore,
  StatelessLoopResult,
  SessionLoopResult,
} from './run';
export { run } from './run';

// Stores
export type { AgentSession, AgentStore, ListSessionsFilter } from './stores/types';
export { memoryStore } from './stores/memory-store';
export { sqliteStore } from './stores/sqlite-store';
export type { SqliteStoreOptions } from './stores/sqlite-store';
export { SessionNotFoundError, SessionAccessDeniedError } from './stores/errors';

// Workflow
export type {
  RunWorkflowOptions,
  StepApprovalConfig,
  StepConfig,
  StepContext,
  StepDefinition,
  StepResult,
  WorkflowConfig,
  WorkflowDefinition,
  WorkflowResult,
  WorkflowStatus,
} from './workflow';
export { runWorkflow, step, workflow } from './workflow';

// Provider utilities
export type { AdapterFactory, CreateAdapterOptions, ToolDescription } from './providers/types';
export { toolsToDescriptions } from './providers/tool-description';

// LLM adapters
export { createAdapter } from './providers/create-adapter';
export { createCloudflareAdapter } from './providers/cloudflare';
export { createMinimaxAdapter } from './providers/minimax';

// Agent runner (for @vertz/server integration)
export type { CreateAgentRunnerOptions } from './create-agent-runner';
export { createAgentRunner } from './create-agent-runner';
