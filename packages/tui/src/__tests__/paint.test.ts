import { describe, expect, it } from 'vitest';
import { TerminalBuffer } from '../buffer/terminal-buffer';
import { jsx } from '../jsx-runtime/index';
import { computeLayout } from '../layout/compute';
import { BORDER_CHARS } from '../layout/types';
import type { TuiNode } from '../nodes/types';
import { collectText, paintTree, toLayoutTree } from '../renderer/paint';

function h(tag: string, props: Record<string, unknown>, ...children: unknown[]): TuiNode {
  return jsx(tag, { ...props, children: children.length === 1 ? children[0] : children });
}

function renderLayout(node: TuiNode, width = 40, height = 10): TerminalBuffer {
  const layout = toLayoutTree(node);
  computeLayout(layout, { maxWidth: width, maxHeight: height });
  const buffer = new TerminalBuffer(width, height);
  paintTree(buffer, layout, {}, height);
  return buffer;
}

describe('toLayoutTree', () => {
  it('converts null node to empty layout', () => {
    const layout = toLayoutTree(null);
    expect(layout.type).toBe('text');
    expect(layout.text).toBe('');
  });

  it('converts false to empty layout', () => {
    const layout = toLayoutTree(false);
    expect(layout.type).toBe('text');
    expect(layout.text).toBe('');
  });

  it('converts undefined to empty layout', () => {
    const layout = toLayoutTree(undefined);
    expect(layout.type).toBe('text');
    expect(layout.text).toBe('');
  });

  it('converts array of nodes to box with children', () => {
    const nodes: TuiNode[] = [h('Text', {}, 'A'), h('Text', {}, 'B')];
    const layout = toLayoutTree(nodes);
    expect(layout.type).toBe('box');
    expect(layout.children).toHaveLength(2);
  });

  it('converts TuiTextNode to text layout', () => {
    const textNode = {
      _tuiText: true,
      text: 'hello',
      style: {},
      box: { x: 0, y: 0, width: 0, height: 0 },
    };
    const layout = toLayoutTree(textNode as TuiNode);
    expect(layout.type).toBe('text');
    expect(layout.text).toBe('hello');
  });

  it('converts TuiConditionalNode with current to layout', () => {
    const textNode = h('Text', {}, 'visible');
    const conditional = { _tuiConditional: true, current: textNode, dirty: false };
    const layout = toLayoutTree(conditional as TuiNode);
    expect(layout.type).toBe('text');
    expect(layout.text).toBe('visible');
  });

  it('converts TuiConditionalNode without current to empty layout', () => {
    const conditional = { _tuiConditional: true, current: null, dirty: false };
    const layout = toLayoutTree(conditional as TuiNode);
    expect(layout.type).toBe('text');
    expect(layout.text).toBe('');
  });

  it('converts TuiListNode to box with items', () => {
    const items = [h('Text', {}, 'item1'), h('Text', {}, 'item2')];
    const listNode = { _tuiList: true, items, dirty: false };
    const layout = toLayoutTree(listNode as TuiNode);
    expect(layout.type).toBe('box');
    expect(layout.children).toHaveLength(2);
  });

  it('converts Spacer element to text layout with grow', () => {
    const spacer = h('Spacer', {});
    const layout = toLayoutTree(spacer);
    expect(layout.type).toBe('text');
    expect(layout.props.grow).toBe(1);
    expect(layout.text).toBe('');
  });

  it('converts Text element with style', () => {
    const node = h('Text', { bold: true, color: 'red' }, 'styled');
    const layout = toLayoutTree(node);
    expect(layout.type).toBe('text');
    expect(layout.text).toBe('styled');
    expect(layout.style?.bold).toBe(true);
    expect(layout.style?.color).toBe('red');
  });

  it('converts Box element with children', () => {
    const node = h('Box', { direction: 'row' }, h('Text', {}, 'A'), h('Text', {}, 'B'));
    const layout = toLayoutTree(node);
    expect(layout.type).toBe('box');
    expect(layout.children).toHaveLength(2);
  });

  it('falls back to string conversion for unknown values', () => {
    const layout = toLayoutTree(42 as unknown as TuiNode);
    expect(layout.type).toBe('text');
    expect(layout.text).toBe('42');
  });
});

