import type { CellStyle } from '../buffer/cell';
import { TerminalBuffer } from '../buffer/terminal-buffer';
import { computeLayout } from '../layout/compute';
import { splitTextLines } from '../layout/measure';
import { BORDER_CHARS, defaultLayoutProps, type LayoutNode } from '../layout/types';
import type { TuiElement, TuiNode, TuiTextNode } from '../nodes/types';
import { isTuiElement, isTuiTextNode } from '../nodes/types';
import { renderRegions } from './ansi';
import type { OutputAdapter } from './output-adapter';

/**
 * Core TUI renderer.
 * Converts a TuiNode tree → LayoutNode tree → CellBuffer → diff → ANSI output.
 */
export class TuiRenderer {
  private _adapter: OutputAdapter;
  private _current: TerminalBuffer;
  private _previous: TerminalBuffer;

  constructor(adapter: OutputAdapter) {
    this._adapter = adapter;
    this._current = new TerminalBuffer(adapter.columns, adapter.rows);
    this._previous = new TerminalBuffer(adapter.columns, adapter.rows);
  }

  /** Render a TuiNode tree to the output. */
  render(rootNode: TuiNode): void {
    // Clear current buffer
    this._current.clear();

    // Convert TuiNode tree to LayoutNode tree
    const layoutRoot = this._toLayoutTree(rootNode);

    // Compute layout
    computeLayout(layoutRoot, {
      maxWidth: this._adapter.columns,
      maxHeight: this._adapter.rows,
    });

    // Paint into buffer
    this._paint(layoutRoot, {});

    // Diff against previous and write ANSI
    const regions = this._current.diff(this._previous);
    if (regions.length > 0) {
      const ansi = renderRegions(regions);
      this._adapter.write(ansi);
    }

    // Swap buffers
    this._previous = this._current.clone();
  }

  /** Get the current buffer (for testing). */
  getBuffer(): TerminalBuffer {
    return this._current;
  }

  /** Convert a TuiNode tree to a LayoutNode tree. */
  private _toLayoutTree(node: TuiNode): LayoutNode {
    if (node == null || node === false) {
      return this._emptyLayoutNode();
    }

    if (Array.isArray(node)) {
      // Array of nodes — wrap in a column box
      return {
        type: 'box',
        props: defaultLayoutProps(),
        children: node.map((n) => this._toLayoutTree(n)),
        box: { x: 0, y: 0, width: 0, height: 0 },
      };
    }

    if (isTuiTextNode(node)) {
      return this._textToLayout(node);
    }

    if (isTuiElement(node)) {
      return this._elementToLayout(node);
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

  private _textToLayout(node: TuiTextNode): LayoutNode {
    return {
      type: 'text',
      props: defaultLayoutProps(),
      text: node.text,
      children: [],
      box: { x: 0, y: 0, width: 0, height: 0 },
    };
  }

  private _elementToLayout(node: TuiElement): LayoutNode {
    const { tag } = node;

    // Spacer: set grow=1
    if (tag === 'Spacer') {
      const props = { ...defaultLayoutProps(), grow: 1 };
      return {
        type: 'text',
        props,
        text: '',
        children: [],
        box: { x: 0, y: 0, width: 0, height: 0 },
      };
    }

    // Text element: collect text content from children
    if (tag === 'Text') {
      const text = this._collectText(node.children);
      return {
        type: 'text',
        props: { ...defaultLayoutProps(), ...this._extractLayoutProps(node) },
        text,
        children: [],
        box: { x: 0, y: 0, width: 0, height: 0 },
      };
    }

    // Box element: recurse children
    const layoutChildren = node.children.map((child) => this._toLayoutTree(child));
    return {
      type: 'box',
      props: { ...defaultLayoutProps(), ...this._extractLayoutProps(node) },
      children: layoutChildren,
      box: { x: 0, y: 0, width: 0, height: 0 },
    };
  }

  /** Extract layout-relevant props from a TuiElement. */
  private _extractLayoutProps(node: TuiElement): Partial<ReturnType<typeof defaultLayoutProps>> {
    return node.layoutProps;
  }

  /** Collect text content from children, flattening nested Text elements. */
  private _collectText(children: TuiNode[]): string {
    let text = '';
    for (const child of children) {
      if (child == null || child === false) continue;
      if (Array.isArray(child)) {
        text += this._collectText(child);
      } else if (isTuiTextNode(child)) {
        text += child.text;
      } else if (isTuiElement(child)) {
        // Nested Text element — collect its children recursively
        text += this._collectText(child.children);
      } else {
        text += String(child);
      }
    }
    return text;
  }

  /** Paint a layout node into the cell buffer. */
  private _paint(node: LayoutNode, inheritedStyle: CellStyle): void {
    if (node.type === 'text') {
      this._paintText(node, inheritedStyle);
      return;
    }

    // Paint border if present
    if (node.props.border !== 'none') {
      this._paintBorder(node);
    }

    // Paint children
    for (const child of node.children) {
      this._paint(child, inheritedStyle);
    }
  }

  /** Paint text content into the buffer. */
  private _paintText(node: LayoutNode, inheritedStyle: CellStyle): void {
    const text = node.text ?? '';
    if (!text) return;

    const lines = splitTextLines(text, node.box.width);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line === undefined) continue;
      const row = node.box.y + i;
      if (row >= this._adapter.rows) break;
      this._current.writeString(row, node.box.x, line, inheritedStyle);
    }
  }

  /** Paint border around a node. */
  private _paintBorder(node: LayoutNode): void {
    const borderStyle = node.props.border;
    if (borderStyle === 'none') return;

    const chars = BORDER_CHARS[borderStyle];
    if (!chars) return;

    const { x, y, width, height } = node.box;
    const style: CellStyle = {};

    // Top border
    this._current.set(y, x, chars.topLeft, style);
    for (let c = 1; c < width - 1; c++) {
      this._current.set(y, x + c, chars.horizontal, style);
    }
    if (width > 1) this._current.set(y, x + width - 1, chars.topRight, style);

    // Bottom border
    if (height > 1) {
      this._current.set(y + height - 1, x, chars.bottomLeft, style);
      for (let c = 1; c < width - 1; c++) {
        this._current.set(y + height - 1, x + c, chars.horizontal, style);
      }
      if (width > 1) {
        this._current.set(y + height - 1, x + width - 1, chars.bottomRight, style);
      }
    }

    // Side borders
    for (let r = 1; r < height - 1; r++) {
      this._current.set(y + r, x, chars.vertical, style);
      if (width > 1) this._current.set(y + r, x + width - 1, chars.vertical, style);
    }
  }

  private _emptyLayoutNode(): LayoutNode {
    return {
      type: 'text',
      props: defaultLayoutProps(),
      text: '',
      children: [],
      box: { x: 0, y: 0, width: 0, height: 0 },
    };
  }
}
