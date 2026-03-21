import { cn } from '../composed/cn';
import type { ComposedPrimitive } from '../composed/with-styles';

export interface SkeletonClasses {
  base?: string;
}

export type SkeletonClassKey = keyof SkeletonClasses;

export interface ComposedSkeletonProps {
  classes?: SkeletonClasses;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
  width?: string;
  height?: string;
}

function ComposedSkeletonRoot(props: ComposedSkeletonProps = {}) {
  const { classes, className, class: classProp, width, height } = props;
  return (
    <div
      class={cn(classes?.base, className ?? classProp)}
      aria-hidden="true"
      style={{
        width: width || undefined,
        height: height || undefined,
      }}
    />
  );
}

export const ComposedSkeleton: ComposedPrimitive<SkeletonClassKey, HTMLElement> =
  ComposedSkeletonRoot as ComposedPrimitive<SkeletonClassKey, HTMLElement>;
