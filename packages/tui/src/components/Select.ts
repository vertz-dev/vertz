import { signal } from '@vertz/ui';
import { useKeyboard } from '../input/hooks';
import { __append, __child, __element, __staticText } from '../internals';
import { symbols } from '../theme';
import type { TuiElement } from '../tui-element';

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

/**
 * Select prompt component.
 *
 * Uses `signal()` + internals API (`__element`, `__append`, `__child`) directly
 * instead of JSX because framework components are pre-built JS that doesn't pass
 * through the Vertz compiler. See the block comment at the top of `internals.ts`
 * for the full explanation of this dual-usage pattern.
 */
export function Select<T>(props: SelectProps<T>): TuiElement {
  const selectedIndex = signal(0);

  useKeyboard((key) => {
    if (key.name === 'up') {
      const next = Math.max(0, selectedIndex.value - 1);
      if (next !== selectedIndex.value) selectedIndex.value = next;
    } else if (key.name === 'down') {
      const next = Math.min(props.options.length - 1, selectedIndex.value + 1);
      if (next !== selectedIndex.value) selectedIndex.value = next;
    } else if (key.name === 'return') {
      const option = props.options[selectedIndex.value];
      if (option && props.onSubmit) {
        props.onSubmit(option.value);
      }
    }
  });

  const box = __element('Box', 'direction', 'column');

  // Message header
  const header = __element('Text', 'bold', true);
  __append(header, __staticText(props.message));
  __append(box, header);

  // Options
  for (let i = 0; i < props.options.length; i++) {
    const option = props.options[i];
    if (!option) continue;
    const idx = i;
    const optionEl = __element('Text');
    __append(
      optionEl,
      __child(() => {
        const isSelected = idx === selectedIndex.value;
        const prefix = isSelected ? symbols.pointer : ' ';
        const hint = option.hint ? ` (${option.hint})` : '';
        return `${prefix} ${option.label}${hint}`;
      }),
    );
    __append(box, optionEl);
  }

  return box;
}
