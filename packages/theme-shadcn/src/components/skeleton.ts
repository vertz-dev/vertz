import type { CSSOutput } from '@vertz/ui';

type SkeletonBlocks = {
  base: string[];
};

export interface SkeletonProps {
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
  function Skeleton({ class: className, width, height }: SkeletonProps = {}): HTMLDivElement {
    const el = document.createElement('div');
    el.className = [skeletonStyles.base, className].filter(Boolean).join(' ');
    el.setAttribute('aria-hidden', 'true');
    if (width) el.style.width = width;
    if (height) el.style.height = height;
    return el;
  }

  return { Skeleton };
}
