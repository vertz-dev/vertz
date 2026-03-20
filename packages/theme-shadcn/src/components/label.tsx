import type { ChildValue, CSSOutput } from '@vertz/ui';

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
  return function Label({ className, class: classProp, for: htmlFor, children }: LabelProps) {
    const combinedClass = [labelStyles.base, className ?? classProp].filter(Boolean).join(' ');
    return (
      <label class={combinedClass} for={htmlFor}>
        {children}
      </label>
    ) as HTMLLabelElement;
  };
}
