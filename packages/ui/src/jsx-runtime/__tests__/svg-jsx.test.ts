import { describe, expect, it } from 'bun:test';
import { SVG_NS } from '../../dom/svg-tags';
import { jsx } from '../index';

describe('JSX Runtime — SVG support', () => {
  it('creates SVG elements with correct namespace', () => {
    const el = jsx('svg', { viewBox: '0 0 24 24', width: '24', height: '24' });
    expect(el.namespaceURI).toBe(SVG_NS);
    expect(el.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(el.getAttribute('width')).toBe('24');
  });

  it('creates path elements with SVG namespace', () => {
    const el = jsx('path', { d: 'M12 2L2 22h20L12 2z', fill: 'none', stroke: 'black' });
    expect(el.namespaceURI).toBe(SVG_NS);
    expect(el.getAttribute('d')).toBe('M12 2L2 22h20L12 2z');
    expect(el.getAttribute('fill')).toBe('none');
    expect(el.getAttribute('stroke')).toBe('black');
  });

  it('normalizes camelCase SVG attributes', () => {
    const el = jsx('path', {
      d: 'M0 0',
      strokeWidth: '2',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    });
    expect(el.getAttribute('stroke-width')).toBe('2');
    expect(el.getAttribute('stroke-linecap')).toBe('round');
    expect(el.getAttribute('stroke-linejoin')).toBe('round');
  });

  it('sets class via setAttribute on SVG elements', () => {
    const el = jsx('svg', { class: 'icon', viewBox: '0 0 24 24' });
    expect(el.getAttribute('class')).toBe('icon');
  });

  it('supports nested SVG children', () => {
    const path = jsx('path', { d: 'M0 0L10 10' });
    const svg = jsx('svg', {
      viewBox: '0 0 24 24',
      children: path,
    });
    expect(svg.namespaceURI).toBe(SVG_NS);
    expect(svg.childNodes.length).toBe(1);
    expect((svg.childNodes[0] as Element).namespaceURI).toBe(SVG_NS);
  });

  it('handles circle element with attributes', () => {
    const el = jsx('circle', { cx: '12', cy: '12', r: '10', fillOpacity: '0.5' });
    expect(el.namespaceURI).toBe(SVG_NS);
    expect(el.getAttribute('cx')).toBe('12');
    expect(el.getAttribute('fill-opacity')).toBe('0.5');
  });

  it('handles g element for grouping', () => {
    const el = jsx('g', {
      children: [
        jsx('circle', { cx: '10', cy: '10', r: '5' }),
        jsx('rect', { x: '0', y: '0', width: '20', height: '20' }),
      ],
    });
    expect(el.namespaceURI).toBe(SVG_NS);
    expect(el.childNodes.length).toBe(2);
  });

  it('does not affect HTML element creation', () => {
    const el = jsx('div', { class: 'container', children: 'hello' });
    expect(el).toBeInstanceOf(HTMLDivElement);
    expect(el.getAttribute('class')).toBe('container');
    expect(el.textContent).toBe('hello');
  });
});
