import { describe, expect, it } from 'bun:test';
import { __element } from '../element';
import { isSVGTag, normalizeSVGAttr, SVG_NS } from '../svg-tags';

describe('isSVGTag', () => {
  it('returns true for common SVG tags', () => {
    expect(isSVGTag('svg')).toBe(true);
    expect(isSVGTag('path')).toBe(true);
    expect(isSVGTag('circle')).toBe(true);
    expect(isSVGTag('rect')).toBe(true);
    expect(isSVGTag('g')).toBe(true);
    expect(isSVGTag('line')).toBe(true);
    expect(isSVGTag('polyline')).toBe(true);
    expect(isSVGTag('polygon')).toBe(true);
    expect(isSVGTag('text')).toBe(true);
    expect(isSVGTag('defs')).toBe(true);
    expect(isSVGTag('linearGradient')).toBe(true);
    expect(isSVGTag('clipPath')).toBe(true);
    expect(isSVGTag('foreignObject')).toBe(true);
  });

  it('returns false for HTML tags', () => {
    expect(isSVGTag('div')).toBe(false);
    expect(isSVGTag('span')).toBe(false);
    expect(isSVGTag('p')).toBe(false);
    expect(isSVGTag('button')).toBe(false);
    expect(isSVGTag('input')).toBe(false);
  });

  it('returns false for title (excluded — ambiguous HTML/SVG)', () => {
    expect(isSVGTag('title')).toBe(false);
  });
});

describe('normalizeSVGAttr', () => {
  it('maps camelCase SVG attributes to hyphenated', () => {
    expect(normalizeSVGAttr('strokeWidth')).toBe('stroke-width');
    expect(normalizeSVGAttr('strokeLinecap')).toBe('stroke-linecap');
    expect(normalizeSVGAttr('strokeLinejoin')).toBe('stroke-linejoin');
    expect(normalizeSVGAttr('fillOpacity')).toBe('fill-opacity');
    expect(normalizeSVGAttr('fillRule')).toBe('fill-rule');
    expect(normalizeSVGAttr('clipRule')).toBe('clip-rule');
    expect(normalizeSVGAttr('stopColor')).toBe('stop-color');
  });

  it('preserves viewBox as-is', () => {
    expect(normalizeSVGAttr('viewBox')).toBe('viewBox');
  });

  it('passes through unknown attributes unchanged', () => {
    expect(normalizeSVGAttr('fill')).toBe('fill');
    expect(normalizeSVGAttr('stroke')).toBe('stroke');
    expect(normalizeSVGAttr('d')).toBe('d');
    expect(normalizeSVGAttr('width')).toBe('width');
    expect(normalizeSVGAttr('height')).toBe('height');
  });
});

describe('__element with SVG', () => {
  it('creates an SVG element with SVG namespace', () => {
    const el = __element('svg');
    expect(el.namespaceURI).toBe(SVG_NS);
    expect(el.tagName).toBe('svg');
  });

  it('creates a path element with SVG namespace', () => {
    const el = __element('path');
    expect(el.namespaceURI).toBe(SVG_NS);
  });

  it('creates a circle element with SVG namespace', () => {
    const el = __element('circle', { cx: '50', cy: '50', r: '25' });
    expect(el.namespaceURI).toBe(SVG_NS);
    expect(el.getAttribute('cx')).toBe('50');
    expect(el.getAttribute('cy')).toBe('50');
    expect(el.getAttribute('r')).toBe('25');
  });

  it('normalizes camelCase SVG attributes', () => {
    const el = __element('path', { strokeWidth: '2', strokeLinecap: 'round' });
    expect(el.getAttribute('stroke-width')).toBe('2');
    expect(el.getAttribute('stroke-linecap')).toBe('round');
  });

  it('preserves viewBox attribute', () => {
    const el = __element('svg', { viewBox: '0 0 24 24' });
    expect(el.getAttribute('viewBox')).toBe('0 0 24 24');
  });

  it('still creates HTML elements normally', () => {
    const el = __element('div');
    expect(el.tagName).toBe('DIV');
    expect(el.namespaceURI).toBe('http://www.w3.org/1999/xhtml');
  });
});
