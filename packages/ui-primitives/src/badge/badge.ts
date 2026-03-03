import { uniqueId } from '../utils/id';

export interface BadgeOptions {
  variant?: 'default' | 'secondary' | 'outline' | 'destructive';
}

export interface BadgeElements {
  badge: HTMLSpanElement;
}

export const Badge = {
  Root(options: BadgeOptions = {}): BadgeElements {
    const { variant = 'default' } = options;

    const badge = document.createElement('span');
    badge.id = uniqueId('badge');
    badge.setAttribute('data-slot', 'badge');
    badge.setAttribute('data-variant', variant);
    return { badge };
  },
};
