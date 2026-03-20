import type { CSSOutput } from '@vertz/ui';

type SkeletonBlocks = {
  base: string[];
};

export interface SkeletonProps {
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
  width?: string;
  height?: string;
}

export interface SkeletonComponents {
  Skeleton: (props?: SkeletonProps) => HTMLDivElement;
}

export function createSkeletonComponents(
  skeletonStyles: CSSOutput<SkeletonBlocks>,
): SkeletonComponents {
  function Skeleton({ className, class: classProp, width, height }: SkeletonProps = {}) {
    const combinedClass = [skeletonStyles.base, className ?? classProp].filter(Boolean).join(' ');
    const style: Record<string, string> = {};
    if (width) style.width = width;
    if (height) style.height = height;
    return (
      <div
        class={combinedClass}
        aria-hidden="true"
        style={Object.keys(style).length > 0 ? style : undefined}
      />
    ) as HTMLDivElement;
  }

  return { Skeleton };
}
