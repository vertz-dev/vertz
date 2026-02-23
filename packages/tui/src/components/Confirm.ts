import { getCurrentApp, useComponentState } from '../app';
import type { KeyEvent } from '../input/key-parser';
import { jsx } from '../jsx-runtime/index';
import type { TuiNode } from '../nodes/types';

export interface ConfirmProps {
  message: string;
  onSubmit?: (confirmed: boolean) => void;
}

export function Confirm(props: ConfirmProps): TuiNode {
  const app = getCurrentApp();
  const state = useComponentState(() => ({ value: true, registered: false }));

  if (!state.registered && app) {
    state.registered = true;
    const s = state;
    const handler = (key: KeyEvent) => {
      if (key.name === 'left' || key.name === 'right') {
        s.value = !s.value;
        if (app.rerenderFn) app.rerenderFn();
      } else if (key.name === 'y') {
        s.value = true;
        if (app.rerenderFn) app.rerenderFn();
      } else if (key.name === 'n') {
        s.value = false;
        if (app.rerenderFn) app.rerenderFn();
      } else if (key.name === 'return') {
        if (props.onSubmit) props.onSubmit(s.value);
      }
    };

    if (app.testStdin) app.testStdin.onKey(handler);
  }

  const yes = state.value ? '[Yes]' : ' Yes ';
  const no = state.value ? ' No ' : '[No]';

  return jsx('Box', {
    direction: 'row',
    gap: 1,
    children: [
      jsx('Text', { bold: true, children: props.message }),
      jsx('Text', { color: state.value ? 'green' : undefined, children: yes }),
      jsx('Text', { children: '/' }),
      jsx('Text', { color: state.value ? undefined : 'red', children: no }),
    ],
  });
}
