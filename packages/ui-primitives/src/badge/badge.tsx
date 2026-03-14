import type { ElementAttrs } from '../utils/attrs';
import { applyAttrs } from '../utils/attrs';
import { uniqueId } from '../utils/id';

export interface BadgeOptions extends ElementAttrs {
  variant?: 'default' | 'secondary' | 'outline' | 'destructive';
}

export interface BadgeElements {
  badge: HTMLSpanElement;
}

function BadgeRoot(options: BadgeOptions = {}): BadgeElements {
  const { variant = 'default', ...attrs } = options;

  const badge = (
    <span id={uniqueId('badge')} data-slot="badge" data-variant={variant} />
  ) as HTMLSpanElement;

  applyAttrs(badge, attrs);
  return { badge };
}

export const Badge: { Root: (options?: BadgeOptions) => BadgeElements } = {
  Root: BadgeRoot,
};
