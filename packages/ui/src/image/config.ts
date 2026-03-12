let optimizerBaseUrl: string | null = null;

export function configureImageOptimizer(baseUrl: string): void {
  optimizerBaseUrl = baseUrl;
}

/** @internal */
export function isOptimizerConfigured(): boolean {
  return optimizerBaseUrl !== null;
}

/** @internal — test-only. Resets optimizer state. */
export function resetImageOptimizer_TEST_ONLY(): void {
  optimizerBaseUrl = null;
}

export function buildOptimizedUrl(
  src: string,
  width: number,
  height: number,
  quality: number,
  fit: 'cover' | 'contain' | 'fill',
): string | null {
  if (!optimizerBaseUrl) return null;
  // Only rewrite absolute HTTP(S) URLs — positive check
  if (!src.startsWith('http://') && !src.startsWith('https://')) return null;

  const params = new URLSearchParams({
    url: src,
    w: String(width),
    h: String(height),
    q: String(quality),
    fit,
  });
  return `${optimizerBaseUrl}?${params}`;
}
