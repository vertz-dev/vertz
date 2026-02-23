import { getCurrentApp, useComponentState } from '../app';
import type { KeyEvent } from '../input/key-parser';
import { jsx } from '../jsx-runtime/index';
import type { TuiNode } from '../nodes/types';

export interface PasswordInputProps {
  onSubmit?: (value: string) => void;
  placeholder?: string;
}

export function PasswordInput(props: PasswordInputProps): TuiNode {
  const app = getCurrentApp();
  const state = useComponentState(() => ({ text: '', registered: false }));

  if (!state.registered && app) {
    state.registered = true;
    const s = state;
    const handler = (key: KeyEvent) => {
      if (key.name === 'return') {
        if (props.onSubmit) props.onSubmit(s.text);
      } else if (key.name === 'backspace') {
        s.text = s.text.slice(0, -1);
        if (app.rerenderFn) app.rerenderFn();
      } else if (key.char && key.char.length === 1 && key.name !== 'space') {
        s.text += key.char;
        if (app.rerenderFn) app.rerenderFn();
      } else if (key.name === 'space') {
        s.text += ' ';
        if (app.rerenderFn) app.rerenderFn();
      }
    };

    if (app.testStdin) app.testStdin.onKey(handler);
  }

  const displayText = state.text ? '\u2022'.repeat(state.text.length) : props.placeholder || '';
  const showPlaceholder = !state.text && props.placeholder;

  return jsx('Text', {
    dim: showPlaceholder ? true : undefined,
    children: displayText,
  });
}
