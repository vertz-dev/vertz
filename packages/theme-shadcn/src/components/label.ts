import type { ChildValue, CSSOutput } from '@vertz/ui';
import { resolveChildren } from '@vertz/ui';

type LabelBlocks = { base: string[] };

export interface LabelProps {
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
  for?: string;
  children?: ChildValue;
}

export function createLabelComponent(
  labelStyles: CSSOutput<LabelBlocks>,
): (props: LabelProps) => HTMLLabelElement {
  return function Label({
    className,
    class: classProp,
    for: htmlFor,
    children,
  }: LabelProps): HTMLLabelElement {
    const effectiveClass = className ?? classProp;
    const el = document.createElement('label');
    el.className = [labelStyles.base, effectiveClass].filter(Boolean).join(' ');
    if (htmlFor !== undefined) el.htmlFor = htmlFor;
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  };
}
