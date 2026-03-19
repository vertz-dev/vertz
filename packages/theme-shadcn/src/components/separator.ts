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
  }: SeparatorProps): HTMLHRElement {
    const effectiveClass = className ?? classProp;
    const orientationClass =
      orientation === 'vertical' ? separatorStyles.vertical : separatorStyles.horizontal;
    const el = document.createElement('hr');
    el.className = [separatorStyles.base, orientationClass, effectiveClass]
      .filter(Boolean)
      .join(' ');
    el.setAttribute('role', 'separator');
    el.setAttribute('aria-orientation', orientation);
    return el;
  };
}
