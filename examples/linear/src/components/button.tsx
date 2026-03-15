/**
 * Button component — JSX wrapper around theme-shadcn button variants.
 *
 * Usage:
 *   <Button intent="primary" size="sm" onClick={handler}>Label</Button>
 */

import { themeStyles } from '../styles/theme';

const buttonVariants = themeStyles.button;

interface ButtonProps {
  intent?: 'primary' | 'secondary' | 'destructive' | 'ghost' | 'outline' | 'link';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'icon' | 'icon-xs' | 'icon-sm' | 'icon-lg';
  class?: string;
  children?: unknown;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  onClick?: (e: MouseEvent) => void;
}

export function Button({
  intent,
  size,
  class: className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      class={[buttonVariants({ intent, size }), className].filter(Boolean).join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}
