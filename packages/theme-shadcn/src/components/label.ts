import type { ChildValue, CSSOutput } from '@vertz/ui';
import { resolveChildren } from '@vertz/ui';

type LabelBlocks = { base: string[] };

export interface LabelProps {
  class?: string;
  for?: string;
  children?: ChildValue;
}

export function createLabelComponent(
  labelStyles: CSSOutput<LabelBlocks>,
): (props: LabelProps) => HTMLLabelElement {
  return function Label({
    class: className,
    for: htmlFor,
    children,
  }: LabelProps): HTMLLabelElement {
    const el = document.createElement('label');
    el.className = [labelStyles.base, className].filter(Boolean).join(' ');
    if (htmlFor !== undefined) el.htmlFor = htmlFor;
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  };
}
