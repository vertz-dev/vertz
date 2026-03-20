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
  }: InputProps) {
    const combinedClass = [inputStyles.base, className ?? classProp].filter(Boolean).join(' ');
    const el = (
      <input
        class={combinedClass}
        name={name}
        placeholder={placeholder}
        type={type}
        disabled={disabled || undefined}
        value={value}
      />
    ) as HTMLInputElement;
    applyProps(el, attrs);
    return el;
  };
}
