import { describe, expect, it } from 'bun:test';
import { detectRuntime } from '../runtime-detect';

describe('detectRuntime', () => {
  it('returns bun or node depending on environment', () => {
    const result = detectRuntime();
    expect(['bun', 'node']).toContain(result);
  });

  it('returns a string type', () => {
    const result = detectRuntime();
    expect(typeof result).toBe('string');
  });
});
