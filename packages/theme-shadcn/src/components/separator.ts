import type { CSSOutput } from '@vertz/ui';

type SeparatorBlocks = { base: string[] };

export interface SeparatorProps {
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

export function createSeparatorComponent(
  separatorStyles: CSSOutput<SeparatorBlocks>,
): (props: SeparatorProps) => HTMLHRElement {
  return function Separator({ className, class: classProp }: SeparatorProps): HTMLHRElement {
    const effectiveClass = className ?? classProp;
    const el = document.createElement('hr');
    el.className = [separatorStyles.base, effectiveClass].filter(Boolean).join(' ');
    return el;
  };
}
