import { getCurrentApp, useComponentState } from '../app';
import type { KeyEvent } from '../input/key-parser';
import { jsx } from '../jsx-runtime/index';
import type { TuiNode } from '../nodes/types';
import { symbols } from '../theme';
import type { SelectOption } from './Select';

export interface MultiSelectProps<T = string> {
  message: string;
  options: SelectOption<T>[];
  defaultValue?: T[];
  onSubmit?: (values: T[]) => void;
}

export function MultiSelect<T>(props: MultiSelectProps<T>): TuiNode {
  const app = getCurrentApp();
  const state = useComponentState(() => {
    const initialChecked = new Set(
      props.defaultValue
        ? props.options
            .map((o, i) => (props.defaultValue?.includes(o.value) ? i : -1))
            .filter((i) => i !== -1)
        : [],
    );
    return { selectedIndex: 0, checked: initialChecked, registered: false };
  });

  if (!state.registered && app) {
    state.registered = true;
    const s = state;
    const handler = (key: KeyEvent) => {
      if (key.name === 'up') {
        s.selectedIndex = Math.max(0, s.selectedIndex - 1);
        if (app.rerenderFn) app.rerenderFn();
      } else if (key.name === 'down') {
        s.selectedIndex = Math.min(props.options.length - 1, s.selectedIndex + 1);
        if (app.rerenderFn) app.rerenderFn();
      } else if (key.name === 'space') {
        if (s.checked.has(s.selectedIndex)) {
          s.checked.delete(s.selectedIndex);
        } else {
          s.checked.add(s.selectedIndex);
        }
        if (app.rerenderFn) app.rerenderFn();
      } else if (key.name === 'return') {
        if (props.onSubmit) {
          const selected = props.options.filter((_, i) => s.checked.has(i)).map((o) => o.value);
          props.onSubmit(selected);
        }
      }
    };

    if (app.testStdin) app.testStdin.onKey(handler);
  }

  const children: TuiNode[] = [jsx('Text', { bold: true, children: props.message })];

  for (let i = 0; i < props.options.length; i++) {
    const option = props.options[i];
    if (!option) continue;
    const isSelected = i === state.selectedIndex;
    const isChecked = state.checked.has(i);
    const checkbox = isChecked ? symbols.success : symbols.bullet;
    const prefix = isSelected ? symbols.pointer : ' ';
    children.push(
      jsx('Text', {
        color: isSelected ? 'cyan' : undefined,
        children: `${prefix} ${checkbox} ${option.label}`,
      }),
    );
  }

  return jsx('Box', { direction: 'column', children });
}
