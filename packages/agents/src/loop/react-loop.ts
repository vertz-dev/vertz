import type { ToolContext, ToolDefinition } from '../types';
import { validateToolInput, validateToolOutput } from './validate-tool-input';

// ---------------------------------------------------------------------------
// LLM adapter interface — provider-agnostic
// ---------------------------------------------------------------------------

/** A single message in the conversation. */
export interface Message {
  readonly role: 'system' | 'user' | 'assistant' | 'tool';
  readonly content: string;
  /** Tool call ID for tool result messages. */
  readonly toolCallId?: string;
  /** Tool name for tool result messages. */
  readonly toolName?: string;
  /** Tool calls requested by the assistant (present on assistant messages that triggered tool use). */
  readonly toolCalls?: readonly ToolCall[];
}

/** A tool call requested by the LLM. */
export interface ToolCall {
  readonly id?: string;
  readonly name: string;
  readonly arguments: Record<string, unknown>;
}

/** Token usage reported by a single LLM call. */
export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

/** The response from an LLM chat call. */
export interface LLMResponse {
  readonly text: string;
  readonly toolCalls: readonly ToolCall[];
  /** Token usage for this call, if reported by the adapter. */
  readonly usage?: TokenUsage;
}

/** Provider-agnostic interface for LLM communication. */
export interface LLMAdapter {
  chat(messages: readonly Message[]): Promise<LLMResponse>;
}

// ---------------------------------------------------------------------------
// Token budget & diminishing returns
// ---------------------------------------------------------------------------

/** Token budget configuration for the loop. */
export interface TokenBudgetConfig {
  readonly max: number;
  readonly warningThreshold?: number;
  readonly stopThreshold?: number;
  readonly warningMessage?: string | ((pct: number, used: number, max: number) => string);
}

/** Diminishing returns detection configuration. */
export interface DiminishingReturnsConfig {
  readonly consecutiveThreshold: number;
  readonly minDeltaTokens: number;
}

/** Aggregated token usage summary across the entire loop. */
export interface TokenUsageSummary {
  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;
  readonly totalTokens: number;
  readonly budgetUsedPercent: number;
}

/** Summary of tool calls made during the loop. */
export interface ToolCallSummaryEntry {
  readonly toolName: string;
  readonly callCount: number;
}

/** Context compression hook configuration. */
export interface ContextCompressionConfig {
  readonly maxMessages?: number;
  readonly maxTokenEstimate?: number;
  readonly compress: (messages: readonly Message[]) => Promise<Message[]> | Message[];
}

// ---------------------------------------------------------------------------
// Loop result
// ---------------------------------------------------------------------------

export type LoopStatus =
  | 'complete'
  | 'max-iterations'
  | 'stuck'
  | 'error'
  | 'token-budget-exhausted'
  | 'diminishing-returns';

export interface LoopResult {
  readonly status: LoopStatus;
  readonly response: string;
  readonly iterations: number;
  readonly messages: readonly Message[];
  readonly tokenUsage?: TokenUsageSummary;
  readonly compressionCount?: number;
  readonly toolCallSummary?: readonly ToolCallSummaryEntry[];
}

// ---------------------------------------------------------------------------
// Loop options
// ---------------------------------------------------------------------------

export interface ReactLoopOptions {
  readonly llm: LLMAdapter;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tools have varying input/output types
  readonly tools: Record<string, ToolDefinition<any, any>>;
  readonly systemPrompt: string;
  readonly userMessage: string;
  readonly maxIterations: number;
  readonly stuckThreshold?: number;
  readonly toolContext: ToolContext;
  readonly checkpointInterval?: number;
  readonly onCheckpoint?: (iteration: number, messages: readonly Message[]) => void;
  /** Pre-existing conversation messages (from a resumed session). Injected between system prompt and new user message. */
  readonly previousMessages?: readonly Message[];
  /** Token budget configuration. */
  readonly tokenBudget?: TokenBudgetConfig;
  /** Diminishing returns detection. */
  readonly diminishingReturns?: DiminishingReturnsConfig;
  /** Max parallel tool executions per batch (default: 5). */
  readonly maxToolConcurrency?: number;
  /** Context compression hooks. */
  readonly contextCompression?: ContextCompressionConfig;
}

