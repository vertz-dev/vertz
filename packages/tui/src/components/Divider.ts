import { __append, __element, __staticText } from '../internals';
import { symbols } from '../theme';
import type { TuiElement } from '../tui-element';

export interface DividerProps {
  label?: string;
  char?: string;
  width?: number;
  color?: string;
}

export function Divider({
  label,
  char = symbols.dash,
  width = 80,
  color,
}: DividerProps): TuiElement {
  let text: string;
  if (label) {
    const labelText = ` ${label} `;
    const remaining = Math.max(0, width - labelText.length);
    const left = Math.floor(remaining / 2);
    const right = remaining - left;
    text = char.repeat(left) + labelText + char.repeat(right);
  } else {
    text = char.repeat(width);
  }

  const attrs: unknown[] = [];
  if (color) {
    attrs.push('color', color);
  } else {
    attrs.push('dim', true);
  }
  const el = __element('Text', ...attrs);
  __append(el, __staticText(text));
  return el;
}
