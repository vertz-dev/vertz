import type { CSSOutput } from '@vertz/ui';

type SeparatorBlocks = { base: string[]; horizontal: string[]; vertical: string[] };

export interface SeparatorProps {
  orientation?: 'horizontal' | 'vertical';
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

export function createSeparatorComponent(
  separatorStyles: CSSOutput<SeparatorBlocks>,
): (props: SeparatorProps) => HTMLHRElement {
  return function Separator({
    orientation = 'horizontal',
    className,
    class: classProp,
  }: SeparatorProps) {
    const orientationClass =
      orientation === 'vertical' ? separatorStyles.vertical : separatorStyles.horizontal;
    const combinedClass = [separatorStyles.base, orientationClass, className ?? classProp]
      .filter(Boolean)
      .join(' ');
    const el = (<hr class={combinedClass} />) as HTMLHRElement;
    el.setAttribute('role', 'separator');
    el.setAttribute('aria-orientation', orientation);
    return el;
  };
}
