import { describe, expect, it } from 'vitest';
import { parsePromptSegments, extractVariables } from './prompt-editor-utils';

describe('parsePromptSegments', () => {
  it('returns a single text segment for plain text', () => {
    const result = parsePromptSegments('Hello world');
    expect(result).toEqual([{ type: 'text', value: 'Hello world' }]);
  });

  it('extracts a single variable', () => {
    const result = parsePromptSegments('Hello {{name}}!');
    expect(result).toEqual([
      { type: 'text', value: 'Hello ' },
      { type: 'variable', value: 'name' },
      { type: 'text', value: '!' },
    ]);
  });

  it('handles multiple variables', () => {
    const result = parsePromptSegments('{{greeting}} {{name}}, welcome to {{project}}');
    expect(result).toEqual([
      { type: 'variable', value: 'greeting' },
      { type: 'text', value: ' ' },
      { type: 'variable', value: 'name' },
      { type: 'text', value: ', welcome to ' },
      { type: 'variable', value: 'project' },
    ]);
  });

  it('handles text with no variables', () => {
    const result = parsePromptSegments('No variables here');
    expect(result).toEqual([{ type: 'text', value: 'No variables here' }]);
  });

  it('handles empty string', () => {
    expect(parsePromptSegments('')).toEqual([]);
  });

  it('handles adjacent variables', () => {
    const result = parsePromptSegments('{{a}}{{b}}');
    expect(result).toEqual([
      { type: 'variable', value: 'a' },
      { type: 'variable', value: 'b' },
    ]);
  });

  it('handles variable at start', () => {
    const result = parsePromptSegments('{{name}} is here');
    expect(result).toEqual([
      { type: 'variable', value: 'name' },
      { type: 'text', value: ' is here' },
    ]);
  });

  it('handles variable at end', () => {
    const result = parsePromptSegments('Hello {{name}}');
    expect(result).toEqual([
      { type: 'text', value: 'Hello ' },
      { type: 'variable', value: 'name' },
    ]);
  });
});

describe('extractVariables', () => {
  it('returns empty array for text without variables', () => {
    expect(extractVariables('Hello world')).toEqual([]);
  });

  it('extracts unique variable names', () => {
    expect(extractVariables('{{name}} and {{name}} and {{age}}')).toEqual(['name', 'age']);
  });

  it('extracts all distinct variable names', () => {
    expect(extractVariables('{{a}} {{b}} {{c}}')).toEqual(['a', 'b', 'c']);
  });
});
