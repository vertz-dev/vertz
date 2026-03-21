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
  const effectiveCls = className ?? classProp;
  const combinedClass = [classes?.base, effectiveCls].filter(Boolean).join(' ');
  return (
    <div
      class={combinedClass || undefined}
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
