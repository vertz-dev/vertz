import type { CSSOutput } from '@vertz/ui';

type InputBlocks = { base: string[] };

export interface InputProps {
  class?: string;
  name?: string;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
  value?: string;
  [key: string]: unknown;
}

export function createInputComponent(
  inputStyles: CSSOutput<InputBlocks>,
): (props: InputProps) => HTMLInputElement {
  return function Input({
    class: className,
    name,
    placeholder,
    type,
    disabled,
    value,
    ...attrs
  }: InputProps): HTMLInputElement {
    const el = document.createElement('input');
    el.className = [inputStyles.base, className].filter(Boolean).join(' ');
    if (name !== undefined) el.name = name;
    if (placeholder !== undefined) el.placeholder = placeholder;
    if (type !== undefined) el.type = type;
    if (disabled) el.disabled = true;
    if (value !== undefined) el.value = value;
    for (const [key, val] of Object.entries(attrs)) {
      if (val !== undefined && val !== null) {
        el.setAttribute(key, String(val));
      }
    }
    return el;
  };
}
