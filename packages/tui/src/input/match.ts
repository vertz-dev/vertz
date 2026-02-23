import type { KeyEvent } from './key-parser';

/** Maps key patterns (e.g. 'up', 'ctrl+c', 'shift+tab') to handler functions. */
export type KeyMap = Record<string, (key: KeyEvent) => void>;

interface ParsedPattern {
  name: string;
  ctrl: boolean;
  shift: boolean;
  meta: boolean;
}

function parsePattern(pattern: string): ParsedPattern {
  const parts = pattern.split('+');
  const name = parts[parts.length - 1] ?? pattern;
  let ctrl = false;
  let shift = false;
  let meta = false;

  for (let i = 0; i < parts.length - 1; i++) {
    const modifier = parts[i];
    if (modifier === undefined) continue;
    const lower = modifier.toLowerCase();
    if (lower === 'ctrl') ctrl = true;
    else if (lower === 'shift') shift = true;
    else if (lower === 'meta') meta = true;
  }

  return { name, ctrl, shift, meta };
}

/**
 * Create a keyboard handler that dispatches key events to pattern-matched handlers.
 *
 * Patterns are parsed once at call time, not per keystroke. Matching is exact:
 * `'up'` won't match `ctrl+up`. First match wins. No match = no-op.
 *
 * @example
 * ```ts
 * useKeyboard(match({
 *   up: () => selectedIndex--,
 *   down: () => selectedIndex++,
 *   return: () => onSubmit(),
 *   'ctrl+c': () => tui.exit(),
 * }));
 * ```
 */
export function match(keyMap: KeyMap): (key: KeyEvent) => void {
  const entries: Array<{ parsed: ParsedPattern; handler: (key: KeyEvent) => void }> = [];

  for (const pattern in keyMap) {
    const handler = keyMap[pattern];
    if (handler) {
      entries.push({ parsed: parsePattern(pattern), handler });
    }
  }

  return (key: KeyEvent) => {
    for (const { parsed, handler } of entries) {
      if (
        key.name === parsed.name &&
        key.ctrl === parsed.ctrl &&
        key.shift === parsed.shift &&
        key.meta === parsed.meta
      ) {
        handler(key);
        return;
      }
    }
  };
}
