import type { Cell, CellStyle } from '../buffer/cell';
import type { DirtyRegion } from '../buffer/terminal-buffer';

// Named ANSI color codes (foreground)
const FG_COLORS: Record<string, string> = {
  black: '30',
  red: '31',
  green: '32',
  yellow: '33',
  blue: '34',
  magenta: '35',
  cyan: '36',
  white: '37',
  gray: '90',
  redBright: '91',
  greenBright: '92',
  yellowBright: '93',
  blueBright: '94',
  magentaBright: '95',
  cyanBright: '96',
  whiteBright: '97',
};

// Named ANSI color codes (background)
const BG_COLORS: Record<string, string> = {
  black: '40',
  red: '41',
  green: '42',
  yellow: '43',
  blue: '44',
  magenta: '45',
  cyan: '46',
  white: '47',
  gray: '100',
  redBright: '101',
  greenBright: '102',
  yellowBright: '103',
  blueBright: '104',
  magentaBright: '105',
  cyanBright: '106',
  whiteBright: '107',
};

/** Convert a hex color string to an ANSI 24-bit color escape code. */
function hexToAnsi(hex: string, isBg: boolean): string {
  const clean = hex.replace('#', '');
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  return `${isBg ? '48' : '38'};2;${r};${g};${b}`;
}

/** Convert a CellStyle to ANSI SGR (Select Graphic Rendition) codes. */
export function styleToSGR(style: CellStyle): string {
  const codes: string[] = [];

  if (style.bold) codes.push('1');
  if (style.dim) codes.push('2');
  if (style.italic) codes.push('3');
  if (style.underline) codes.push('4');
  if (style.strikethrough) codes.push('9');

  if (style.color) {
    if (style.color.startsWith('#')) {
      codes.push(hexToAnsi(style.color, false));
    } else {
      const code = FG_COLORS[style.color];
      if (code) codes.push(code);
    }
  }

  if (style.bgColor) {
    if (style.bgColor.startsWith('#')) {
      codes.push(hexToAnsi(style.bgColor, true));
    } else {
      const code = BG_COLORS[style.bgColor];
      if (code) codes.push(code);
    }
  }

  if (codes.length === 0) return '';
  return `\x1b[${codes.join(';')}m`;
}

/** ANSI escape: move cursor to row, col (1-indexed). */
export function cursorTo(row: number, col: number): string {
  return `\x1b[${row + 1};${col + 1}H`;
}

/** ANSI escape: reset all attributes. */
export const RESET = '\x1b[0m';

/** ANSI escape: hide cursor. */
export const HIDE_CURSOR = '\x1b[?25l';

/** ANSI escape: show cursor. */
export const SHOW_CURSOR = '\x1b[?25h';

/** ANSI escape: clear entire screen. */
export const CLEAR_SCREEN = '\x1b[2J';

/** ANSI escape: switch to alternate screen buffer. */
export const ALT_BUFFER_ON = '\x1b[?1049h';

/** ANSI escape: switch back from alternate screen buffer. */
export const ALT_BUFFER_OFF = '\x1b[?1049l';

/** ANSI escape: move cursor to top-left. */
export const CURSOR_HOME = '\x1b[H';

/** Render a single cell to ANSI escape codes. */
function renderCell(cell: Cell): string {
  const sgr = styleToSGR(cell.style);
  if (sgr) {
    return `${sgr}${cell.char}${RESET}`;
  }
  return cell.char;
}

/** Render dirty regions to a single ANSI string. */
export function renderRegions(regions: DirtyRegion[]): string {
  let output = '';
  for (const region of regions) {
    output += cursorTo(region.row, region.col);
    for (const cell of region.cells) {
      output += renderCell(cell);
    }
  }
  return output;
}
