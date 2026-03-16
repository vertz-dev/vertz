import type { ChildValue, VariantFunction } from '@vertz/ui';
import { resolveChildren } from '@vertz/ui';
import type { ElementEventHandlers } from '@vertz/ui-primitives';
import { applyProps } from '@vertz/ui-primitives/utils';

type ButtonVariants = {
  intent: Record<string, string[]>;
  size: Record<string, string[]>;
};

export interface ButtonProps extends ElementEventHandlers {
  intent?: string;
  size?: string;
  className?: string;
  /** @deprecated Use `className` instead. */
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
    className,
    class: classProp,
    children,
    disabled,
    type,
    ...rest
  }: ButtonProps): HTMLButtonElement {
    const effectiveClass = className ?? classProp;
    const el = document.createElement('button');
    el.type = type ?? 'button';
    el.className = [buttonStyles({ intent, size }), effectiveClass].filter(Boolean).join(' ');
    if (disabled) el.disabled = true;
    applyProps(el, rest);
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  };
}
