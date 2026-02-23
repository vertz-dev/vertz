import { TerminalBuffer } from '../buffer/terminal-buffer';
import type { OutputAdapter } from '../renderer/output-adapter';

/**
 * Test output adapter that captures rendered output for assertions.
 * Instead of writing to stdout, maintains a TerminalBuffer that can be inspected.
 */
export class TestAdapter implements OutputAdapter {
  readonly columns: number;
  readonly rows: number;
  /** The current terminal buffer (public for test inspection). */
  buffer: TerminalBuffer;
  /** Raw ANSI output captured from write calls. */
  rawOutput: string[] = [];

  constructor(columns: number = 80, rows: number = 24) {
    this.columns = columns;
    this.rows = rows;
    this.buffer = new TerminalBuffer(columns, rows);
  }

  write(data: string): void {
    this.rawOutput.push(data);
  }

  /** Get the text content of a specific row. */
  textAt(row: number): string {
    return this.buffer.getRowText(row);
  }

  /** Get all text content, rows joined by newlines. */
  text(): string {
    return this.buffer.getText();
  }

  /** Reset captured output. */
  reset(): void {
    this.rawOutput = [];
    this.buffer = new TerminalBuffer(this.columns, this.rows);
  }
}
