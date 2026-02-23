/** Parsed key event from terminal stdin. */
export interface KeyEvent {
  /** Key name: 'a', 'return', 'up', 'down', 'tab', 'escape', 'space', etc. */
  name: string;
  /** Printable character or empty string. */
  char: string;
  ctrl: boolean;
  shift: boolean;
  meta: boolean;
}

/** Parse raw stdin data into a KeyEvent. */
export function parseKey(data: Buffer): KeyEvent {
  const str = data.toString('utf8');
  const code = str.charCodeAt(0);

  // Escape sequences (must check before control characters)
  if (str.startsWith('\x1b')) {
    return parseEscapeSequence(str);
  }

  // Enter/Return (0x0D \r or 0x0A \n)
  if (str === '\r' || str === '\n') {
    return { name: 'return', char: '', ctrl: false, shift: false, meta: false };
  }

  // Tab (0x09)
  if (str === '\t') {
    return { name: 'tab', char: '', ctrl: false, shift: false, meta: false };
  }

  // Backspace (0x7F or 0x08)
  if (code === 0x7f || code === 0x08) {
    return { name: 'backspace', char: '', ctrl: false, shift: false, meta: false };
  }

  // Space
  if (str === ' ') {
    return { name: 'space', char: ' ', ctrl: false, shift: false, meta: false };
  }

  // Ctrl+letter (0x01-0x1A, excluding Tab=0x09, Enter=0x0D which are handled above)
  if (str.length === 1 && code >= 1 && code <= 26) {
    const letter = String.fromCharCode(code + 96);
    return { name: letter, char: '', ctrl: true, shift: false, meta: false };
  }

  // Regular printable character
  if (str.length === 1) {
    return { name: str, char: str, ctrl: false, shift: false, meta: false };
  }

  return { name: str, char: str, ctrl: false, shift: false, meta: false };
}

function parseEscapeSequence(str: string): KeyEvent {
  // Escape key alone
  if (str === '\x1b') {
    return { name: 'escape', char: '', ctrl: false, shift: false, meta: false };
  }

  // CSI sequences (ESC [ ...)
  if (str.startsWith('\x1b[')) {
    const seq = str.slice(2);

    switch (seq) {
      case 'A':
        return { name: 'up', char: '', ctrl: false, shift: false, meta: false };
      case 'B':
        return { name: 'down', char: '', ctrl: false, shift: false, meta: false };
      case 'C':
        return { name: 'right', char: '', ctrl: false, shift: false, meta: false };
      case 'D':
        return { name: 'left', char: '', ctrl: false, shift: false, meta: false };
      case 'H':
        return { name: 'home', char: '', ctrl: false, shift: false, meta: false };
      case 'F':
        return { name: 'end', char: '', ctrl: false, shift: false, meta: false };
      case '3~':
        return { name: 'delete', char: '', ctrl: false, shift: false, meta: false };
      case '5~':
        return { name: 'pageup', char: '', ctrl: false, shift: false, meta: false };
      case '6~':
        return { name: 'pagedown', char: '', ctrl: false, shift: false, meta: false };
      case 'Z':
        return { name: 'tab', char: '', ctrl: false, shift: true, meta: false };
      // Ctrl+arrow keys
      case '1;5A':
        return { name: 'up', char: '', ctrl: true, shift: false, meta: false };
      case '1;5B':
        return { name: 'down', char: '', ctrl: true, shift: false, meta: false };
      case '1;5C':
        return { name: 'right', char: '', ctrl: true, shift: false, meta: false };
      case '1;5D':
        return { name: 'left', char: '', ctrl: true, shift: false, meta: false };
    }
  }

  // Meta+letter (ESC + letter)
  if (str.length === 2 && str[1]) {
    return { name: str[1], char: str[1], ctrl: false, shift: false, meta: true };
  }

  return { name: str, char: '', ctrl: false, shift: false, meta: false };
}
