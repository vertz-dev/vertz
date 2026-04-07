import { describe, expect, it } from 'bun:test';
import { s } from '@vertz/schema';
import { tool } from '../tool';
import { validateToolInput, validateToolOutput } from './validate-tool-input';

describe('validateToolInput()', () => {
  describe('Given a tool with input schema and valid input', () => {
    describe('When validated', () => {
      it('Then returns ok with parsed data', () => {
        const greet = tool({
          description: 'Greet',
          input: s.object({ name: s.string() }),
          output: s.object({ greeting: s.string() }),
          handler(input) {
            return { greeting: `Hi ${input.name}` };
          },
        });

        const result = validateToolInput(greet, { name: 'World' });

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.data).toEqual({ name: 'World' });
        }
      });
    });
  });

  describe('Given a tool with input schema and invalid input', () => {
    describe('When validated', () => {
      it('Then returns not ok with error message', () => {
        const greet = tool({
          description: 'Greet',
          input: s.object({ name: s.string() }),
          output: s.object({ greeting: s.string() }),
          handler(input) {
            return { greeting: `Hi ${input.name}` };
          },
        });

        const result = validateToolInput(greet, { name: 42 });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBeDefined();
        }
      });
    });
  });

  describe('Given a tool with schema that strips unknown keys', () => {
    describe('When validated with extra keys', () => {
      it('Then returns ok with stripped data', () => {
        const simple = tool({
          description: 'Simple',
          input: s.object({ x: s.string() }),
          output: s.object({}),
          handler() {
            return {};
          },
        });

        const result = validateToolInput(simple, { x: 'hello', extra: 'ignored' });

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.data).toEqual({ x: 'hello' });
        }
      });
    });
  });
});

describe('validateToolOutput()', () => {
  describe('Given a tool with output schema and valid output', () => {
    describe('When validated', () => {
      it('Then returns ok with parsed data', () => {
        const greet = tool({
          description: 'Greet',
          input: s.object({ name: s.string() }),
          output: s.object({ greeting: s.string() }),
          handler(input) {
            return { greeting: `Hi ${input.name}` };
          },
        });

        const result = validateToolOutput(greet, { greeting: 'Hello!' });

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.data).toEqual({ greeting: 'Hello!' });
        }
      });
    });
  });

  describe('Given a tool with output schema and invalid output', () => {
    describe('When validated', () => {
      it('Then returns not ok with error message', () => {
        const greet = tool({
          description: 'Greet',
          input: s.object({ name: s.string() }),
          output: s.object({ greeting: s.string() }),
          handler(input) {
            return { greeting: `Hi ${input.name}` };
          },
        });

        const result = validateToolOutput(greet, { greeting: 42 });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBeDefined();
        }
      });
    });
  });

  describe('Given a tool with output schema and extra keys in output', () => {
    describe('When validated', () => {
      it('Then returns ok with stripped data', () => {
        const simple = tool({
          description: 'Simple',
          input: s.object({}),
          output: s.object({ x: s.number() }),
          handler() {
            return { x: 1 };
          },
        });

        const result = validateToolOutput(simple, { x: 1, extra: 'ignored' });

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.data).toEqual({ x: 1 });
        }
      });
    });
  });
});
