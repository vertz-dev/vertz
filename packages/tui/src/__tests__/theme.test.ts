import { describe, expect, it } from 'vitest';
import { colors, symbols } from '../theme';

describe('symbols', () => {
  it('success is check mark', () => {
    expect(symbols.success).toBe('\u2713');
  });

  it('error is ballot x', () => {
    expect(symbols.error).toBe('\u2717');
  });

  it('warning is warning sign', () => {
    expect(symbols.warning).toBe('\u26A0');
  });

  it('arrow is right arrow', () => {
    expect(symbols.arrow).toBe('\u279C');
  });

  it('info is info circle', () => {
    expect(symbols.info).toBe('\u2139');
  });

  it('pointer is right-pointing angle', () => {
    expect(symbols.pointer).toBe('\u276F');
  });

  it('bullet is circle', () => {
    expect(symbols.bullet).toBe('\u25CF');
  });

  it('dash is horizontal line', () => {
    expect(symbols.dash).toBe('\u2500');
  });

  it('symbols object is frozen', () => {
    expect(Object.isFrozen(symbols)).toBe(true);
  });
});

describe('colors', () => {
  it('success is greenBright', () => {
    expect(colors.success).toBe('greenBright');
  });

  it('error is redBright', () => {
    expect(colors.error).toBe('redBright');
  });

  it('warning is yellowBright', () => {
    expect(colors.warning).toBe('yellowBright');
  });

  it('info is cyanBright', () => {
    expect(colors.info).toBe('cyanBright');
  });

  it('dim is gray', () => {
    expect(colors.dim).toBe('gray');
  });

  it('method.GET is greenBright', () => {
    expect(colors.method.GET).toBe('greenBright');
  });

  it('method.POST is blueBright', () => {
    expect(colors.method.POST).toBe('blueBright');
  });

  it('method.PUT is yellowBright', () => {
    expect(colors.method.PUT).toBe('yellowBright');
  });

  it('method.DELETE is redBright', () => {
    expect(colors.method.DELETE).toBe('redBright');
  });

  it('method.PATCH is cyanBright', () => {
    expect(colors.method.PATCH).toBe('cyanBright');
  });

  it('colors object is frozen', () => {
    expect(Object.isFrozen(colors)).toBe(true);
  });
});
