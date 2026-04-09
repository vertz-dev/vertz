import { describe, expect, it } from '@vertz/test';
import { s } from '@vertz/schema';
import { tool } from './tool';

describe('tool()', () => {
  describe('Given a valid tool config with input, output, and handler', () => {
    describe('When tool() is called', () => {
      it('Then returns a frozen ToolDefinition with kind "tool"', () => {
        const greet = tool({
          description: 'Generate a greeting',
          input: s.object({ name: s.string() }),
          output: s.object({ greeting: s.string() }),
          handler(input) {
            return { greeting: `Hello, ${input.name}!` };
          },
        });

        expect(greet.kind).toBe('tool');
        expect(greet.description).toBe('Generate a greeting');
        expect(greet.execution).toBe('server');
        expect(Object.isFrozen(greet)).toBe(true);
      });
    });
  });

  describe('Given a tool config without a handler (client-side tool)', () => {
    describe('When tool() is called with execution: "client"', () => {
      it('Then returns a ToolDefinition with execution "client" and no handler', () => {
        const screenshot = tool({
          description: 'Take a screenshot',
          input: s.object({ selector: s.string().optional() }),
          output: s.object({ dataUrl: s.string() }),
          execution: 'client',
        });

        expect(screenshot.kind).toBe('tool');
        expect(screenshot.execution).toBe('client');
        expect(screenshot.handler).toBeUndefined();
      });
    });
  });

  describe('Given a tool config with approval required', () => {
    describe('When tool() is called', () => {
      it('Then returns a ToolDefinition with the approval config', () => {
        const deploy = tool({
          description: 'Deploy to production',
          input: s.object({ version: s.string() }),
          output: s.object({ url: s.string() }),
          approval: {
            required: true,
            message: 'Deploy to production?',
            timeout: '7d',
          },
          handler(input) {
            return { url: `https://example.com/${input.version}` };
          },
        });

        expect(deploy.approval).toEqual({
          required: true,
          message: 'Deploy to production?',
          timeout: '7d',
        });
      });
    });
  });

  describe('Given a tool config with an empty description', () => {
    describe('When tool() is called', () => {
      it('Then throws an error', () => {
        expect(() =>
          tool({
            description: '',
            input: s.object({}),
            output: s.object({}),
            handler() {
              return {};
            },
          }),
        ).toThrow('tool() description must be a non-empty string');
      });
    });
  });

  describe('Given a server tool config without a handler', () => {
    describe('When tool() is called', () => {
      it('Then creates a valid tool declaration (handler injected at runtime via ToolProvider)', () => {
        const def = tool({
          description: 'No handler server tool',
          input: s.object({}),
          output: s.object({}),
        });

        expect(def.kind).toBe('tool');
        expect(def.execution).toBe('server');
        expect(def.handler).toBeUndefined();
      });
    });
  });

  describe('Given a tool definition returned by tool()', () => {
    describe('When checking immutability', () => {
      it('Then nested objects are also frozen (deep freeze)', () => {
        const def = tool({
          description: 'Deep frozen tool',
          input: s.object({}),
          output: s.object({}),
          approval: { required: true, message: 'Approve?', timeout: '1d' },
          handler() {
            return {};
          },
        });

        expect(Object.isFrozen(def)).toBe(true);
        expect(Object.isFrozen(def.approval)).toBe(true);
      });
    });
  });

  describe('Given a tool config with approval message as a function', () => {
    describe('When tool() is called', () => {
      it('Then preserves the function in the approval config', () => {
        const messageFn = (input: { version: string }) => `Deploy v${input.version}?`;
        const deploy = tool({
          description: 'Deploy',
          input: s.object({ version: s.string() }),
          output: s.object({ url: s.string() }),
          approval: {
            required: true,
            message: messageFn,
          },
          handler(input) {
            return { url: `https://example.com/${input.version}` };
          },
        });

        expect(deploy.approval?.message).toBe(messageFn);
      });
    });
  });
});
