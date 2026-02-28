import type { ChildValue, CSSOutput } from '@vertz/ui';
import { resolveChildren } from '@vertz/ui';

type AvatarBlocks = {
  root: string[];
  image: string[];
  fallback: string[];
};

export interface AvatarProps {
  class?: string;
  children?: ChildValue;
}

export interface AvatarImageProps {
  src: string;
  alt: string;
  class?: string;
}

export interface AvatarComponents {
  Avatar: (props: AvatarProps) => HTMLDivElement;
  AvatarImage: (props: AvatarImageProps) => HTMLImageElement;
  AvatarFallback: (props: AvatarProps) => HTMLDivElement;
}

export function createAvatarComponents(avatarStyles: CSSOutput<AvatarBlocks>): AvatarComponents {
  function Avatar({ class: className, children }: AvatarProps): HTMLDivElement {
    const el = document.createElement('div');
    el.className = [avatarStyles.root, className].filter(Boolean).join(' ');
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  }

  function AvatarImage({ src, alt, class: className }: AvatarImageProps): HTMLImageElement {
    const el = document.createElement('img');
    el.className = [avatarStyles.image, className].filter(Boolean).join(' ');
    el.src = src;
    el.alt = alt;
    return el;
  }

  function AvatarFallback({ class: className, children }: AvatarProps): HTMLDivElement {
    const el = document.createElement('div');
    el.className = [avatarStyles.fallback, className].filter(Boolean).join(' ');
    for (const node of resolveChildren(children)) {
      el.appendChild(node);
    }
    return el;
  }

  return { Avatar, AvatarImage, AvatarFallback };
}
