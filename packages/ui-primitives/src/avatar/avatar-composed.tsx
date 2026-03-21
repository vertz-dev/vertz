/**
 * Composed Avatar — compound component with context-based class distribution.
 * Sub-components: Image, Fallback.
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, useContext } from '@vertz/ui';

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
  const effectiveCls = className ?? classProp;
  const combined = [ctx?.classes?.image, effectiveCls].filter(Boolean).join(' ');
  return <img src={src} alt={alt} class={combined || undefined} />;
}

function AvatarFallback({ children, className, class: classProp }: SlotProps) {
  const ctx = useContext(AvatarContext);
  const effectiveCls = className ?? classProp;
  const combined = [ctx?.classes?.fallback, effectiveCls].filter(Boolean).join(' ');
  return <div class={combined || undefined}>{children}</div>;
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
  const effectiveCls = className ?? classProp;
  const combinedClass = [classes?.root, effectiveCls].filter(Boolean).join(' ');
  return (
    <AvatarContext.Provider value={{ classes }}>
      <div class={combinedClass || undefined}>{children}</div>
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
