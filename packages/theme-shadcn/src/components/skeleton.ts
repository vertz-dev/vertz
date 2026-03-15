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
  function Skeleton({
    className,
    class: classProp,
    width,
    height,
  }: SkeletonProps = {}): HTMLDivElement {
    const effectiveClass = className ?? classProp;
    const el = document.createElement('div');
    el.className = [skeletonStyles.base, effectiveClass].filter(Boolean).join(' ');
    el.setAttribute('aria-hidden', 'true');
    if (width) el.style.width = width;
    if (height) el.style.height = height;
    return el;
  }

  return { Skeleton };
}
