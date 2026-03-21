import { cn } from '../composed/cn';
import type { ComposedPrimitive } from '../composed/with-styles';

// ---------------------------------------------------------------------------
// Root Skeleton
// ---------------------------------------------------------------------------

export interface SkeletonClasses {
  root?: string;
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
      class={cn(classes?.root, className ?? classProp)}
      aria-hidden="true"
      style={{
        width: width || undefined,
        height: height || undefined,
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Skeleton.Text
// ---------------------------------------------------------------------------

export interface SkeletonTextClasses {
  root?: string;
  line?: string;
}

export type SkeletonTextClassKey = keyof SkeletonTextClasses;

export interface ComposedSkeletonTextProps {
  classes?: SkeletonTextClasses;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
  /** Number of lines to render. Default: 3 */
  lines?: number;
  /** Width of the last line. Default: '75%' */
  lastLineWidth?: string;
  /** Height of each line. Default: '1rem' */
  height?: string;
  /** Gap between lines. Overrides the CSS class gap when provided. */
  gap?: string;
}

function SkeletonText(props: ComposedSkeletonTextProps = {}) {
  const lineCount = props.lines ?? 3;
  const lastWidth = props.lastLineWidth ?? '75%';
  const lineHeight = props.height;

  const lines: Node[] = [];
  for (let i = 0; i < lineCount; i++) {
    lines.push(
      <div
        class={cn(props.classes?.line)}
        style={{
          width: i === lineCount - 1 ? lastWidth : undefined,
          height: lineHeight || undefined,
        }}
      />,
    );
  }

  return (
    <div
      class={cn(props.classes?.root, props.className ?? props.class)}
      aria-hidden="true"
      style={{ gap: props.gap || undefined }}
    >
      {lines}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton.Circle
// ---------------------------------------------------------------------------

export interface SkeletonCircleClasses {
  root?: string;
}

export type SkeletonCircleClassKey = keyof SkeletonCircleClasses;

export interface ComposedSkeletonCircleProps {
  classes?: SkeletonCircleClasses;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
  /** Diameter. Default: '2.5rem' */
  size?: string;
}

function SkeletonCircle(props: ComposedSkeletonCircleProps = {}) {
  const size = props.size ?? '2.5rem';
  return (
    <div
      class={cn(props.classes?.root, props.className ?? props.class)}
      aria-hidden="true"
      style={{ width: size, height: size }}
    />
  );
}

// ---------------------------------------------------------------------------
// Export as callable with sub-component properties
// ---------------------------------------------------------------------------

export const ComposedSkeleton = Object.assign(ComposedSkeletonRoot, {
  Text: SkeletonText as ComposedPrimitive<SkeletonTextClassKey, HTMLElement>,
  Circle: SkeletonCircle as ComposedPrimitive<SkeletonCircleClassKey, HTMLElement>,
}) as ComposedPrimitive<SkeletonClassKey, HTMLElement> & {
  Text: ComposedPrimitive<SkeletonTextClassKey, HTMLElement>;
  Circle: ComposedPrimitive<SkeletonCircleClassKey, HTMLElement>;
};
