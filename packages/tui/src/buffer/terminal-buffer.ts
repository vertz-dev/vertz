import { type Cell, type CellStyle, cellsEqual, emptyCell } from './cell';

/** A region of cells that changed between two buffers. */
export interface DirtyRegion {
  row: number;
  col: number;
  cells: Cell[];
}

/**
 * 2D grid of cells representing the terminal screen.
 * Double-buffered: write to current, diff against previous.
 */
export class TerminalBuffer {
  readonly width: number;
  readonly height: number;
  private _cells: Cell[][];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this._cells = TerminalBuffer._createGrid(width, height);
  }

  private static _createGrid(width: number, height: number): Cell[][] {
    const grid: Cell[][] = [];
    for (let r = 0; r < height; r++) {
      const row: Cell[] = [];
      for (let c = 0; c < width; c++) {
        row.push(emptyCell());
      }
      grid.push(row);
    }
    return grid;
  }

  /** Get a cell at the given position. Returns undefined if out of bounds. */
  get(row: number, col: number): Cell | undefined {
    return this._cells[row]?.[col];
  }

  /** Set a cell at the given position. No-op if out of bounds. */
  set(row: number, col: number, char: string, style: CellStyle): void {
    const cellRow = this._cells[row];
    if (!cellRow || col < 0 || col >= this.width) return;
    cellRow[col] = { char, width: 1, style };
  }

  /** Write a string starting at the given position. */
  writeString(row: number, col: number, text: string, style: CellStyle): void {
    for (let i = 0; i < text.length; i++) {
      const c = col + i;
      if (c >= this.width) break;
      const ch = text[i];
      if (ch !== undefined) this.set(row, c, ch, style);
    }
  }

  /** Fill the entire buffer with empty cells. */
  clear(): void {
    this._cells = TerminalBuffer._createGrid(this.width, this.height);
  }

  /**
   * Diff this buffer against another, returning regions that differ.
   * Each dirty region is a contiguous run of changed cells on one row.
   */
  diff(previous: TerminalBuffer): DirtyRegion[] {
    const regions: DirtyRegion[] = [];
    const maxRows = Math.min(this.height, previous.height);
    const maxCols = Math.min(this.width, previous.width);

    for (let r = 0; r < maxRows; r++) {
      let regionStart = -1;
      let regionCells: Cell[] = [];

      for (let c = 0; c < maxCols; c++) {
        const curr = this._cells[r]?.[c];
        const prev = previous._cells[r]?.[c];
        if (!curr || !prev) continue;

        if (!cellsEqual(curr, prev)) {
          if (regionStart === -1) {
            regionStart = c;
            regionCells = [];
          }
          regionCells.push(curr);
        } else if (regionStart !== -1) {
          regions.push({ row: r, col: regionStart, cells: regionCells });
          regionStart = -1;
        }
      }

      if (regionStart !== -1) {
        regions.push({ row: r, col: regionStart, cells: regionCells });
      }
    }

    return regions;
  }

  /** Create a deep copy of this buffer. */
  clone(): TerminalBuffer {
    const copy = new TerminalBuffer(this.width, this.height);
    for (let r = 0; r < this.height; r++) {
      for (let c = 0; c < this.width; c++) {
        const cell = this._cells[r]?.[c];
        if (cell) copy.set(r, c, cell.char, { ...cell.style });
      }
    }
    return copy;
  }

  /** Get the text content of a specific row (no styling). */
  getRowText(row: number): string {
    const cellRow = this._cells[row];
    if (!cellRow) return '';
    return cellRow.map((c) => c.char).join('');
  }

  /** Get all text content (no styling), rows joined by newlines. */
  getText(): string {
    const lines: string[] = [];
    for (let r = 0; r < this.height; r++) {
      lines.push(this.getRowText(r));
    }
    return lines.join('\n');
  }
}
