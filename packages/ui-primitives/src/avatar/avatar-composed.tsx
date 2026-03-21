/**
 * Composed Avatar — compound component with context-based class distribution.
 * Sub-components: Image, Fallback.
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, useContext } from '@vertz/ui';
import { cn } from '../composed/cn';

// ---------------------------------------------------------------------------
// Class distribution
// ---------------------------------------------------------------------------

export interface AvatarClasses {
  root?: string;
  image?: string;
  fallback?: string;
}

export type AvatarClassKey = keyof AvatarClasses;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AvatarContext = createContext<{ classes?: AvatarClasses } | undefined>(
  undefined,
  '@vertz/ui-primitives::AvatarContext',
);

// ---------------------------------------------------------------------------
// Sub-component props
// ---------------------------------------------------------------------------

interface SlotProps {
  children?: ChildValue;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

interface AvatarImageProps {
  src: string;
  alt: string;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AvatarImage({ src, alt, className, class: classProp }: AvatarImageProps) {
  const ctx = useContext(AvatarContext);
  return <img src={src} alt={alt} class={cn(ctx?.classes?.image, className ?? classProp)} />;
}

function AvatarFallback({ children, className, class: classProp }: SlotProps) {
  const ctx = useContext(AvatarContext);
  return <div class={cn(ctx?.classes?.fallback, className ?? classProp)}>{children}</div>;
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export interface ComposedAvatarProps {
  children?: ChildValue;
  classes?: AvatarClasses;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

function ComposedAvatarRoot({
  children,
  classes,
  className,
  class: classProp,
}: ComposedAvatarProps) {
  return (
    <AvatarContext.Provider value={{ classes }}>
      <div class={cn(classes?.root, className ?? classProp)}>{children}</div>
    </AvatarContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Export as callable with sub-component properties
// ---------------------------------------------------------------------------

export const ComposedAvatar = Object.assign(ComposedAvatarRoot, {
  Image: AvatarImage,
  Fallback: AvatarFallback,
}) as ((props: ComposedAvatarProps) => HTMLElement) & {
  __classKeys?: AvatarClassKey;
  Image: (props: AvatarImageProps) => HTMLElement;
  Fallback: (props: SlotProps) => HTMLElement;
};
