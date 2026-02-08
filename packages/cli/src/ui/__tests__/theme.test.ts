import { describe, expect, it } from 'vitest';
import { colors, symbols } from '../theme';

describe('symbols', () => {
  it('has error symbol', () => {
    expect(symbols.error).toBeDefined();
    expect(typeof symbols.error).toBe('string');
  });

  it('has warning symbol', () => {
    expect(symbols.warning).toBeDefined();
    expect(typeof symbols.warning).toBe('string');
  });

  it('has success symbol', () => {
    expect(symbols.success).toBeDefined();
    expect(typeof symbols.success).toBe('string');
  });

  it('has info symbol', () => {
    expect(symbols.info).toBeDefined();
    expect(typeof symbols.info).toBe('string');
  });

  it('has pointer symbol', () => {
    expect(symbols.pointer).toBeDefined();
  });

  it('has bullet symbol', () => {
    expect(symbols.bullet).toBeDefined();
  });

  it('has dash symbol', () => {
    expect(symbols.dash).toBeDefined();
  });
});

describe('colors', () => {
  it('has error color', () => {
    expect(colors.error).toBeDefined();
    expect(typeof colors.error).toBe('string');
  });

  it('has warning color', () => {
    expect(colors.warning).toBeDefined();
  });

  it('has success color', () => {
    expect(colors.success).toBeDefined();
  });

  it('has info color', () => {
    expect(colors.info).toBeDefined();
  });

  it('has dim modifier', () => {
    expect(colors.dim).toBeDefined();
  });

  it('has bold modifier', () => {
    expect(colors.bold).toBeDefined();
  });

  it('has reset code', () => {
    expect(colors.reset).toBeDefined();
  });
});
