/**
 * Measure the display width of a string in terminal columns.
 * Strips ANSI escape codes and handles basic character widths.
 */
export function measureTextWidth(text: string): number {
  // Strip ANSI escape codes
  const stripped = stripAnsi(text);
  let width = 0;
  for (const char of stripped) {
    width += charWidth(char);
  }
  return width;
}

/** Strip ANSI escape sequences from a string. */
export function stripAnsi(text: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape code stripping
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

/** Get the display width of a single character. */
function charWidth(char: string): number {
  const code = char.codePointAt(0);
  if (code === undefined) return 0;

  // CJK Unified Ideographs and other full-width characters
  if (
    (code >= 0x1100 && code <= 0x115f) || // Hangul Jamo
    (code >= 0x2e80 && code <= 0x303e) || // CJK Radicals
    (code >= 0x3040 && code <= 0x33bf) || // Japanese
    (code >= 0x3400 && code <= 0x4dbf) || // CJK Extension A
    (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified
    (code >= 0xa960 && code <= 0xa97f) || // Hangul Jamo Extended-A
    (code >= 0xac00 && code <= 0xd7af) || // Hangul Syllables
    (code >= 0xf900 && code <= 0xfaff) || // CJK Compatibility
    (code >= 0xfe30 && code <= 0xfe6f) || // CJK Compatibility Forms
    (code >= 0xff01 && code <= 0xff60) || // Fullwidth Forms
    (code >= 0x20000 && code <= 0x2fffd) || // CJK Extension B+
    (code >= 0x30000 && code <= 0x3fffd) // CJK Extension G+
  ) {
    return 2;
  }

  return 1;
}

/**
 * Split text into lines, each fitting within maxWidth columns.
 * Simple truncation mode: no word wrapping, just clips at maxWidth.
 */
export function splitTextLines(text: string, maxWidth: number): string[] {
  if (maxWidth <= 0) return [''];
  const lines = text.split('\n');
  const result: string[] = [];
  for (const line of lines) {
    if (measureTextWidth(line) <= maxWidth) {
      result.push(line);
    } else {
      // Truncate
      let current = '';
      let currentWidth = 0;
      for (const char of line) {
        const w = charWidth(char);
        if (currentWidth + w > maxWidth) break;
        current += char;
        currentWidth += w;
      }
      result.push(current);
    }
  }
  return result;
}
