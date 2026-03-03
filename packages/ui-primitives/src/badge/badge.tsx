import { uniqueId } from '../utils/id';

export interface BadgeOptions {
  variant?: 'default' | 'secondary' | 'outline' | 'destructive';
}

export interface BadgeElements {
  badge: HTMLSpanElement;
}

function BadgeRoot(options: BadgeOptions = {}): BadgeElements {
  const { variant = 'default' } = options;

  const badge = (
    <span id={uniqueId('badge')} data-slot="badge" data-variant={variant} />
  ) as HTMLSpanElement;

  return { badge };
}

export const Badge: { Root: (options?: BadgeOptions) => BadgeElements } = {
  Root: BadgeRoot,
};
