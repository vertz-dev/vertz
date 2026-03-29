import { describe, expect, it } from 'bun:test';
import { googleFont } from '../google-font';

describe('googleFont()', () => {
  it('returns a FontDescriptor with __google metadata and undefined src', () => {
    const result = googleFont('Inter', {
      weight: '100..900',
      subsets: ['latin'],
    });

    expect(result.__brand).toBe('FontDescriptor');
    expect(result.family).toBe('Inter');
    expect(result.weight).toBe('100..900');
    expect(result.style).toBe('normal');
    expect(result.display).toBe('swap');
    expect(result.src).toBeUndefined();
    expect(result.subsets).toEqual(['latin']);
    expect(result.__google).toEqual({
      family: 'Inter',
      weight: '100..900',
      style: ['normal'],
      subsets: ['latin'],
      display: 'swap',
    });
  });

  it('accepts numeric weight', () => {
    const result = googleFont('Roboto', { weight: 400 });

    expect(result.weight).toBe('400');
    expect(result.__google!.weight).toBe(400);
  });

  it('accepts array of weights', () => {
    const result = googleFont('Roboto', { weight: [400, 700] });

    expect(result.weight).toBe('400;700');
    expect(result.__google!.weight).toEqual([400, 700]);
  });

  it('accepts multiple styles', () => {
    const result = googleFont('Playfair Display', {
      weight: '400..700',
      style: ['normal', 'italic'],
    });

    expect(result.style).toBe('normal');
    expect(result.__google!.style).toEqual(['normal', 'italic']);
  });

  it('accepts single italic style', () => {
    const result = googleFont('Dancing Script', {
      weight: '400..700',
      style: 'italic',
    });

    expect(result.style).toBe('italic');
    expect(result.__google!.style).toEqual(['italic']);
  });

  it('uses default subsets and display when omitted', () => {
    const result = googleFont('Inter', { weight: '100..900' });

    expect(result.subsets).toEqual(['latin']);
    expect(result.display).toBe('swap');
  });

  it('accepts custom fallback fonts', () => {
    const result = googleFont('Inter', {
      weight: '100..900',
      fallback: ['system-ui', 'sans-serif'],
    });

    expect(result.fallback).toEqual(['system-ui', 'sans-serif']);
  });

  it('accepts adjustFontFallback: false', () => {
    const result = googleFont('Inter', {
      weight: '100..900',
      adjustFontFallback: false,
    });

    expect(result.adjustFontFallback).toBe(false);
  });

  it('defaults adjustFontFallback to true', () => {
    const result = googleFont('Inter', { weight: '100..900' });

    expect(result.adjustFontFallback).toBe(true);
  });

  it('accepts custom display strategy', () => {
    const result = googleFont('Inter', {
      weight: '100..900',
      display: 'optional',
    });

    expect(result.display).toBe('optional');
    expect(result.__google!.display).toBe('optional');
  });
});
