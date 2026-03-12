import { buildOptimizedUrl } from './config';
import type { ImageProps } from './types';

/** Build-time-only props that should not be rendered as HTML attributes. */
const BUILD_ONLY_PROPS = new Set([
  'src',
  'width',
  'height',
  'alt',
  'class',
  'style',
  'loading',
  'decoding',
  'fetchpriority',
  'priority',
  'quality',
  'fit',
  'pictureClass',
]);

export function Image(props: ImageProps): HTMLImageElement;
export function Image({
  src,
  width,
  height,
  alt,
  class: className,
  style,
  loading = 'lazy',
  decoding = 'async',
  fetchpriority,
  priority,
  quality = 80,
  fit = 'cover',
  pictureClass: _pictureClass,
  ...rest
}: ImageProps) {
  const resolvedLoading = priority ? 'eager' : loading;
  const resolvedDecoding = priority ? 'sync' : decoding;
  const resolvedFetchpriority = priority ? 'high' : fetchpriority;

  const optimizedSrc = buildOptimizedUrl(src, width, height, quality, fit);

  const el = document.createElement('img');
  el.setAttribute('src', optimizedSrc ?? src);
  el.setAttribute('width', String(width));
  el.setAttribute('height', String(height));
  el.setAttribute('alt', alt);
  el.setAttribute('loading', resolvedLoading);
  el.setAttribute('decoding', resolvedDecoding);

  if (resolvedFetchpriority) el.setAttribute('fetchpriority', resolvedFetchpriority);
  if (className) el.setAttribute('class', className);
  if (style) el.setAttribute('style', style);

  // Pass-through remaining HTML attributes (data-*, aria-*, id, etc.)
  for (const [key, value] of Object.entries(rest)) {
    if (!BUILD_ONLY_PROPS.has(key) && value != null) {
      el.setAttribute(key, String(value));
    }
  }

  return el;
}
