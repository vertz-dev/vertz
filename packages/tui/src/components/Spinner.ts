import { signal } from '@vertz/ui';
import { _tryOnCleanup } from '@vertz/ui/internals';
import { __append, __child, __element, __staticText } from '../internals';
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
  const frameIndex = signal(0);
  const timer = setInterval(() => {
    frameIndex.value = (frameIndex.value + 1) % SPINNER_FRAMES.length;
  }, 80);

  _tryOnCleanup(() => clearInterval(timer));

  if (props.label) {
    const box = __element('Box', 'direction', 'row', 'gap', 1);
    const spinnerText = __element('Text', 'color', 'cyan');
    __append(
      spinnerText,
      __child(() => SPINNER_FRAMES[frameIndex.value]),
    );
    const labelText = __element('Text');
    __append(labelText, __staticText(props.label));
    __append(box, spinnerText);
    __append(box, labelText);
    return box;
  }

  const el = __element('Text', 'color', 'cyan');
  __append(
    el,
    __child(() => SPINNER_FRAMES[frameIndex.value]),
  );
  return el;
}
