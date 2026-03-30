import { describe, expect, it } from 'bun:test';
import { s } from '@vertz/schema';
import type { Message } from '../loop/react-loop';
import { tool } from '../tool';
import {
  fromOpenAIResponse,
  toOpenAIMessages,
  toOpenAITools,
} from './openai-format';

// ---------------------------------------------------------------------------
// toOpenAIMessages
// ---------------------------------------------------------------------------

describe('toOpenAIMessages()', () => {
  describe('Given a conversation with system, user, and assistant messages', () => {
    describe('When converting to OpenAI format', () => {
      it('Then maps role and content directly', () => {
        const messages: Message[] = [
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
        ];

        const result = toOpenAIMessages(messages);

        expect(result).toEqual([
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
        ]);
      });
    });
  });

  describe('Given a tool result message with toolCallId and toolName', () => {
    describe('When converting to OpenAI format', () => {
      it('Then maps toolCallId to tool_call_id and role to tool', () => {
        const messages: Message[] = [
          {
            role: 'tool',
            content: '{"result":"ok"}',
            toolCallId: 'call_abc123',
            toolName: 'readFile',
          },
        ];

        const result = toOpenAIMessages(messages);

        expect(result).toEqual([
          {
            role: 'tool',
            content: '{"result":"ok"}',
            tool_call_id: 'call_abc123',
          },
        ]);
      });
    });
  });

  describe('Given an assistant message that represents a tool call', () => {
    describe('When the content starts with "[Calling "', () => {
      it('Then sets content to null (OpenAI expects null for tool-calling turns)', () => {
        const messages: Message[] = [
          { role: 'assistant', content: '[Calling readFile]' },
        ];

        const result = toOpenAIMessages(messages);

        expect(result).toEqual([{ role: 'assistant', content: null }]);
      });
    });
  });
});

// ---------------------------------------------------------------------------
// toOpenAITools
// ---------------------------------------------------------------------------

describe('toOpenAITools()', () => {
  describe('Given a record of tool definitions', () => {
    describe('When converting to OpenAI tools format', () => {
      it('Then returns OpenAI function tool objects with JSON Schema parameters', () => {
        const greet = tool({
          description: 'Greet a user',
          input: s.object({ name: s.string() }),
          output: s.object({ greeting: s.string() }),
          handler(input) {
            return { greeting: `Hi ${input.name}` };
          },
        });

        const result = toOpenAITools({ greet });

        expect(result).toHaveLength(1);
        expect(result[0].type).toBe('function');
        expect(result[0].function.name).toBe('greet');
        expect(result[0].function.description).toBe('Greet a user');
        expect(result[0].function.parameters).toBeDefined();
      });
    });
  });

  describe('Given an empty tools record', () => {
    describe('When converting to OpenAI format', () => {
      it('Then returns an empty array', () => {
        const result = toOpenAITools({});
        expect(result).toEqual([]);
      });
    });
  });
});

// ---------------------------------------------------------------------------
// fromOpenAIResponse
// ---------------------------------------------------------------------------

describe('fromOpenAIResponse()', () => {
  describe('Given an OpenAI response with text content only', () => {
    describe('When converting to LLMResponse', () => {
      it('Then returns text and empty toolCalls', () => {
        const response = {
          choices: [
            {
              message: {
                role: 'assistant' as const,
                content: 'The answer is 42.',
              },
            },
          ],
        };

        const result = fromOpenAIResponse(response);

        expect(result.text).toBe('The answer is 42.');
        expect(result.toolCalls).toEqual([]);
      });
    });
  });

  describe('Given an OpenAI response with tool calls', () => {
    describe('When converting to LLMResponse', () => {
      it('Then extracts tool call id, name, and parsed arguments', () => {
        const response = {
          choices: [
            {
              message: {
                role: 'assistant' as const,
                content: null,
                tool_calls: [
                  {
                    id: 'call_xyz',
                    type: 'function' as const,
                    function: {
                      name: 'readFile',
                      arguments: '{"path":"test.txt"}',
                    },
                  },
                ],
              },
            },
          ],
        };

        const result = fromOpenAIResponse(response);

        expect(result.text).toBe('');
        expect(result.toolCalls).toEqual([
          {
            id: 'call_xyz',
            name: 'readFile',
            arguments: { path: 'test.txt' },
          },
        ]);
      });
    });
  });

  describe('Given an OpenAI response with multiple tool calls', () => {
    describe('When converting to LLMResponse', () => {
      it('Then extracts all tool calls', () => {
        const response = {
          choices: [
            {
              message: {
                role: 'assistant' as const,
                content: null,
                tool_calls: [
                  {
                    id: 'call_1',
                    type: 'function' as const,
                    function: { name: 'toolA', arguments: '{}' },
                  },
                  {
                    id: 'call_2',
                    type: 'function' as const,
                    function: { name: 'toolB', arguments: '{"x":1}' },
                  },
                ],
              },
            },
          ],
        };

        const result = fromOpenAIResponse(response);

        expect(result.toolCalls).toHaveLength(2);
        expect(result.toolCalls[0].name).toBe('toolA');
        expect(result.toolCalls[1].name).toBe('toolB');
        expect(result.toolCalls[1].arguments).toEqual({ x: 1 });
      });
    });
  });

  describe('Given an OpenAI response with malformed tool call arguments', () => {
    describe('When converting to LLMResponse', () => {
      it('Then returns empty arguments object', () => {
        const response = {
          choices: [
            {
              message: {
                role: 'assistant' as const,
                content: null,
                tool_calls: [
                  {
                    id: 'call_bad',
                    type: 'function' as const,
                    function: {
                      name: 'broken',
                      arguments: 'not valid json{{{',
                    },
                  },
                ],
              },
            },
          ],
        };

        const result = fromOpenAIResponse(response);

        expect(result.toolCalls).toHaveLength(1);
        expect(result.toolCalls[0].arguments).toEqual({});
      });
    });
  });

  describe('Given an OpenAI response with no choices', () => {
    describe('When converting to LLMResponse', () => {
      it('Then returns empty text and no tool calls', () => {
        const response = { choices: [] };
        const result = fromOpenAIResponse(response);

        expect(result.text).toBe('');
        expect(result.toolCalls).toEqual([]);
      });
    });
  });
});
