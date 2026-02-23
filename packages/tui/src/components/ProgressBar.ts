import { __append, __element, __staticText } from '../internals';
import type { TuiElement } from '../tui-element';

export interface ProgressBarProps {
  value: number;
  max: number;
  label?: string;
  width?: number;
}

const FILLED = '\u2588';
const EMPTY = '\u2591';

export function ProgressBar(props: ProgressBarProps): TuiElement {
  const { value, max, label, width = 20 } = props;
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const filled = Math.round(ratio * width);
  const empty = width - filled;
  const percent = Math.round(ratio * 100);

  const bar = FILLED.repeat(filled) + EMPTY.repeat(empty);
  const text = label ? `${label} ${bar} ${percent}%` : `${bar} ${percent}%`;

  const el = __element('Text');
  __append(el, __staticText(text));
  return el;
}
