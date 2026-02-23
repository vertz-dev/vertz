import { describe, expect, it } from 'vitest';
import { computeLayout } from '../layout/compute';
import { measureTextWidth, splitTextLines, stripAnsi } from '../layout/measure';
import type { LayoutNode } from '../layout/types';
import { defaultLayoutProps } from '../layout/types';

function textNode(text: string, overrides?: Partial<LayoutNode['props']>): LayoutNode {
  return {
    type: 'text',
    props: { ...defaultLayoutProps(), ...overrides },
    text,
    children: [],
    box: { x: 0, y: 0, width: 0, height: 0 },
  };
}

function boxNode(children: LayoutNode[], overrides?: Partial<LayoutNode['props']>): LayoutNode {
  return {
    type: 'box',
    props: { ...defaultLayoutProps(), ...overrides },
    children,
    box: { x: 0, y: 0, width: 0, height: 0 },
  };
}

describe('measureTextWidth', () => {
  it('measures ASCII text', () => {
    expect(measureTextWidth('Hello')).toBe(5);
  });

  it('measures empty string', () => {
    expect(measureTextWidth('')).toBe(0);
  });

  it('strips ANSI codes from measurement', () => {
    expect(measureTextWidth('\x1b[31mHello\x1b[0m')).toBe(5);
  });
});

describe('stripAnsi', () => {
  it('removes ANSI escape codes', () => {
    expect(stripAnsi('\x1b[1;31mBold Red\x1b[0m')).toBe('Bold Red');
  });

  it('returns plain text unchanged', () => {
    expect(stripAnsi('Hello')).toBe('Hello');
  });
});

describe('splitTextLines', () => {
  it('returns single line for short text', () => {
    expect(splitTextLines('Hello', 10)).toEqual(['Hello']);
  });

  it('truncates text that exceeds maxWidth', () => {
    const lines = splitTextLines('Hello World', 5);
    expect(lines[0]).toBe('Hello');
  });

  it('splits on newlines', () => {
    expect(splitTextLines('Line1\nLine2', 10)).toEqual(['Line1', 'Line2']);
  });
});

describe('computeLayout', () => {
  it('lays out a single text node', () => {
    const node = textNode('Hello');
    computeLayout(node, { maxWidth: 40, maxHeight: 10 });
    expect(node.box.width).toBe(5);
    expect(node.box.height).toBe(1);
    expect(node.box.x).toBe(0);
    expect(node.box.y).toBe(0);
  });

  it('respects explicit width on text node', () => {
    const node = textNode('Hi', { width: 20 });
    computeLayout(node, { maxWidth: 40, maxHeight: 10 });
    expect(node.box.width).toBe(20);
  });

  it('respects full width', () => {
    const node = textNode('Hi', { width: 'full' });
    computeLayout(node, { maxWidth: 40, maxHeight: 10 });
    expect(node.box.width).toBe(40);
  });

  it('lays out column direction children', () => {
    const root = boxNode([textNode('Line1'), textNode('Line2')], { direction: 'column' });
    computeLayout(root, { maxWidth: 40, maxHeight: 10 });

    expect(root.children[0]?.box.y).toBe(0);
    expect(root.children[1]?.box.y).toBe(1);
  });

  it('lays out row direction children', () => {
    const root = boxNode([textNode('AB'), textNode('CD')], { direction: 'row' });
    computeLayout(root, { maxWidth: 40, maxHeight: 10 });

    expect(root.children[0]?.box.x).toBe(0);
    expect(root.children[1]?.box.x).toBe(2);
  });

  it('applies gap between children', () => {
    const root = boxNode([textNode('A'), textNode('B')], { direction: 'column', gap: 2 });
    computeLayout(root, { maxWidth: 40, maxHeight: 10 });

    expect(root.children[0]?.box.y).toBe(0);
    expect(root.children[1]?.box.y).toBe(3); // 1 (height of A) + 2 (gap)
  });

  it('applies padding', () => {
    const root = boxNode([textNode('Hi')], { padding: 1 });
    computeLayout(root, { maxWidth: 40, maxHeight: 10 });

    expect(root.children[0]?.box.x).toBe(1);
    expect(root.children[0]?.box.y).toBe(1);
    expect(root.box.width).toBe(4); // 2 (text) + 2 (padding)
    expect(root.box.height).toBe(3); // 1 (text) + 2 (padding)
  });

  it('applies paddingX and paddingY separately', () => {
    const root = boxNode([textNode('Hi')], { paddingX: 2, paddingY: 1 });
    computeLayout(root, { maxWidth: 40, maxHeight: 10 });

    expect(root.children[0]?.box.x).toBe(2);
    expect(root.children[0]?.box.y).toBe(1);
    expect(root.box.width).toBe(6); // 2 (text) + 4 (padX)
    expect(root.box.height).toBe(3); // 1 (text) + 2 (padY)
  });

  it('handles grow in row direction', () => {
    const child1 = textNode('A');
    const spacer = textNode('', { grow: 1 });
    const child2 = textNode('B');
    const root = boxNode([child1, spacer, child2], { direction: 'row', width: 20 });

    computeLayout(root, { maxWidth: 20, maxHeight: 10 });

    expect(child1.box.x).toBe(0);
    // Spacer should fill remaining space: 20 - 1 (A) - 1 (B) = 18
    expect(spacer.box.width).toBe(18);
    expect(child2.box.x).toBe(19); // 1 + 18
  });

  it('handles border insets', () => {
    const root = boxNode([textNode('Hi')], { border: 'single' });
    computeLayout(root, { maxWidth: 40, maxHeight: 10 });

    // Border adds 1 on each side
    expect(root.children[0]?.box.x).toBe(1);
    expect(root.children[0]?.box.y).toBe(1);
    expect(root.box.width).toBe(4); // 2 (text) + 2 (border)
    expect(root.box.height).toBe(3); // 1 (text) + 2 (border)
  });

  it('centers children with align center', () => {
    const root = boxNode([textNode('Hi')], { direction: 'column', width: 20, align: 'center' });
    computeLayout(root, { maxWidth: 20, maxHeight: 10 });

    // "Hi" is 2 chars, container is 20. Center offset = (20-2)/2 = 9
    expect(root.children[0]?.box.x).toBe(9);
  });

  it('end-aligns children', () => {
    const root = boxNode([textNode('Hi')], { direction: 'column', width: 20, align: 'end' });
    computeLayout(root, { maxWidth: 20, maxHeight: 10 });

    expect(root.children[0]?.box.x).toBe(18); // 20 - 2
  });

  it('constrains width to maxWidth', () => {
    const node = textNode('Hello World This Is Long Text', { width: 100 });
    computeLayout(node, { maxWidth: 20, maxHeight: 10 });
    expect(node.box.width).toBe(20);
  });
});
