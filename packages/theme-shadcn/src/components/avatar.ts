import type { ChildValue, CSSOutput } from '@vertz/ui';
import { resolveChildren } from '@vertz/ui';

type AvatarBlocks = {
  root: string[];
  image: string[];
  fallback: string[];
};

export interface AvatarProps {
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
  children?: ChildValue;
}

export interface AvatarImageProps {
  src: string;
  alt: string;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

export interface AvatarComponents {
  Avatar: (props: AvatarProps) => HTMLDivElement;
  AvatarImage: (props: AvatarImageProps) => HTMLImageElement;
  AvatarFallback: (props: AvatarProps) => HTMLDivElement;
}

export function createAvatarComponents(avatarStyles: CSSOutput<AvatarBlocks>): AvatarComponents {
  function Avatar({ className, class: classProp, children }: AvatarProps): HTMLDivElement {
    const effectiveClass = className ?? classProp;
    const el = document.createElement('div');
    el.className = [avatarStyles.root, effectiveClass].filter(Boolean).join(' ');
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  }

  function AvatarImage({
    src,
    alt,
    className,
    class: classProp,
  }: AvatarImageProps): HTMLImageElement {
    const effectiveClass = className ?? classProp;
    const el = document.createElement('img');
    el.className = [avatarStyles.image, effectiveClass].filter(Boolean).join(' ');
    el.src = src;
    el.alt = alt;
    return el;
  }

  function AvatarFallback({ className, class: classProp, children }: AvatarProps): HTMLDivElement {
    const effectiveClass = className ?? classProp;
    const el = document.createElement('div');
    el.className = [avatarStyles.fallback, effectiveClass].filter(Boolean).join(' ');
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  }

  return { Avatar, AvatarImage, AvatarFallback };
}
