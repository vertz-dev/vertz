import type { CellStyle } from '../buffer/cell';
import type { TerminalBuffer } from '../buffer/terminal-buffer';
import { splitTextLines } from '../layout/measure';
import { BORDER_CHARS, defaultLayoutProps, type LayoutNode } from '../layout/types';
import type { TuiElement, TuiNode, TuiTextNode } from '../nodes/types';
import { isTuiElement, isTuiTextNode } from '../nodes/types';
import {
  isTuiTextNode as isPersistentTextNode,
  isTuiConditionalNode,
  isTuiListNode,
} from '../tui-element';

// --- Layout tree conversion ---

/** Convert a TuiNode tree to a LayoutNode tree for layout computation. */
export function toLayoutTree(node: TuiNode): LayoutNode {
  if (node == null || node === false) {
    return emptyLayoutNode();
  }

  if (Array.isArray(node)) {
    return {
      type: 'box',
      props: defaultLayoutProps(),
      children: node.map((n) => toLayoutTree(n)),
      box: { x: 0, y: 0, width: 0, height: 0 },
    };
  }

  if (isTuiTextNode(node)) {
    return textToLayout(node);
  }

  if (isTuiConditionalNode(node)) {
    if (node.current) {
      return toLayoutTree(node.current as TuiNode);
    }
    return emptyLayoutNode();
  }

  if (isTuiListNode(node)) {
    return {
      type: 'box',
      props: defaultLayoutProps(),
      children: node.items.map((item) => toLayoutTree(item as TuiNode)),
      box: { x: 0, y: 0, width: 0, height: 0 },
    };
  }

  if (isTuiElement(node)) {
    return elementToLayout(node);
  }

  // Fallback: treat as string
  return {
    type: 'text',
    props: defaultLayoutProps(),
    text: String(node),
    children: [],
    box: { x: 0, y: 0, width: 0, height: 0 },
  };
}

function textToLayout(node: TuiTextNode): LayoutNode {
  return {
    type: 'text',
    props: defaultLayoutProps(),
    text: node.text,
    children: [],
    box: { x: 0, y: 0, width: 0, height: 0 },
  };
}

function elementToLayout(node: TuiElement): LayoutNode {
  const { tag } = node;

  if (tag === 'Spacer') {
    return {
      type: 'text',
      props: { ...defaultLayoutProps(), grow: 1 },
      text: '',
      children: [],
      box: { x: 0, y: 0, width: 0, height: 0 },
    };
  }

  if (tag === 'Text') {
    const text = collectText(node.children);
    return {
      type: 'text',
      props: { ...defaultLayoutProps(), ...node.layoutProps },
      style: node.style,
      text,
      children: [],
      box: { x: 0, y: 0, width: 0, height: 0 },
    };
  }

  const layoutChildren = node.children.map((child) => toLayoutTree(child as TuiNode));
  return {
    type: 'box',
    props: { ...defaultLayoutProps(), ...node.layoutProps },
    children: layoutChildren,
    box: { x: 0, y: 0, width: 0, height: 0 },
  };
}

/** Collect text content from children, flattening nested Text elements. */
export function collectText(children: TuiNode[]): string {
  let text = '';
  for (const child of children) {
    if (child == null || child === false) continue;
    if (Array.isArray(child)) {
      text += collectText(child);
    } else if (isTuiTextNode(child) || isPersistentTextNode(child)) {
      text += child.text;
    } else if (isTuiConditionalNode(child)) {
      if (child.current) {
        text += collectText([child.current as TuiNode]);
      }
    } else if (isTuiListNode(child)) {
      text += collectText(child.items as TuiNode[]);
    } else if (isTuiElement(child)) {
      text += collectText(child.children);
    } else {
      text += String(child);
    }
  }
  return text;
}

function emptyLayoutNode(): LayoutNode {
  return {
    type: 'text',
    props: defaultLayoutProps(),
    text: '',
    children: [],
    box: { x: 0, y: 0, width: 0, height: 0 },
  };
}

// --- Paint ---

/** Paint a layout tree into a TerminalBuffer. */
export function paintTree(
  buffer: TerminalBuffer,
  node: LayoutNode,
  inheritedStyle: CellStyle,
  maxRows: number,
): void {
  if (node.type === 'text') {
    paintText(buffer, node, node.style ?? inheritedStyle, maxRows);
    return;
  }

  if (node.props.border !== 'none') {
    paintBorder(buffer, node);
  }

  for (const child of node.children) {
    paintTree(buffer, child, inheritedStyle, maxRows);
  }
}

function paintText(
  buffer: TerminalBuffer,
  node: LayoutNode,
  style: CellStyle,
  maxRows: number,
): void {
  const text = node.text ?? '';
  if (!text) return;

  const lines = splitTextLines(text, node.box.width);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const row = node.box.y + i;
    if (row >= maxRows) break;
    buffer.writeString(row, node.box.x, line, style);
  }
}

function paintBorder(buffer: TerminalBuffer, node: LayoutNode): void {
  const borderStyle = node.props.border;
  if (borderStyle === 'none') return;

  const chars = BORDER_CHARS[borderStyle];
  if (!chars) return;

  const { x, y, width, height } = node.box;
  const style: CellStyle = {};

  buffer.set(y, x, chars.topLeft, style);
  for (let c = 1; c < width - 1; c++) {
    buffer.set(y, x + c, chars.horizontal, style);
  }
  if (width > 1) buffer.set(y, x + width - 1, chars.topRight, style);

  if (height > 1) {
    buffer.set(y + height - 1, x, chars.bottomLeft, style);
    for (let c = 1; c < width - 1; c++) {
      buffer.set(y + height - 1, x + c, chars.horizontal, style);
    }
    if (width > 1) {
      buffer.set(y + height - 1, x + width - 1, chars.bottomRight, style);
    }
  }

  for (let r = 1; r < height - 1; r++) {
    buffer.set(y + r, x, chars.vertical, style);
    if (width > 1) buffer.set(y + r, x + width - 1, chars.vertical, style);
  }
}
