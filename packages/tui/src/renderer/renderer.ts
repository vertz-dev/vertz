import { TerminalBuffer } from '../buffer/terminal-buffer';
import { computeLayout } from '../layout/compute';
import type { TuiNode } from '../nodes/types';
import { renderRegions } from './ansi';
import type { OutputAdapter } from './output-adapter';
import { paintTree, toLayoutTree } from './paint';

/**
 * Core TUI renderer.
 * Converts a TuiNode tree → LayoutNode tree → CellBuffer → diff → ANSI output.
 * Supports both old-style snapshot trees and new persistent TuiElement trees.
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
    const layoutRoot = toLayoutTree(rootNode);

    // Compute layout
    computeLayout(layoutRoot, {
      maxWidth: this._adapter.columns,
      maxHeight: this._adapter.rows,
    });

    // Paint into buffer
    paintTree(this._current, layoutRoot, {}, this._adapter.rows);

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
}
