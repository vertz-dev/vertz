import type { ToolDefinition } from '../types';
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
}

/** A tool call requested by the LLM. */
export interface ToolCall {
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
  readonly checkpointEvery?: number;
  readonly onCheckpoint?: (iteration: number, messages: readonly Message[]) => void;
}

// ---------------------------------------------------------------------------
// ReAct loop
// ---------------------------------------------------------------------------

/**
 * Execute a ReAct (Reasoning + Acting) loop.
 *
 * The loop cycles through: think → call tool(s) → observe → think → ...
 * until the LLM responds with text only (no tool calls) or the iteration
 * limit is reached.
 */
export async function reactLoop(options: ReactLoopOptions): Promise<LoopResult> {
  const { llm, tools, systemPrompt, userMessage, maxIterations, checkpointEvery, onCheckpoint } =
    options;

  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];

  let iteration = 0;

  while (iteration < maxIterations) {
    iteration++;

    const response = await llm.chat(messages);

    // No tool calls — LLM is done
    if (response.toolCalls.length === 0) {
      messages.push({ role: 'assistant', content: response.text });

      return {
        status: 'complete',
        response: response.text,
        iterations: iteration,
        messages,
      };
    }

    // LLM requested tool calls — execute them
    messages.push({
      role: 'assistant',
      content: response.text || `[Calling ${response.toolCalls.map((tc) => tc.name).join(', ')}]`,
    });

    for (const toolCall of response.toolCalls) {
      const toolDef = tools[toolCall.name];
      const callId = `call_${iteration}_${toolCall.name}`;

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
        const result = await toolDef.handler(validation.data, {
          agentId: 'loop',
          agentName: 'loop',
        });
        messages.push({
          role: 'tool',
          toolCallId: callId,
          toolName: toolCall.name,
          content: JSON.stringify(result),
        });
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

    // Checkpoint callback
    if (checkpointEvery && onCheckpoint && iteration % checkpointEvery === 0) {
      onCheckpoint(iteration, messages);
    }
  }

  // Exceeded max iterations
  return {
    status: 'max-iterations',
    response: '',
    iterations: iteration,
    messages,
  };
}
