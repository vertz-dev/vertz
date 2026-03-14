import { getUserIcon } from '@vertz/ui/auth';
import type { JSX } from '@vertz/ui/jsx-runtime';

const sizes = {
  sm: { width: '32px', height: '32px', icon: 18 },
  md: { width: '40px', height: '40px', icon: 22 },
  lg: { width: '56px', height: '56px', icon: 30 },
} as const;

export interface AvatarProps {
  src?: string;
  alt?: string;
  size?: 'sm' | 'md' | 'lg';
  fallback?: (() => unknown) | unknown;
  class?: string;
}

export function Avatar({
  src,
  alt,
  size = 'md',
  fallback,
  class: className,
}: AvatarProps): JSX.Element {
  let imgFailed = false;
  const sizeConfig = sizes[size] ?? sizes.md;
  const style = `display:inline-flex;align-items:center;justify-content:center;border-radius:9999px;overflow:hidden;flex-shrink:0;vertical-align:middle;width:${sizeConfig.width};height:${sizeConfig.height}`;

  return (
    <div class={className} style={style}>
      {!src || imgFailed ? (
        renderFallback(fallback, sizeConfig.icon)
      ) : (
        <img
          src={src}
          alt={alt ?? ''}
          style="width:100%;height:100%;object-fit:cover;border-radius:9999px"
          onError={() => {
            imgFailed = true;
          }}
        />
      )}
    </div>
  );
}

function renderFallback(fallback: (() => unknown) | unknown, iconSize: number): unknown {
  if (fallback) {
    return typeof fallback === 'function' ? (fallback as () => unknown)() : fallback;
  }
  return <span innerHTML={getUserIcon(iconSize)} />;
}
