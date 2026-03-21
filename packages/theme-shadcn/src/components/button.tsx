import type { ChildValue, VariantFunction } from '@vertz/ui';
import type { ElementEventHandlers } from '@vertz/ui-primitives';

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
    return (
      <button
        type={type ?? 'button'}
        class={combinedClass}
        disabled={disabled || undefined}
        {...rest}
      >
        {children}
      </button>
    ) as HTMLButtonElement;
  };
}
