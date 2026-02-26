import { describe, expect, it } from 'vitest';
import { jsx } from '../jsx-runtime/index';
import type { TuiNode } from '../nodes/types';
import { renderToString } from '../render-to-string';

// Helper to create elements without JSX syntax (since tests aren't compiled)
function h(tag: string, props: Record<string, unknown>, ...children: unknown[]): TuiNode {
  return jsx(tag, { ...props, children: children.length === 1 ? children[0] : children });
}

// Build ANSI regex without literal escape char to satisfy biome's noControlCharactersInRegex
const ESC = String.fromCharCode(0x1b);
const ANSI_RE = new RegExp(`${ESC}\\[[0-9;]*m`, 'g');

/** Strip all ANSI SGR escape sequences from a string. */
function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '');
}

describe('renderToString', () => {
  it('renders plain text to a string', () => {
    const node = h('Text', {}, 'Hello TUI');
    const output = renderToString(node, { width: 40 });
    expect(output).toContain('Hello TUI');
  });

  it('renders bold text with ANSI codes', () => {
    const node = h('Text', { bold: true }, 'Bold');
    const output = renderToString(node, { width: 40 });
    // Each cell gets its own SGR codes: \x1b[1mB\x1b[0m\x1b[1mo\x1b[0m...
    expect(output).toContain('\x1b[1m');
    expect(output).toContain('\x1b[0m');
    expect(stripAnsi(output)).toContain('Bold');
  });

  it('renders colored text with ANSI color codes', () => {
    const node = h('Text', { color: 'green' }, 'Success');
    const output = renderToString(node, { width: 40 });
    // Green foreground is SGR code 32
    expect(output).toContain('\x1b[32m');
    expect(stripAnsi(output)).toContain('Success');
  });

  it('renders Box with column children on separate lines', () => {
    const node = h(
      'Box',
      { direction: 'column' },
      h('Text', {}, 'Line 1'),
      h('Text', {}, 'Line 2'),
    );
    const output = renderToString(node, { width: 40 });
    const lines = output.split('\n');
    expect(lines[0]).toContain('Line 1');
    expect(lines[1]).toContain('Line 2');
  });

  it('renders Box with row children on the same line', () => {
    const node = h('Box', { direction: 'row' }, h('Text', {}, 'AB'), h('Text', {}, 'CD'));
    const output = renderToString(node, { width: 40 });
    const firstLine = output.split('\n')[0] ?? '';
    expect(firstLine).toContain('AB');
    expect(firstLine).toContain('CD');
  });

  it('renders Box with border', () => {
    const node = h('Box', { border: 'round' }, h('Text', {}, 'Hello'));
    const output = renderToString(node, { width: 40 });
    // Round border uses ╭ and ╮
    expect(output).toContain('\u256D');
    expect(output).toContain('\u256E');
    expect(output).toContain('Hello');
  });

  it('defaults to 80 columns when no width specified', () => {
    const node = h('Text', {}, 'Default width');
    const output = renderToString(node);
    expect(output).toContain('Default width');
  });

  it('trims trailing empty rows', () => {
    const node = h('Text', {}, 'Only line');
    const output = renderToString(node, { width: 40, height: 10 });
    const lines = output.split('\n');
    // Should only have 1 line, not 10
    expect(lines.length).toBe(1);
  });

  it('renders combined bold and color styles', () => {
    const node = h('Text', { bold: true, color: 'red' }, 'Error');
    const output = renderToString(node, { width: 40 });
    // Combined SGR: bold (1) + red (31)
    expect(output).toContain('\x1b[1;31m');
    expect(stripAnsi(output)).toContain('Error');
  });

  it('renders Spacer between text in a row', () => {
    const node = h(
      'Box',
      { direction: 'row', width: 40 },
      h('Text', {}, 'Left'),
      h('Spacer', {}),
      h('Text', {}, 'Right'),
    );
    const output = renderToString(node, { width: 40 });
    const firstLine = output.split('\n')[0] ?? '';
    const leftIdx = firstLine.indexOf('Left');
    const rightIdx = firstLine.indexOf('Right');
    expect(leftIdx).toBe(0);
    expect(rightIdx).toBeGreaterThan(30);
  });

  it('returns empty string for null node', () => {
    const output = renderToString(null, { width: 40 });
    expect(output).toBe('');
  });
});
