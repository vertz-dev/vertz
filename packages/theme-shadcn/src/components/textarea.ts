import type { CSSOutput } from '@vertz/ui';
import type { ElementEventHandlers } from '../event-handlers';
import { isKnownEventHandler, wireEventHandlers } from '../event-handlers';

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
  }: TextareaProps): HTMLTextAreaElement {
    const effectiveClass = className ?? classProp;
    const el = document.createElement('textarea');
    el.className = [textareaStyles.base, effectiveClass].filter(Boolean).join(' ');
    if (name !== undefined) el.name = name;
    if (placeholder !== undefined) el.placeholder = placeholder;
    if (disabled) el.disabled = true;
    if (value !== undefined) el.value = value;
    if (rows !== undefined) el.rows = rows;
    wireEventHandlers(el, attrs as ElementEventHandlers);
    for (const [key, val] of Object.entries(attrs)) {
      if (val === undefined || val === null) continue;
      if (isKnownEventHandler(key)) continue;
      el.setAttribute(key, String(val));
    }
    return el;
  };
}
