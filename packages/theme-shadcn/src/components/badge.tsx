import type { ChildValue, VariantFunction } from '@vertz/ui';

type BadgeVariants = {
  color: Record<string, string[]>;
};

export interface BadgeProps {
  color?: string;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
  children?: ChildValue;
}

export function createBadgeComponent(
  badgeStyles: VariantFunction<BadgeVariants>,
): (props: BadgeProps) => HTMLSpanElement {
  const colorStyles: Record<string, Record<string, string>> = {
    blue: { backgroundColor: 'oklch(0.55 0.15 250)', color: '#fff' },
    green: { backgroundColor: 'oklch(0.55 0.15 155)', color: '#fff' },
    yellow: { backgroundColor: 'oklch(0.75 0.15 85)', color: 'oklch(0.25 0.05 85)' },
  };

  return function Badge({ color, className, class: classProp, children }: BadgeProps) {
    const combinedClass = [badgeStyles({ color }), className ?? classProp]
      .filter(Boolean)
      .join(' ');
    const inlineStyle = color ? colorStyles[color] : undefined;
    return (
      <span class={combinedClass} style={inlineStyle}>
        {children}
      </span>
    ) as HTMLSpanElement;
  };
}
