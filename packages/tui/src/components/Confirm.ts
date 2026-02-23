import { signal } from '@vertz/ui';
import { useKeyboard } from '../input/hooks';
import { __append, __child, __element, __staticText } from '../internals';
import type { TuiElement } from '../tui-element';

export interface ConfirmProps {
  message: string;
  onSubmit?: (confirmed: boolean) => void;
}

export function Confirm(props: ConfirmProps): TuiElement {
  const value = signal(true);

  useKeyboard((key) => {
    if (key.name === 'left' || key.name === 'right') {
      value.value = !value.value;
    } else if (key.name === 'y') {
      value.value = true;
    } else if (key.name === 'n') {
      value.value = false;
    } else if (key.name === 'return') {
      if (props.onSubmit) props.onSubmit(value.value);
    }
  });

  const box = __element('Box', 'direction', 'row', 'gap', 1);

  const msgEl = __element('Text', 'bold', true);
  __append(msgEl, __staticText(props.message));
  __append(box, msgEl);

  const yesEl = __element('Text');
  __append(
    yesEl,
    __child(() => (value.value ? '[Yes]' : ' Yes ')),
  );
  __append(box, yesEl);

  const slashEl = __element('Text');
  __append(slashEl, __staticText('/'));
  __append(box, slashEl);

  const noEl = __element('Text');
  __append(
    noEl,
    __child(() => (value.value ? ' No ' : '[No]')),
  );
  __append(box, noEl);

  return box;
}
