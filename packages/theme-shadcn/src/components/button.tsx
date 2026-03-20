import type { ChildValue, VariantFunction } from '@vertz/ui';
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
  }: ButtonProps) {
    const effectiveClass = className ?? classProp;
    const combinedClass = [buttonStyles({ intent, size }), effectiveClass]
      .filter(Boolean)
      .join(' ');
    // JSX creates/claims the element (hydration-aware via __element).
    // Spread props are not supported by the compiler on intrinsic elements,
    // so we apply rest props (event handlers, data-* attrs) imperatively.
    const el = (
      <button type={type ?? 'button'} class={combinedClass} disabled={disabled || undefined}>
        {children}
      </button>
    ) as HTMLButtonElement;
    applyProps(el, rest);
    return el;
  };
}
