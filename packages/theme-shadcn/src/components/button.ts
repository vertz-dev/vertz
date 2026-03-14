import type { ChildValue, VariantFunction } from '@vertz/ui';
import { resolveChildren } from '@vertz/ui';
import type { ElementEventHandlers } from '../event-handlers';
import { isKnownEventHandler, wireEventHandlers } from '../event-handlers';

type ButtonVariants = {
  intent: Record<string, string[]>;
  size: Record<string, string[]>;
};

export interface ButtonProps extends ElementEventHandlers {
  intent?: string;
  size?: string;
  class?: string;
  children?: ChildValue;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  [key: string]: unknown;
}

export function createButtonComponent(
  buttonStyles: VariantFunction<ButtonVariants>,
): (props: ButtonProps) => HTMLButtonElement {
  return function Button({
    intent,
    size,
    class: className,
    children,
    disabled,
    type,
    ...rest
  }: ButtonProps): HTMLButtonElement {
    const el = document.createElement('button');
    el.type = type ?? 'button';
    el.className = [buttonStyles({ intent, size }), className].filter(Boolean).join(' ');
    if (disabled) el.disabled = true;
    wireEventHandlers(el, rest as ElementEventHandlers);
    for (const [key, value] of Object.entries(rest)) {
      if (value === undefined || value === null) continue;
      if (isKnownEventHandler(key)) continue;
      el.setAttribute(key, String(value));
    }
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  };
}