// ---------------------------------------------------------------------------
// ReAct loop
// ---------------------------------------------------------------------------

/**
 * Execute a ReAct (Reasoning + Acting) loop.
 *
 * The loop cycles through: think → call tool(s) → observe → think → ...
 * until the LLM responds with text only (no tool calls), the iteration
 * limit is reached, or the agent gets stuck (no progress for N iterations).
 */
export async function reactLoop(options: ReactLoopOptions): Promise<LoopResult> {
  const {
    llm,
    tools,
    systemPrompt,
    userMessage,
    maxIterations,
    stuckThreshold,
    toolContext,
    checkpointInterval,
    onCheckpoint,
    previousMessages,
    tokenBudget,
    diminishingReturns,
    contextCompression,
  } = options;

  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    ...(previousMessages ?? []),
    { role: 'user', content: userMessage },
  ];

  let iteration = 0;
  let consecutiveNoProgress = 0;

  // Token budget tracking
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let hasUsageData = false;
  let warningSent = false;
  const stopThreshold = tokenBudget?.stopThreshold ?? 0.9;
  const warningThreshold = tokenBudget?.warningThreshold ?? 0.8;

  // Diminishing returns tracking
  let consecutiveLowDelta = 0;
  let previousTotalTokens = 0;

  // Context compression tracking
  let compressionCount = 0;

  // Tool call summary tracking
  const toolCallCounts = new Map<string, number>();

  function buildResult(status: LoopStatus, response: string): LoopResult {
    return {
      status,
      response,
      iterations: iteration,
      messages: Object.freeze([...messages]),
      tokenUsage: hasUsageData
        ? {
            totalInputTokens,
            totalOutputTokens,
            totalTokens: totalInputTokens + totalOutputTokens,
            budgetUsedPercent: tokenBudget
              ? ((totalInputTokens + totalOutputTokens) / tokenBudget.max) * 100
              : 0,
          }
        : undefined,
      compressionCount: contextCompression ? compressionCount : undefined,
      toolCallSummary:
        toolCallCounts.size > 0
          ? [...toolCallCounts.entries()].map(([toolName, callCount]) => ({
              toolName,
              callCount,
            }))
          : undefined,
    };
  }

  while (iteration < maxIterations) {
    iteration++;

    // Context compression check — before calling the LLM
    if (contextCompression) {
      const shouldCompress = shouldCompressMessages(messages, contextCompression);
      if (shouldCompress) {
        // Strip system prompt (first message)
        const systemMsg = messages[0];
        const nonSystemMessages = messages.slice(1);

        const compressed = await contextCompression.compress(nonSystemMessages);
        if (compressed.length === 0) {
          throw new Error('Context compression returned empty message array');
        }

        // Replace messages: system prompt + compressed
        messages.length = 0;
        messages.push(systemMsg);
        messages.push(...compressed);
        compressionCount++;
      }
    }

    // Call the LLM — wrap in try/catch for provider errors
    let response: LLMResponse;
    try {
      response = await llm.chat(messages);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return buildResult('error', errorMessage);
    }

    // Track token usage if the adapter reports it
    if (response.usage) {
      hasUsageData = true;
      totalInputTokens += response.usage.inputTokens;
      totalOutputTokens += response.usage.outputTokens;

      // Token budget checks
      if (tokenBudget) {
        const totalTokens = totalInputTokens + totalOutputTokens;
        const usedPct = totalTokens / tokenBudget.max;

        if (usedPct >= stopThreshold) {
          // Preserve the LLM response text in messages even though we're stopping
          if (response.text) {
            messages.push({ role: 'assistant', content: response.text });
          }
          return buildResult('token-budget-exhausted', response.text);
        }

        if (!warningSent && usedPct >= warningThreshold) {
          warningSent = true;
          const pct = Math.round(usedPct * 100);
          let warningContent: string;

          if (typeof tokenBudget.warningMessage === 'function') {
            warningContent = tokenBudget.warningMessage(pct, totalTokens, tokenBudget.max);
          } else if (typeof tokenBudget.warningMessage === 'string') {
            warningContent = tokenBudget.warningMessage;
          } else {
            warningContent =
              `Warning: You have used ${pct}% of your token budget` +
              ` (${totalTokens}/${tokenBudget.max} tokens). Please wrap up your current task.`;
          }

          messages.push({ role: 'system', content: warningContent });
        }
      }

      // Diminishing returns check
      if (diminishingReturns) {
        const currentTotal = totalInputTokens + totalOutputTokens;
        const delta = currentTotal - previousTotalTokens;
        previousTotalTokens = currentTotal;

        if (delta < diminishingReturns.minDeltaTokens) {
          consecutiveLowDelta++;
          if (consecutiveLowDelta >= diminishingReturns.consecutiveThreshold) {
            if (response.text) {
              messages.push({ role: 'assistant', content: response.text });
            }
            return buildResult('diminishing-returns', response.text);
          }
        } else {
          consecutiveLowDelta = 0;
        }
      }
    }

    // No tool calls — LLM is done
    if (response.toolCalls.length === 0) {
      messages.push({ role: 'assistant', content: response.text });
      return buildResult('complete', response.text);
    }

    // LLM requested tool calls — store them on the assistant message for protocol fidelity
    messages.push({
      role: 'assistant',
      content: response.text || `[Calling ${response.toolCalls.map((tc) => tc.name).join(', ')}]`,
      toolCalls: response.toolCalls.map((tc) => ({
        id: tc.id,
        name: tc.name,
        arguments: tc.arguments,
      })),
    });

    let hadSuccessfulToolCall = false;
    const maxConcurrency = options.maxToolConcurrency ?? 5;

    // Track tool call counts for summary
    for (const tc of response.toolCalls) {
      toolCallCounts.set(tc.name, (toolCallCounts.get(tc.name) ?? 0) + 1);
    }

    // Partition tool calls into maximal consecutive batches
    const batches = partitionToolCalls(response.toolCalls, tools);

    for (const batch of batches) {
      if (batch.concurrent && batch.calls.length > 1) {
        // Execute batch concurrently with semaphore
        const results = await runConcurrentBatch(
          batch.calls,
          tools,
          iteration,
          toolContext,
          maxConcurrency,
        );
        for (const r of results) {
          messages.push(r.message);
          if (r.success) hadSuccessfulToolCall = true;
        }
      } else {
        // Sequential execution
        for (const toolCall of batch.calls) {
          const r = await executeToolCall(toolCall, tools, iteration, toolContext);
          messages.push(r.message);
          if (r.success) hadSuccessfulToolCall = true;
        }
      }
    }

    // Track progress for stuck detection
    if (hadSuccessfulToolCall) {
      consecutiveNoProgress = 0;
    } else {
      consecutiveNoProgress++;
    }

    // Check stuck threshold
    if (stuckThreshold && consecutiveNoProgress >= stuckThreshold) {
      return buildResult('stuck', '');
    }

    // Checkpoint callback
    if (checkpointInterval && onCheckpoint && iteration % checkpointInterval === 0) {
      onCheckpoint(iteration, messages);
    }
  }

  // Exceeded max iterations — extract last meaningful assistant text
  const lastAssistantMsg = [...messages].reverse().find((m) => m.role === 'assistant');
  return buildResult('max-iterations', lastAssistantMsg?.content ?? '');
}

