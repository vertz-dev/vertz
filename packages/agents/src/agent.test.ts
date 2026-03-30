import { describe, expect, it } from 'bun:test';
import { s } from '@vertz/schema';
import { agent } from './agent';
import { tool } from './tool';

describe('agent()', () => {
  const greetTool = tool({
    description: 'Greet someone',
    input: s.object({ name: s.string() }),
    output: s.object({ greeting: s.string() }),
    handler(input) {
      return { greeting: `Hello, ${input.name}!` };
    },
  });

  describe('Given a valid agent config with state, tools, and model', () => {
    describe('When agent() is called', () => {
      it('Then returns a frozen AgentDefinition with kind "agent"', () => {
        const greeter = agent('greeter', {
          state: s.object({ count: s.number() }),
          initialState: { count: 0 },
          tools: { greet: greetTool },
          model: {
            provider: 'cloudflare',
            model: 'llama-3.3-70b-instruct-fp8-fast',
          },
        });

        expect(greeter.kind).toBe('agent');
        expect(greeter.name).toBe('greeter');
        expect(greeter.initialState).toEqual({ count: 0 });
        expect(greeter.tools.greet).toBe(greetTool);
        expect(greeter.model.provider).toBe('cloudflare');
        expect(Object.isFrozen(greeter)).toBe(true);
      });
    });
  });

  describe('Given an agent config with loop settings', () => {
    describe('When agent() is called', () => {
      it('Then preserves the loop configuration', () => {
        const reviewer = agent('reviewer', {
          state: s.object({ status: s.string() }),
          initialState: { status: 'idle' },
          tools: {},
          model: { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
          loop: {
            maxIterations: 50,
            onStuck: 'escalate',
            stuckThreshold: 5,
            checkpointEvery: 10,
          },
        });

        expect(reviewer.loop).toEqual({
          maxIterations: 50,
          onStuck: 'escalate',
          stuckThreshold: 5,
          checkpointEvery: 10,
        });
      });
    });
  });

  describe('Given an agent config without loop settings', () => {
    describe('When agent() is called', () => {
      it('Then applies sensible defaults', () => {
        const simple = agent('simple', {
          state: s.object({}),
          initialState: {},
          tools: {},
          model: { provider: 'cloudflare', model: 'kimi-k2' },
        });

        expect(simple.loop).toEqual({
          maxIterations: 20,
          onStuck: 'stop',
          stuckThreshold: 3,
          checkpointEvery: 5,
        });
      });
    });
  });

  describe('Given an agent name with invalid characters', () => {
    describe('When agent() is called', () => {
      it('Then throws an error for uppercase characters', () => {
        expect(() =>
          agent('MyAgent', {
            state: s.object({}),
            initialState: {},
            tools: {},
            model: { provider: 'cloudflare', model: 'test' },
          }),
        ).toThrow('agent() name must be a non-empty lowercase string');
      });

      it('Then throws an error for empty string', () => {
        expect(() =>
          agent('', {
            state: s.object({}),
            initialState: {},
            tools: {},
            model: { provider: 'cloudflare', model: 'test' },
          }),
        ).toThrow('agent() name must be a non-empty lowercase string');
      });
    });
  });

  describe('Given an agent config with lifecycle hooks', () => {
    describe('When agent() is called', () => {
      it('Then preserves the hook functions', () => {
        const onStart = () => {};
        const onComplete = () => {};
        const onStuck = () => {};

        const hooked = agent('hooked', {
          state: s.object({ status: s.string() }),
          initialState: { status: 'idle' },
          tools: {},
          model: { provider: 'cloudflare', model: 'test' },
          onStart,
          onComplete,
          onStuck,
        });

        expect(hooked.onStart).toBe(onStart);
        expect(hooked.onComplete).toBe(onComplete);
        expect(hooked.onStuck).toBe(onStuck);
      });
    });
  });

  describe('Given an agent config with multiple tools', () => {
    describe('When agent() is called', () => {
      it('Then all tools are accessible by name on the definition', () => {
        const readFile = tool({
          description: 'Read a file',
          input: s.object({ path: s.string() }),
          output: s.object({ content: s.string() }),
          handler() {
            return { content: '' };
          },
        });

        const writeFile = tool({
          description: 'Write a file',
          input: s.object({ path: s.string(), content: s.string() }),
          output: s.object({ success: s.boolean() }),
          handler() {
            return { success: true };
          },
        });

        const coder = agent('coder', {
          state: s.object({ files: s.number() }),
          initialState: { files: 0 },
          tools: { readFile, writeFile },
          model: { provider: 'minimax', model: 'minimax-01' },
        });

        expect(Object.keys(coder.tools)).toEqual(['readFile', 'writeFile']);
        expect(coder.tools.readFile.description).toBe('Read a file');
        expect(coder.tools.writeFile.description).toBe('Write a file');
      });
    });
  });
});
