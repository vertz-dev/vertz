import { describe, expect, it } from 'vitest';
import { camelToSnake, snakeToCamel } from '../casing';

describe('camelToSnake', () => {
  it('converts simple camelCase to snake_case', () => {
    expect(camelToSnake('firstName')).toBe('first_name');
  });

  it('converts multiple humps', () => {
    expect(camelToSnake('createdAtTimestamp')).toBe('created_at_timestamp');
  });

  it('handles single word (no conversion needed)', () => {
    expect(camelToSnake('name')).toBe('name');
  });

  it('handles already snake_case input', () => {
    expect(camelToSnake('first_name')).toBe('first_name');
  });

  it('handles consecutive uppercase letters (acronyms)', () => {
    expect(camelToSnake('htmlParser')).toBe('html_parser');
    expect(camelToSnake('parseJSON')).toBe('parse_json');
    expect(camelToSnake('getHTTPSUrl')).toBe('get_https_url');
  });

  it('handles id suffix', () => {
    expect(camelToSnake('orgId')).toBe('org_id');
    expect(camelToSnake('userId')).toBe('user_id');
  });

  it('handles empty string', () => {
    expect(camelToSnake('')).toBe('');
  });
});

describe('snakeToCamel', () => {
  it('converts simple snake_case to camelCase', () => {
    expect(snakeToCamel('first_name')).toBe('firstName');
  });

  it('converts multiple underscores', () => {
    expect(snakeToCamel('created_at_timestamp')).toBe('createdAtTimestamp');
  });

  it('handles single word (no conversion needed)', () => {
    expect(snakeToCamel('name')).toBe('name');
  });

  it('handles already camelCase input', () => {
    expect(snakeToCamel('firstName')).toBe('firstName');
  });

  it('handles empty string', () => {
    expect(snakeToCamel('')).toBe('');
  });

  it('handles leading underscore', () => {
    expect(snakeToCamel('_private')).toBe('_private');
  });

  it('handles double underscore by preserving it', () => {
    expect(snakeToCamel('org__id')).toBe('org__id');
  });
});
