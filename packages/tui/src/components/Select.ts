import { getCurrentApp, useComponentState } from '../app';
import type { KeyEvent } from '../input/key-parser';
import { jsx } from '../jsx-runtime/index';
import type { TuiNode } from '../nodes/types';
import { symbols } from '../theme';

export interface SelectOption<T = string> {
  label: string;
  value: T;
  hint?: string;
}

export interface SelectProps<T = string> {
  message: string;
  options: SelectOption<T>[];
  onSubmit?: (value: T) => void;
}

export function Select<T>(props: SelectProps<T>): TuiNode {
  const app = getCurrentApp();
  const state = useComponentState(() => ({
    selectedIndex: 0,
    registered: false,
  }));

  // Register keyboard handler once
  if (!state.registered && app) {
    state.registered = true;
    const s = state;
    const handler = (key: KeyEvent) => {
      if (key.name === 'up') {
        const next = Math.max(0, s.selectedIndex - 1);
        if (next !== s.selectedIndex) {
          s.selectedIndex = next;
          if (app.rerenderFn) app.rerenderFn();
        }
      } else if (key.name === 'down') {
        const next = Math.min(props.options.length - 1, s.selectedIndex + 1);
        if (next !== s.selectedIndex) {
          s.selectedIndex = next;
          if (app.rerenderFn) app.rerenderFn();
        }
      } else if (key.name === 'return') {
        const option = props.options[s.selectedIndex];
        if (option && props.onSubmit) {
          props.onSubmit(option.value);
        }
      }
    };

    if (app.testStdin) {
      app.testStdin.onKey(handler);
    }
  }

  const children: TuiNode[] = [jsx('Text', { bold: true, children: props.message })];

  for (let i = 0; i < props.options.length; i++) {
    const option = props.options[i];
    if (!option) continue;
    const isSelected = i === state.selectedIndex;
    const prefix = isSelected ? symbols.pointer : ' ';
    const hint = option.hint ? ` (${option.hint})` : '';
    children.push(
      jsx('Text', {
        color: isSelected ? 'cyan' : undefined,
        children: `${prefix} ${option.label}${hint}`,
      }),
    );
  }

  return jsx('Box', { direction: 'column', children });
}
