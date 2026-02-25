import type { CellStyle } from './buffer/cell';
import { TerminalBuffer } from './buffer/terminal-buffer';
import { computeLayout } from './layout/compute';
import type { TuiNode } from './nodes/types';
import { RESET, styleToSGR } from './renderer/ansi';
import { paintTree, toLayoutTree } from './renderer/paint';

export interface RenderToStringOptions {
  /** Terminal width in columns. Defaults to 80. */
  width?: number;
  /** Terminal height in rows. Defaults to 24. */
  height?: number;
}

/**
 * Render a TUI component tree to an ANSI-formatted string.
 * No terminal or TTY required — works entirely in memory.
 */
export function renderToString(node: TuiNode, options: RenderToStringOptions = {}): string {
  const width = options.width ?? 80;
  const height = options.height ?? 24;

  // Convert TuiNode tree to LayoutNode tree
  const layoutRoot = toLayoutTree(node);

  // Compute layout
  computeLayout(layoutRoot, { maxWidth: width, maxHeight: height });

  // Paint into buffer
  const buffer = new TerminalBuffer(width, height);
  paintTree(buffer, layoutRoot, {}, height);

  // Serialize buffer to ANSI string (line by line, trimmed, no cursor positioning)
  return bufferToString(buffer);
}

/** Serialize a TerminalBuffer to an ANSI string with trailing whitespace trimmed. */
function bufferToString(buffer: TerminalBuffer): string {
  const lines: string[] = [];
  let lastNonEmptyRow = -1;

  // Find the last row with content
  for (let r = 0; r < buffer.height; r++) {
    const rowText = buffer.getRowText(r);
    if (rowText.trim()) {
      lastNonEmptyRow = r;
    }
  }

  // Render rows up to the last non-empty one
  for (let r = 0; r <= lastNonEmptyRow; r++) {
    lines.push(renderRow(buffer, r));
  }

  return lines.join('\n');
}

/** Render a single buffer row to an ANSI string with trailing spaces trimmed. */
function renderRow(buffer: TerminalBuffer, row: number): string {
  let output = '';
  let lastNonSpace = -1;

  // Find last non-space column
  for (let c = buffer.width - 1; c >= 0; c--) {
    const cell = buffer.get(row, c);
    if (cell && cell.char !== ' ') {
      lastNonSpace = c;
      break;
    }
    // Also consider styled spaces as content
    if (cell && hasStyle(cell.style)) {
      lastNonSpace = c;
      break;
    }
  }

  // Render cells up to last non-space
  for (let c = 0; c <= lastNonSpace; c++) {
    const cell = buffer.get(row, c);
    if (!cell) continue;
    const sgr = styleToSGR(cell.style);
    if (sgr) {
      output += `${sgr}${cell.char}${RESET}`;
    } else {
      output += cell.char;
    }
  }

  return output;
}

function hasStyle(style: CellStyle): boolean {
  return !!(
    style.color ||
    style.bgColor ||
    style.bold ||
    style.dim ||
    style.italic ||
    style.underline ||
    style.strikethrough
  );
}
