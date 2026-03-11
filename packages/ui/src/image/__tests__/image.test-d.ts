/**
 * Type-level tests for Image component props.
 * Checked by `tsc --noEmit`, not by runtime tests.
 */

import { Image } from '../image';

// ─── Valid usage ─────────────────────────────────────────────

// All required props
Image({ src: '/photo.jpg', width: 80, height: 80, alt: 'Photo' });

// With optional props
Image({
  src: '/photo.jpg',
  width: 80,
  height: 80,
  alt: 'Photo',
  class: 'rounded',
  style: 'object-fit: cover',
  loading: 'eager',
  decoding: 'sync',
  fetchpriority: 'high',
  priority: true,
  quality: 60,
  fit: 'contain',
  pictureClass: 'wrapper',
});

// With pass-through attributes
Image({
  src: '/photo.jpg',
  width: 80,
  height: 80,
  alt: 'Photo',
  'data-testid': 'hero',
  'aria-hidden': 'true',
  id: 'hero-img',
});

// ─── Invalid usage ───────────────────────────────────────────

// @ts-expect-error — missing required 'alt' prop
Image({ src: '/photo.jpg', width: 80, height: 80 });

// @ts-expect-error — missing required 'width' prop
Image({ src: '/photo.jpg', height: 80, alt: 'Photo' });

// @ts-expect-error — missing required 'height' prop
Image({ src: '/photo.jpg', width: 80, alt: 'Photo' });

// @ts-expect-error — missing required 'src' prop
Image({ width: 80, height: 80, alt: 'Photo' });

// @ts-expect-error — invalid loading value
Image({ src: '/photo.jpg', width: 80, height: 80, alt: 'Photo', loading: 'auto' });
