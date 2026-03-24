import { describe, expect, it } from 'bun:test';
import { detectRuntime } from '../runtime-detect';

describe('detectRuntime', () => {
  it('returns bun when running under Bun', () => {
    // Tests run under Bun, so Bun is always in globalThis
    const result = detectRuntime();
    expect(result).toBe('bun');
  });

  it('returns a valid Runtime type', () => {
    const result = detectRuntime();
    expect(['bun', 'node']).toContain(result);
  });

  it('verifies the detection logic checks globalThis.Bun', () => {
    // When running under Bun, globalThis.Bun should be defined
    expect('Bun' in globalThis).toBe(true);
    expect(detectRuntime()).toBe('bun');
  });
});
