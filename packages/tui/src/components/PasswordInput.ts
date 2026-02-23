import { signal } from '@vertz/ui';
import { useKeyboard } from '../input/hooks';
import { __append, __child, __element } from '../internals';
import type { TuiElement } from '../tui-element';

export interface PasswordInputProps {
  onSubmit?: (value: string) => void;
  placeholder?: string;
}

export function PasswordInput(props: PasswordInputProps): TuiElement {
  const text = signal('');

  useKeyboard((key) => {
    if (key.name === 'return') {
      if (props.onSubmit) props.onSubmit(text.value);
    } else if (key.name === 'backspace') {
      text.value = text.value.slice(0, -1);
    } else if (key.char && key.char.length === 1 && key.name !== 'space') {
      text.value += key.char;
    } else if (key.name === 'space') {
      text.value += ' ';
    }
  });

  const el = __element('Text');
  __append(
    el,
    __child(() => {
      const showPlaceholder = !text.value && props.placeholder;
      if (showPlaceholder) return props.placeholder ?? '';
      return text.value ? '\u2022'.repeat(text.value.length) : '';
    }),
  );

  return el;
}
