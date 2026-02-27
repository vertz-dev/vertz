import type { ChildValue, VariantFunction } from '@vertz/ui';
import { resolveChildren } from '@vertz/ui';

type BadgeVariants = {
  color: Record<string, string[]>;
};

export interface BadgeProps {
  color?: string;
  class?: string;
  children?: ChildValue;
}

export function createBadgeComponent(
  badgeStyles: VariantFunction<BadgeVariants>,
): (props: BadgeProps) => HTMLSpanElement {
  return function Badge({ color, class: className, children }: BadgeProps): HTMLSpanElement {
    const el = document.createElement('span');
    el.className = [badgeStyles({ color }), className].filter(Boolean).join(' ');
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  };
}
