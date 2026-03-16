import type { CSSOutput } from '@vertz/ui';
import type { ElementEventHandlers } from '@vertz/ui-primitives';
import { applyProps } from '@vertz/ui-primitives/utils';

type InputBlocks = { base: string[] };

export interface InputProps extends ElementEventHandlers {
  className?: string;
  /** @deprecated Use `className` instead. */
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
    className,
    class: classProp,
    name,
    placeholder,
    type,
    disabled,
    value,
    ...attrs
  }: InputProps): HTMLInputElement {
    const effectiveClass = className ?? classProp;
    const el = document.createElement('input');
    el.className = [inputStyles.base, effectiveClass].filter(Boolean).join(' ');
    if (name !== undefined) el.name = name;
    if (placeholder !== undefined) el.placeholder = placeholder;
    if (type !== undefined) el.type = type;
    if (disabled) el.disabled = true;
    if (value !== undefined) el.value = value;
    applyProps(el, attrs);
    return el;
  };
}
