import { __append, __element, __staticText } from '../internals';
import type { TuiElement } from '../tui-element';

const SPINNER_FRAMES = [
  '\u280B',
  '\u2819',
  '\u2839',
  '\u2838',
  '\u283C',
  '\u2834',
  '\u2826',
  '\u2827',
  '\u2807',
  '\u280F',
];

export interface SpinnerProps {
  label?: string;
}

export function Spinner(props: SpinnerProps): TuiElement {
  // Use a simple first frame for static render.
  // Animation requires the scheduler to be running (tui.mount).
  const frame = SPINNER_FRAMES[0] ?? '\u280B';

  if (props.label) {
    const box = __element('Box', 'direction', 'row', 'gap', 1);
    const spinnerText = __element('Text', 'color', 'cyan');
    __append(spinnerText, __staticText(frame));
    const labelText = __element('Text');
    __append(labelText, __staticText(props.label));
    __append(box, spinnerText);
    __append(box, labelText);
    return box;
  }

  const el = __element('Text', 'color', 'cyan');
  __append(el, __staticText(frame));
  return el;
}
