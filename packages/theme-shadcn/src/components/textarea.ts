import type { CSSOutput } from '@vertz/ui';

type TextareaBlocks = { base: string[] };

export interface TextareaProps {
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
    class: className,
    name,
    placeholder,
    disabled,
    value,
    rows,
    ...attrs
  }: TextareaProps): HTMLTextAreaElement {
    const el = document.createElement('textarea');
    el.className = [textareaStyles.base, className].filter(Boolean).join(' ');
    if (name !== undefined) el.name = name;
    if (placeholder !== undefined) el.placeholder = placeholder;
    if (disabled) el.disabled = true;
    if (value !== undefined) el.value = value;
    if (rows !== undefined) el.rows = rows;
    for (const [key, val] of Object.entries(attrs)) {
      if (val !== undefined && val !== null) {
        el.setAttribute(key, String(val));
      }
    }
    return el;
  };
}
