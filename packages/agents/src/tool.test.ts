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
        expect(Object.isFrozen(greet)).toBe(true);
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

  describe('Given a tool config without a handler', () => {
    describe('When tool() is called', () => {
      it('Then creates a valid tool declaration (handler injected at runtime via ToolProvider)', () => {
        const def = tool({
          description: 'No handler tool',
          input: s.object({}),
          output: s.object({}),
        });

        expect(def.kind).toBe('tool');
        expect(def.handler).toBeUndefined();
      });
    });
  });

  describe('Given a tool definition returned by tool()', () => {
    describe('When checking immutability', () => {
      it('Then the definition is frozen', () => {
        const def = tool({
          description: 'Frozen tool',
          input: s.object({}),
          output: s.object({}),
          handler() {
            return {};
          },
        });

        expect(Object.isFrozen(def)).toBe(true);
      });
    });
  });

  describe('safeToRetry flag', () => {
    it('forwards safeToRetry: true from config to definition', () => {
      const def = tool({
        description: 'Pure read',
        input: s.object({}),
        output: s.object({}),
        safeToRetry: true,
      });
      expect(def.safeToRetry).toBe(true);
    });

    it('leaves safeToRetry undefined when omitted (side-effecting default)', () => {
      const def = tool({
        description: 'Post to Slack',
        input: s.object({}),
        output: s.object({}),
      });
      expect(def.safeToRetry).toBeUndefined();
    });
  });
});
