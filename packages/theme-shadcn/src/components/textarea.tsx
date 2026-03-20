import type { CSSOutput } from '@vertz/ui';
import type { ElementEventHandlers } from '@vertz/ui-primitives';
import { applyProps } from '@vertz/ui-primitives/utils';

type TextareaBlocks = { base: string[] };

export interface TextareaProps extends ElementEventHandlers {
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
  name?: string;
  placeholder?: string;
  disabled?: boolean;
  value?: string;
  rows?: number;
  [key: string]: unknown;
}

export function createTextareaComponent(
  textareaStyles: CSSOutput<TextareaBlocks>,
): (props: TextareaProps) => HTMLTextAreaElement {
  return function Textarea({
    className,
    class: classProp,
    name,
    placeholder,
    disabled,
    value,
    rows,
    ...attrs
  }: TextareaProps) {
    const combinedClass = [textareaStyles.base, className ?? classProp].filter(Boolean).join(' ');
    const el = (
      <textarea
        class={combinedClass}
        name={name}
        placeholder={placeholder}
        disabled={disabled || undefined}
        rows={rows}
      >
        {value}
      </textarea>
    ) as HTMLTextAreaElement;
    if (value !== undefined) el.value = value;
    applyProps(el, attrs);
    return el;
  };
}
