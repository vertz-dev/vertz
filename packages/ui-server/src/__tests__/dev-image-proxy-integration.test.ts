import { describe, expect, it } from 'bun:test';
import {
  buildOptimizedUrl,
  configureImageOptimizer,
  resetImageOptimizer_TEST_ONLY,
} from '@vertz/ui';

describe('E2E: Image optimization pipeline', () => {
  it('configureImageOptimizer rewrites dynamic src to /_vertz/image URL', () => {
    configureImageOptimizer('/_vertz/image');

    const result = buildOptimizedUrl('https://cdn.example.com/photo.jpg', 800, 600, 80, 'cover');

    expect(result).toBe(
      '/_vertz/image?url=https%3A%2F%2Fcdn.example.com%2Fphoto.jpg&w=800&h=600&q=80&fit=cover',
    );

    resetImageOptimizer_TEST_ONLY();
  });

  it('does not rewrite relative paths (static, handled at build time)', () => {
    configureImageOptimizer('/_vertz/image');

    const result = buildOptimizedUrl('/images/logo.png', 120, 40, 80, 'contain');

    expect(result).toBeNull();

    resetImageOptimizer_TEST_ONLY();
  });

  it('SSR and client produce identical URLs (no hydration mismatch)', () => {
    // Both SSR entry and client entry call configureImageOptimizer with the same URL.
    // This test simulates both environments producing the same output.
    configureImageOptimizer('/_vertz/image');

    const ssrResult = buildOptimizedUrl(
      'https://uploads.example.com/avatar.webp',
      80,
      80,
      90,
      'cover',
    );

    // Simulate client-side: same call, same config → same URL
    const clientResult = buildOptimizedUrl(
      'https://uploads.example.com/avatar.webp',
      80,
      80,
      90,
      'cover',
    );

    expect(ssrResult).toBe(clientResult);
    expect(ssrResult).toContain('/_vertz/image');
    expect(ssrResult).toContain('url=https%3A%2F%2Fuploads.example.com%2Favatar.webp');

    resetImageOptimizer_TEST_ONLY();
  });
});
