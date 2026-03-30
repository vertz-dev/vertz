import type { ToolContext, ToolDefinition } from '../types';
import { validateToolInput } from './validate-tool-input';

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

/** The response from an LLM chat call. */
export interface LLMResponse {
  readonly text: string;
  readonly toolCalls: readonly ToolCall[];
}

/** Provider-agnostic interface for LLM communication. */
export interface LLMAdapter {
  chat(messages: readonly Message[]): Promise<LLMResponse>;
}

// ---------------------------------------------------------------------------
// Loop result
// ---------------------------------------------------------------------------

export type LoopStatus = 'complete' | 'max-iterations' | 'stuck' | 'error';

export interface LoopResult {
  readonly status: LoopStatus;
  readonly response: string;
  readonly iterations: number;
  readonly messages: readonly Message[];
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
  } = options;

  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    ...(previousMessages ?? []),
    { role: 'user', content: userMessage },
  ];

  let iteration = 0;
  let consecutiveNoProgress = 0;

  while (iteration < maxIterations) {
    iteration++;

    // Call the LLM — wrap in try/catch for provider errors
    let response: LLMResponse;
    try {
      response = await llm.chat(messages);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return {
        status: 'error',
        response: errorMessage,
        iterations: iteration,
        messages: Object.freeze([...messages]),
      };
    }

    // No tool calls — LLM is done
    if (response.toolCalls.length === 0) {
      messages.push({ role: 'assistant', content: response.text });

      return {
        status: 'complete',
        response: response.text,
        iterations: iteration,
        messages: Object.freeze([...messages]),
      };
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

    for (const toolCall of response.toolCalls) {
      const toolDef = tools[toolCall.name];
      const callId = toolCall.id ?? `call_${iteration}_${toolCall.name}`;

      if (!toolDef) {
        messages.push({
          role: 'tool',
          toolCallId: callId,
          toolName: toolCall.name,
          content: JSON.stringify({
            error: `Tool "${toolCall.name}" not found. Available tools: ${Object.keys(tools).join(', ') || 'none'}`,
          }),
        });
        continue;
      }

      if (!toolDef.handler) {
        messages.push({
          role: 'tool',
          toolCallId: callId,
          toolName: toolCall.name,
          content: JSON.stringify({
            error: `Tool "${toolCall.name}" is a client-side tool and cannot be executed on the server.`,
          }),
        });
        continue;
      }

      // Validate tool input against schema
      const validation = validateToolInput(toolDef, toolCall.arguments);
      if (!validation.ok) {
        messages.push({
          role: 'tool',
          toolCallId: callId,
          toolName: toolCall.name,
          content: JSON.stringify({
            error: `Invalid input for tool "${toolCall.name}": ${validation.error}`,
          }),
        });
        continue;
      }

      try {
        const result = await toolDef.handler(validation.data, toolContext);
        messages.push({
          role: 'tool',
          toolCallId: callId,
          toolName: toolCall.name,
          content: JSON.stringify(result),
        });
        hadSuccessfulToolCall = true;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        messages.push({
          role: 'tool',
          toolCallId: callId,
          toolName: toolCall.name,
          content: JSON.stringify({ error: errorMessage }),
        });
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
      return {
        status: 'stuck',
        response: '',
        iterations: iteration,
        messages: Object.freeze([...messages]),
      };
    }

    // Checkpoint callback
    if (checkpointInterval && onCheckpoint && iteration % checkpointInterval === 0) {
      onCheckpoint(iteration, messages);
    }
  }

  // Exceeded max iterations
  return {
    status: 'max-iterations',
    response: '',
    iterations: iteration,
    messages: Object.freeze([...messages]),
  };
}