describe('collectText', () => {
  it('collects text from text nodes', () => {
    const children = [
      { _tuiText: true, text: 'hello ', style: {}, box: { x: 0, y: 0, width: 0, height: 0 } },
      { _tuiText: true, text: 'world', style: {}, box: { x: 0, y: 0, width: 0, height: 0 } },
    ];
    expect(collectText(children as TuiNode[])).toBe('hello world');
  });

  it('skips null and false children', () => {
    const children = [
      null,
      { _tuiText: true, text: 'ok', style: {}, box: { x: 0, y: 0, width: 0, height: 0 } },
      false,
    ];
    expect(collectText(children as TuiNode[])).toBe('ok');
  });

  it('flattens nested arrays', () => {
    const children = [
      [{ _tuiText: true, text: 'nested', style: {}, box: { x: 0, y: 0, width: 0, height: 0 } }],
    ];
    expect(collectText(children as TuiNode[])).toBe('nested');
  });

  it('handles conditional nodes', () => {
    const textEl = h('Text', {}, 'conditional');
    const conditional = { _tuiConditional: true, current: textEl, dirty: false };
    expect(collectText([conditional] as TuiNode[])).toBe('conditional');
  });

  it('handles list nodes', () => {
    const items = [h('Text', {}, 'a'), h('Text', {}, 'b')];
    const listNode = { _tuiList: true, items, dirty: false };
    expect(collectText([listNode] as TuiNode[])).toBe('ab');
  });

  it('converts non-node values to string', () => {
    expect(collectText([99 as unknown as TuiNode])).toBe('99');
  });

  it('recurses into TuiElement children', () => {
    const el = h('Text', {}, 'inner');
    expect(collectText([el])).toBe('inner');
  });
});

describe('paintTree', () => {
  it('paints text into the buffer', () => {
    const buffer = renderLayout(h('Text', {}, 'Hello'));
    const row = buffer.getRowText(0);
    expect(row).toContain('Hello');
  });

  it('skips empty text', () => {
    const buffer = renderLayout(h('Text', {}, ''));
    const row = buffer.getRowText(0);
    expect(row.trim()).toBe('');
  });

  it('paints text with style', () => {
    const buffer = renderLayout(h('Text', { bold: true }, 'Bold'));
    const cell = buffer.get(0, 0);
    expect(cell?.char).toBe('B');
    expect(cell?.style.bold).toBe(true);
  });

  it('paints border around Box', () => {
    const buffer = renderLayout(h('Box', { border: 'single' }, h('Text', {}, 'Hi')));
    const topLeft = buffer.get(0, 0);
    expect(topLeft?.char).toBe(BORDER_CHARS.single.topLeft);
  });

  it('paints round border characters', () => {
    const buffer = renderLayout(h('Box', { border: 'round' }, h('Text', {}, 'X')));
    const topLeft = buffer.get(0, 0);
    expect(topLeft?.char).toBe(BORDER_CHARS.round.topLeft);
  });

  it('paints column children on separate rows', () => {
    const buffer = renderLayout(
      h('Box', { direction: 'column' }, h('Text', {}, 'Line1'), h('Text', {}, 'Line2')),
    );
    expect(buffer.getRowText(0)).toContain('Line1');
    expect(buffer.getRowText(1)).toContain('Line2');
  });

  it('paints row children on the same row', () => {
    const buffer = renderLayout(
      h('Box', { direction: 'row' }, h('Text', {}, 'AB'), h('Text', {}, 'CD')),
    );
    const row = buffer.getRowText(0);
    expect(row).toContain('AB');
    expect(row).toContain('CD');
  });

  it('respects maxRows — does not paint below limit', () => {
    const layout = toLayoutTree(
      h('Box', { direction: 'column' }, h('Text', {}, 'Row1'), h('Text', {}, 'Row2')),
    );
    computeLayout(layout, { maxWidth: 40, maxHeight: 10 });
    const buffer = new TerminalBuffer(40, 1);
    paintTree(buffer, layout, {}, 1);
    expect(buffer.getRowText(0)).toContain('Row1');
    // Row2 should not be painted (maxRows = 1)
  });

  it('paints border with height > 1', () => {
    const buffer = renderLayout(
      h('Box', { border: 'single' }, h('Text', {}, 'Line A'), h('Text', {}, 'Line B')),
      40,
      10,
    );
    // Bottom-left corner
    const bottomRow = 3; // top border + 2 text lines = row 3 for bottom border
    const bottomLeft = buffer.get(bottomRow, 0);
    expect(bottomLeft?.char).toBe(BORDER_CHARS.single.bottomLeft);
  });

  it('paints vertical border sides', () => {
    const buffer = renderLayout(h('Box', { border: 'single' }, h('Text', {}, 'Content')), 40, 10);
    // Left vertical on row 1 (between top and bottom borders)
    const leftSide = buffer.get(1, 0);
    expect(leftSide?.char).toBe(BORDER_CHARS.single.vertical);
  });
});
