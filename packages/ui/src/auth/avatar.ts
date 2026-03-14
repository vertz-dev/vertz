/**
 * Avatar — presentational avatar component with image + fallback.
 *
 * Uses DOM primitives and manual signals for reactivity (no compiler transforms
 * in @vertz/ui framework code). Matches AuthGate/OAuthButton patterns.
 */

import { __append, __element, __enterChildren, __exitChildren } from '../dom/element';
import { __on } from '../dom/events';
import { domEffect, signal } from '../runtime/signal';
import { getUserIcon } from './user-icon';

// Size definitions: container dimensions and icon sizes
const sizes = {
  sm: { width: '32px', height: '32px', icon: 18 },
  md: { width: '40px', height: '40px', icon: 22 },
  lg: { width: '56px', height: '56px', icon: 30 },
} as const;

// --- Props ---

export interface AvatarProps {
  src?: string;
  alt?: string;
  size?: 'sm' | 'md' | 'lg';
  fallback?: (() => unknown) | unknown;
  class?: string;
}

// --- Component ---

export function Avatar({
  src,
  alt,
  size = 'md',
  fallback,
  class: className,
}: AvatarProps): Element {
  const sizeConfig = sizes[size] ?? sizes.md;
  const container = __element('div');

  // Apply container styles
  container.setAttribute(
    'style',
    `display:inline-flex;align-items:center;justify-content:center;border-radius:9999px;overflow:hidden;flex-shrink:0;vertical-align:middle;width:${sizeConfig.width};height:${sizeConfig.height}`,
  );
  if (className) {
    container.setAttribute('class', className);
  }

  if (!src) {
    // No src — render fallback immediately
    __enterChildren(container);
    renderFallback(container, fallback, sizeConfig.icon);
    __exitChildren();
    return container;
  }

  // Has src — render img with onerror fallback
  const imgFailed = signal(false);
  const img = __element('img', { src, alt: alt ?? '' });
  img.setAttribute('style', 'width:100%;height:100%;object-fit:cover;border-radius:9999px');

  __on(img as HTMLElement, 'error', () => {
    imgFailed.value = true;
  });

  __enterChildren(container);
  __append(container, img);
  __exitChildren();

  // Reactive swap: when img fails, replace with fallback
  domEffect(() => {
    if (imgFailed.value) {
      container.innerHTML = '';
      renderFallback(container, fallback, sizeConfig.icon);
    }
  });

  return container;
}

function renderFallback(
  container: Element,
  fallback: (() => unknown) | unknown,
  iconSize: number,
): void {
  if (fallback) {
    const content = typeof fallback === 'function' ? (fallback as () => unknown)() : fallback;
    if (content instanceof Node) {
      __append(container, content);
    } else if (typeof content === 'string') {
      container.textContent = content;
    }
  } else {
    // Default: user silhouette icon
    const iconSpan = __element('span');
    iconSpan.innerHTML = getUserIcon(iconSize);
    __append(container, iconSpan);
  }
}
