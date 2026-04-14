import { afterEach, describe, expect, it } from '@vertz/test';
import { detectRuntime } from '../runtime-detect';

describe('detectRuntime', () => {
  const g = globalThis as Record<string, unknown>;
  let savedVtz: unknown;
  let savedBun: unknown;
  let hadVtz: boolean;
  let hadBun: boolean;

  afterEach(() => {
    // Restore original globalThis state
    if (hadVtz) {
      g.__vtz_runtime = savedVtz;
    } else {
      delete g.__vtz_runtime;
    }
    if (hadBun) {
      g.Bun = savedBun;
    } else {
      delete g.Bun;
    }
  });

  function saveAndClearGlobals() {
    hadVtz = '__vtz_runtime' in globalThis;
    hadBun = 'Bun' in globalThis;
    savedVtz = g.__vtz_runtime;
    savedBun = g.Bun;
    delete g.__vtz_runtime;
    delete g.Bun;
  }

  it('returns a valid Runtime type', () => {
    const result = detectRuntime();
    expect(['vtz', 'bun', 'node']).toContain(result);
  });

  it('returns vtz when __vtz_runtime is set on globalThis', () => {
    saveAndClearGlobals();
    g.__vtz_runtime = true;

    expect(detectRuntime()).toBe('vtz');
  });

  it('returns vtz over bun when both globals are present', () => {
    saveAndClearGlobals();
    g.__vtz_runtime = true;
    g.Bun = {};

    expect(detectRuntime()).toBe('vtz');
  });

  it('returns bun when Bun is set but __vtz_runtime is not', () => {
    saveAndClearGlobals();
    g.Bun = {};

    expect(detectRuntime()).toBe('bun');
  });

  it('returns node when neither vtz nor Bun globals are present', () => {
    saveAndClearGlobals();

    expect(detectRuntime()).toBe('node');
  });

  it('detects the current runtime consistently', () => {
    const first = detectRuntime();
    const second = detectRuntime();
    expect(first).toBe(second);
  });
});
