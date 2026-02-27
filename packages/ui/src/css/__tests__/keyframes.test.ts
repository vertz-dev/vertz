import { afterEach, describe, expect, it } from 'bun:test';
import { getInjectedCSS, resetInjectedStyles } from '../css';
import { keyframes } from '../keyframes';

afterEach(() => {
  resetInjectedStyles();
});

describe('keyframes', () => {
  it('returns the animation name', () => {
    const name = keyframes('test-fade', {
      from: { opacity: '0' },
      to: { opacity: '1' },
    });
    expect(name).toBe('test-fade');
  });

  it('produces valid @keyframes CSS with from/to', () => {
    keyframes('test-fade', {
      from: { opacity: '0' },
      to: { opacity: '1' },
    });
    const injected = getInjectedCSS();
    const css = injected.find((s) => s.includes('@keyframes test-fade'));
    expect(css).toBeDefined();
    expect(css).toContain('from {');
    expect(css).toContain('opacity: 0;');
    expect(css).toContain('to {');
    expect(css).toContain('opacity: 1;');
  });

  it('supports percentage-based frames', () => {
    keyframes('test-bounce', {
      '0%': { transform: 'translateY(0)' },
      '50%': { transform: 'translateY(-10px)' },
      '100%': { transform: 'translateY(0)' },
    });
    const injected = getInjectedCSS();
    const css = injected.find((s) => s.includes('@keyframes test-bounce'));
    expect(css).toBeDefined();
    expect(css).toContain('0% {');
    expect(css).toContain('50% {');
    expect(css).toContain('100% {');
  });

  it('supports multiple properties per frame', () => {
    keyframes('test-zoom', {
      from: { opacity: '0', transform: 'scale(0.95)' },
      to: { opacity: '1', transform: 'scale(1)' },
    });
    const injected = getInjectedCSS();
    const css = injected.find((s) => s.includes('@keyframes test-zoom'));
    expect(css).toBeDefined();
    expect(css).toContain('opacity: 0;');
    expect(css).toContain('transform: scale(0.95);');
    expect(css).toContain('opacity: 1;');
    expect(css).toContain('transform: scale(1);');
  });

  it('calls injectCSS with the CSS string', () => {
    keyframes('test-inject', {
      from: { opacity: '0' },
      to: { opacity: '1' },
    });
    const injected = getInjectedCSS();
    expect(injected.some((s) => s.includes('@keyframes test-inject'))).toBe(true);
  });
});
