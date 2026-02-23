/** Style attributes for a single terminal cell. */
export interface CellStyle {
  color?: string;
  bgColor?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
}

/** A single terminal cell: one character with style. */
export interface Cell {
  char: string;
  width: number;
  style: CellStyle;
}

/** Create an empty cell (space with no style). */
export function emptyCell(): Cell {
  return { char: ' ', width: 1, style: {} };
}

/** Check if two cell styles are equal. */
export function stylesEqual(a: CellStyle, b: CellStyle): boolean {
  return (
    a.color === b.color &&
    a.bgColor === b.bgColor &&
    a.bold === b.bold &&
    a.dim === b.dim &&
    a.italic === b.italic &&
    a.underline === b.underline &&
    a.strikethrough === b.strikethrough
  );
}

/** Check if two cells are equal. */
export function cellsEqual(a: Cell, b: Cell): boolean {
  return a.char === b.char && a.width === b.width && stylesEqual(a.style, b.style);
}
