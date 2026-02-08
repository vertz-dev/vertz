import { describe, expect, it } from 'vitest';
import { createCLI, defineConfig, loadConfig } from '../index.js';

describe('public API', () => {
  it('exports createCLI function', () => {
    expect(typeof createCLI).toBe('function');
  });

  it('exports defineConfig function', () => {
    expect(typeof defineConfig).toBe('function');
  });

  it('exports loadConfig function', () => {
    expect(typeof loadConfig).toBe('function');
  });
});
