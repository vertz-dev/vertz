import { signal } from '@vertz/ui';
import { useKeyboard } from '../input/hooks';
import { __append, __child, __element, __staticText } from '../internals';
import { symbols } from '../theme';
import type { TuiElement } from '../tui-element';
import type { SelectOption } from './Select';

export interface MultiSelectProps<T = string> {
  message: string;
  options: SelectOption<T>[];
  defaultValue?: T[];
  onSubmit?: (values: T[]) => void;
}

export function MultiSelect<T>(props: MultiSelectProps<T>): TuiElement {
  const box = __element('Box', 'direction', 'column');

  // Message header
  const header = __element('Text', 'bold', true);
  __append(header, __staticText(props.message));
  __append(box, header);

  if (props.options.length === 0) return box;

  // Warn about defaultValue entries not found in options
  if (props.defaultValue) {
    const optionValues = new Set(props.options.map((o) => o.value));
    for (const val of props.defaultValue) {
      if (!optionValues.has(val)) {
        console.warn(`MultiSelect: defaultValue "${String(val)}" not found in options`);
      }
    }
  }

  const initialChecked = new Set(
    props.defaultValue
      ? props.options
          .map((o, i) => (props.defaultValue?.includes(o.value) ? i : -1))
          .filter((i) => i !== -1)
      : [],
  );
  const selectedIndex = signal(0);
  const checked = signal(initialChecked);

  useKeyboard((key) => {
    if (key.name === 'up') {
      selectedIndex.value = Math.max(0, selectedIndex.value - 1);
    } else if (key.name === 'down') {
      selectedIndex.value = Math.min(props.options.length - 1, selectedIndex.value + 1);
    } else if (key.name === 'space') {
      const newChecked = new Set(checked.value);
      if (newChecked.has(selectedIndex.value)) {
        newChecked.delete(selectedIndex.value);
      } else {
        newChecked.add(selectedIndex.value);
      }
      checked.value = newChecked;
    } else if (key.name === 'return') {
      if (props.onSubmit) {
        const selected = props.options.filter((_, i) => checked.value.has(i)).map((o) => o.value);
        props.onSubmit(selected);
      }
    }
  });

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
        const isChecked = checked.value.has(idx);
        const checkbox = isChecked ? symbols.success : symbols.bullet;
        const prefix = isSelected ? symbols.pointer : ' ';
        return `${prefix} ${checkbox} ${option.label}`;
      }),
    );
    __append(box, optionEl);
  }

  return box;
}
