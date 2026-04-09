import { describe, expect, it } from '@vertz/test';
import { s } from '@vertz/schema';
import { tool } from '../tool';
import { toolsToDescriptions } from './tool-description';

describe('toolsToDescriptions()', () => {
  describe('Given a record of tool definitions', () => {
    describe('When converted to descriptions', () => {
      it('Then returns an array of tool descriptions with name and description', () => {
        const readFile = tool({
          description: 'Read a file from the filesystem',
          input: s.object({ path: s.string() }),
          output: s.object({ content: s.string() }),
          handler() {
            return { content: '' };
          },
        });

        const writeFile = tool({
          description: 'Write content to a file',
          input: s.object({ path: s.string(), content: s.string() }),
          output: s.object({ success: s.boolean() }),
          handler() {
            return { success: true };
          },
        });

        const descriptions = toolsToDescriptions({ readFile, writeFile });

        expect(descriptions).toHaveLength(2);
        expect(descriptions[0]!.name).toBe('readFile');
        expect(descriptions[0]!.description).toBe('Read a file from the filesystem');
        expect(descriptions[1]!.name).toBe('writeFile');
        expect(descriptions[1]!.description).toBe('Write content to a file');
      });
    });
  });

  describe('Given a tool with a schema that has JSON Schema representation', () => {
    describe('When converted to descriptions', () => {
      it('Then includes the JSON schema as parameters', () => {
        const greet = tool({
          description: 'Greet someone',
          input: s.object({ name: s.string(), age: s.number().optional() }),
          output: s.object({ greeting: s.string() }),
          handler(input) {
            return { greeting: `Hi ${input.name}` };
          },
        });

        const descriptions = toolsToDescriptions({ greet });

        expect(descriptions[0]!.parameters).toBeDefined();
        expect(descriptions[0]!.parameters.type).toBe('object');
        expect((descriptions[0]!.parameters as Record<string, unknown>).properties).toBeDefined();
      });
    });
  });

  describe('Given an empty tools record', () => {
    describe('When converted to descriptions', () => {
      it('Then returns an empty array', () => {
        const descriptions = toolsToDescriptions({});
        expect(descriptions).toEqual([]);
      });
    });
  });
});
