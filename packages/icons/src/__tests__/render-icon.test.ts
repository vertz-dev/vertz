import { describe, expect, it } from 'bun:test';
import { renderIcon } from '../render-icon';

const SAMPLE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M12 3v18"/></svg>';

const MULTI_LINE_SVG = `<svg
  xmlns="http://www.w3.org/2000/svg"
  width="24"
  height="24"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
>
  <path d="M12 3v18"/>
</svg>`;

describe('renderIcon', () => {
  it('returns an HTMLSpanElement', () => {
    const el = renderIcon(SAMPLE_SVG);
    expect(el).toBeInstanceOf(HTMLSpanElement);
  });

  it('applies default size 16px to wrapper style and SVG attributes', () => {
    const el = renderIcon(SAMPLE_SVG);
    expect(el.style.width).toBe('16px');
    expect(el.style.height).toBe('16px');
    const svg = el.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute('width')).toBe('16');
    expect(svg?.getAttribute('height')).toBe('16');
  });

  it('applies custom size to wrapper style and SVG attributes', () => {
    const el = renderIcon(SAMPLE_SVG, { size: 32 });
    expect(el.style.width).toBe('32px');
    expect(el.style.height).toBe('32px');
    const svg = el.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute('width')).toBe('32');
    expect(svg?.getAttribute('height')).toBe('32');
  });

  it('applies class prop when provided', () => {
    const el = renderIcon(SAMPLE_SVG, { class: 'my-icon' });
    expect(el.className).toBe('my-icon');
  });

  it('does not set class when omitted', () => {
    const el = renderIcon(SAMPLE_SVG);
    expect(el.className).toBe('');
  });

  it('preserves SVG content in innerHTML', () => {
    const el = renderIcon(SAMPLE_SVG);
    const svg = el.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg?.querySelector('path')).toBeTruthy();
  });

  it('does not modify stroke-width when replacing width', () => {
    const el = renderIcon(MULTI_LINE_SVG, { size: 16 });
    const svg = el.querySelector('svg');
    expect(svg?.getAttribute('stroke-width')).toBe('2');
    expect(svg?.getAttribute('width')).toBe('16');
    expect(svg?.getAttribute('height')).toBe('16');
  });

  it('handles multi-line SVG strings (actual lucide format)', () => {
    const el = renderIcon(MULTI_LINE_SVG, { size: 32 });
    expect(el.style.width).toBe('32px');
    const svg = el.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('32');
    expect(svg?.getAttribute('height')).toBe('32');
    expect(svg?.querySelector('path')).toBeTruthy();
  });
});
