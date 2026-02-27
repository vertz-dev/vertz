import type { CSSOutput } from '@vertz/ui';

type SeparatorBlocks = { base: string[] };

export interface SeparatorProps {
  class?: string;
}

export function createSeparatorComponent(
  separatorStyles: CSSOutput<SeparatorBlocks>,
): (props: SeparatorProps) => HTMLHRElement {
  return function Separator({ class: className }: SeparatorProps): HTMLHRElement {
    const el = document.createElement('hr');
    el.className = [separatorStyles.base, className].filter(Boolean).join(' ');
    return el;
  };
}