// ---------------------------------------------------------------------------
// Batch partitioning and parallel execution helpers
// ---------------------------------------------------------------------------

/** Check if messages should be compressed based on the compression config. */
function shouldCompressMessages(
  messages: readonly Message[],
  config: ContextCompressionConfig,
): boolean {
  if (config.maxMessages != null && messages.length > config.maxMessages) {
    return true;
  }
  if (config.maxTokenEstimate != null) {
    const estimatedTokens = messages.reduce((sum, m) => sum + m.content.length / 4, 0);
    if (estimatedTokens > config.maxTokenEstimate) {
      return true;
    }
  }
  return false;
}

interface ToolCallBatch {
  concurrent: boolean;
  calls: readonly ToolCall[];
}

/** Partition tool calls into maximal consecutive runs of parallel/serial tools. */
function partitionToolCalls(
  toolCalls: readonly ToolCall[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tools have varying types
  tools: Record<string, ToolDefinition<any, any>>,
): ToolCallBatch[] {
  const batches: ToolCallBatch[] = [];
  let currentBatch: ToolCall[] = [];
  let currentConcurrent: boolean | null = null;

  for (const tc of toolCalls) {
    const isParallel = tools[tc.name]?.parallel === true;

    if (currentConcurrent === null) {
      currentConcurrent = isParallel;
      currentBatch.push(tc);
    } else if (isParallel === currentConcurrent) {
      currentBatch.push(tc);
    } else {
      batches.push({ concurrent: currentConcurrent, calls: currentBatch });
      currentBatch = [tc];
      currentConcurrent = isParallel;
    }
  }

  if (currentBatch.length > 0 && currentConcurrent !== null) {
    batches.push({ concurrent: currentConcurrent, calls: currentBatch });
  }

  return batches;
}

interface ToolCallResult {
  message: Message;
  success: boolean;
}

/** Execute a single tool call and return the result message + success flag. */
async function executeToolCall(
  toolCall: ToolCall,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tools have varying types
  tools: Record<string, ToolDefinition<any, any>>,
  iteration: number,
  toolContext: ToolContext,
): Promise<ToolCallResult> {
  const toolDef = tools[toolCall.name];
  const callId = toolCall.id ?? `call_${iteration}_${toolCall.name}`;

  if (!toolDef) {
    return {
      message: {
        role: 'tool',
        toolCallId: callId,
        toolName: toolCall.name,
        content: JSON.stringify({
          error: `Tool "${toolCall.name}" not found. Available tools: ${Object.keys(tools).join(', ') || 'none'}`,
        }),
      },
      success: false,
    };
  }

  if (!toolDef.handler) {
    return {
      message: {
        role: 'tool',
        toolCallId: callId,
        toolName: toolCall.name,
        content: JSON.stringify({
          error: `Tool "${toolCall.name}" has no handler. Provide a handler on the tool definition or inject one via the \`tools\` ToolProvider option on run()/runWorkflow().`,
        }),
      },
      success: false,
    };
  }

  const validation = validateToolInput(toolDef, toolCall.arguments);
  if (!validation.ok) {
    return {
      message: {
        role: 'tool',
        toolCallId: callId,
        toolName: toolCall.name,
        content: JSON.stringify({
          error: `Invalid input for tool "${toolCall.name}": ${validation.error}`,
        }),
      },
      success: false,
    };
  }

  try {
    const result = await toolDef.handler(validation.data, toolContext);

    // Validate handler output against the tool's output schema
    const outputValidation = validateToolOutput(toolDef, result);
    if (!outputValidation.ok) {
      return {
        message: {
          role: 'tool',
          toolCallId: callId,
          toolName: toolCall.name,
          content: JSON.stringify({
            error: `Tool "${toolCall.name}" returned invalid output: ${outputValidation.error}`,
          }),
        },
        success: false,
      };
    }

    return {
      message: {
        role: 'tool',
        toolCallId: callId,
        toolName: toolCall.name,
        content: JSON.stringify(outputValidation.data),
      },
      success: true,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return {
      message: {
        role: 'tool',
        toolCallId: callId,
        toolName: toolCall.name,
        content: JSON.stringify({ error: errorMessage }),
      },
      success: false,
    };
  }
}

/** Execute a batch of tool calls concurrently with a concurrency limit. */
async function runConcurrentBatch(
  calls: readonly ToolCall[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tools have varying types
  tools: Record<string, ToolDefinition<any, any>>,
  iteration: number,
  toolContext: ToolContext,
  maxConcurrency: number,
): Promise<ToolCallResult[]> {
  const results: ToolCallResult[] = [];
  // Simple semaphore: process in chunks of maxConcurrency
  for (let i = 0; i < calls.length; i += maxConcurrency) {
    const chunk = calls.slice(i, i + maxConcurrency);
    const chunkResults = await Promise.all(
      chunk.map((tc) => executeToolCall(tc, tools, iteration, toolContext)),
    );
    results.push(...chunkResults);
  }
  return results;
}
