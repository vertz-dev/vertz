import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectRuntime } from '../runtime-detect.js';

describe('detectRuntime', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns "bun" when Bun global is available', () => {
    vi.stubGlobal('Bun', { version: '1.0.0' });
    expect(detectRuntime()).toBe('bun');
  });

  it('returns "node" when Bun global is not available', () => {
    vi.stubGlobal('Bun', undefined);
    expect(detectRuntime()).toBe('node');
  });
});
