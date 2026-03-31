import { describe, expect, it } from 'bun:test';
import { parseEntityIntent } from '../intent';

describe('parseEntityIntent', () => {
  it('parses name and fields', () => {
    const intent = parseEntityIntent('posts', 'title:text, body:text');

    expect(intent.name).toBe('posts');
    const userFields = intent.fields.filter((f) => ['title', 'body'].includes(f.name));
    expect(userFields).toEqual([
      { name: 'title', type: 'text' },
      { name: 'body', type: 'text' },
    ]);
  });

  it('parses field with default value', () => {
    const intent = parseEntityIntent('tasks', 'completed:boolean:false');

    const field = intent.fields.find((f) => f.name === 'completed');
    expect(field).toEqual({ name: 'completed', type: 'boolean', defaultValue: 'false' });
  });

  it('trims whitespace from field definitions', () => {
    const intent = parseEntityIntent('tasks', '  title : text , body : text  ');

    const userFields = intent.fields.filter((f) => ['title', 'body'].includes(f.name));
    expect(userFields).toEqual([
      { name: 'title', type: 'text' },
      { name: 'body', type: 'text' },
    ]);
  });

  it('parses --belongs-to', () => {
    const intent = parseEntityIntent('posts', 'title:text', ['users']);

    expect(intent.belongsTo).toEqual(['users']);
  });

  it('auto-adds id, createdAt fields', () => {
    const intent = parseEntityIntent('posts', 'title:text');

    const fieldNames = intent.fields.map((f) => f.name);
    expect(fieldNames).toContain('id');
    expect(fieldNames).toContain('createdAt');
    expect(fieldNames).toContain('title');
  });

  it('does not duplicate id if user provides it', () => {
    const intent = parseEntityIntent('posts', 'id:uuid, title:text');

    const idFields = intent.fields.filter((f) => f.name === 'id');
    expect(idFields).toHaveLength(1);
  });

  it('adds FK field for belongs-to relation', () => {
    const intent = parseEntityIntent('posts', 'title:text', ['users']);

    const fieldNames = intent.fields.map((f) => f.name);
    expect(fieldNames).toContain('userId');
  });

  it('throws on empty name', () => {
    expect(() => parseEntityIntent('', 'title:text')).toThrow();
  });

  it('throws on empty fields', () => {
    expect(() => parseEntityIntent('posts', '')).toThrow();
  });
});
