import type { ChildValue, CSSOutput } from '@vertz/ui';

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
  function Avatar({ className, class: classProp, children }: AvatarProps) {
    const combinedClass = [avatarStyles.root, className ?? classProp].filter(Boolean).join(' ');
    return (<div class={combinedClass}>{children}</div>) as HTMLDivElement;
  }

  function AvatarImage({ src, alt, className, class: classProp }: AvatarImageProps) {
    const combinedClass = [avatarStyles.image, className ?? classProp].filter(Boolean).join(' ');
    return (<img class={combinedClass} src={src} alt={alt} />) as HTMLImageElement;
  }

  function AvatarFallback({ className, class: classProp, children }: AvatarProps) {
    const combinedClass = [avatarStyles.fallback, className ?? classProp].filter(Boolean).join(' ');
    return (<div class={combinedClass}>{children}</div>) as HTMLDivElement;
  }

  return { Avatar, AvatarImage, AvatarFallback };
}
