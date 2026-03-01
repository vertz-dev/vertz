import type { ChildValue, VariantFunction } from '@vertz/ui';
import { resolveChildren } from '@vertz/ui';

type ButtonVariants = {
  intent: Record<string, string[]>;
  size: Record<string, string[]>;
};

export interface ButtonProps {
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
    ...attrs
  }: ButtonProps): HTMLButtonElement {
    const el = document.createElement('button');
    el.type = type ?? 'button';
    el.className = [buttonStyles({ intent, size }), className].filter(Boolean).join(' ');
    if (disabled) el.disabled = true;
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === null) continue;
      // Wire event handler props as listeners
      if (key.startsWith('on') && typeof value === 'function') {
        const event = key[2]!.toLowerCase() + key.slice(3);
        el.addEventListener(event, value as EventListener);
      } else {
        el.setAttribute(key, String(value));
      }
    }
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  };
}
