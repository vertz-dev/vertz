// @vertz/agents — Public API

// Types
export type {
  AgentConfig,
  AgentContext,
  AgentDefinition,
  AgentLoopConfig,
  AgentModelConfig,
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
  LLMAdapter,
  LLMResponse,
  LoopResult,
  LoopStatus,
  Message,
  ReactLoopOptions,
  ToolCall,
} from './loop/react-loop';
export { reactLoop } from './loop/react-loop';

// Agent runner
export type { RunOptions } from './run';
export { run } from './run';

// Provider utilities
export type { AdapterFactory, CreateAdapterOptions, ToolDescription } from './providers/types';
export { toolsToDescriptions } from './providers/tool-description';
