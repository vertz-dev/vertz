// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImageOptimizerConfig {
  /** Required: exact hostnames allowed as image sources. SSRF protection. */
  allowedDomains: string[];

  /** Max output width in CSS pixels. Default: 3840 (4K). */
  maxWidth?: number;

  /** Max output height in CSS pixels. Default: 2160 (4K). */
  maxHeight?: number;

  /** Default image quality 1-100. Default: 80. */
  defaultQuality?: number;

  /** Cache TTL in seconds. Default: 31536000 (1 year). */
  cacheTtl?: number;

  /** Fetch timeout in ms. Default: 10000. */
  fetchTimeout?: number;
}

export type ImageOptimizerHandler = (request: Request) => Promise<Response>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonError(error: string, status: number): Response {
  return new Response(JSON.stringify({ error, status }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const IP_REGEX = /^(\d{1,3}\.){3}\d{1,3}$|^\[?[\da-fA-F:]+\]?$|^0x[\da-fA-F]+$|^\d{10,}$/;

function isIPAddress(hostname: string): boolean {
  // Strip brackets from IPv6
  const clean = hostname.replace(/^\[|\]$/g, '');
  return IP_REGEX.test(clean);
}

function isRedirect(status: number): boolean {
  return status >= 300 && status < 400;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function imageOptimizer(config: ImageOptimizerConfig): ImageOptimizerHandler {
  const {
    allowedDomains,
    maxWidth = 3840,
    maxHeight = 2160,
    defaultQuality = 80,
    cacheTtl = 31536000,
    fetchTimeout = 10000,
  } = config;

  const allowedSet = new Set(allowedDomains);

  return async (request: Request): Promise<Response> => {
    const requestUrl = new URL(request.url);
    const sourceUrl = requestUrl.searchParams.get('url');

    // --- Validate params ---
    if (!sourceUrl) {
      return jsonError('Missing required "url" parameter', 400);
    }

    const w = Number(requestUrl.searchParams.get('w'));
    const h = Number(requestUrl.searchParams.get('h'));

    if (!w || !h || Number.isNaN(w) || Number.isNaN(h)) {
      return jsonError('Missing or invalid "w" and "h" parameters', 400);
    }

    // --- Validate source URL ---
    let parsed: URL;
    try {
      parsed = new URL(sourceUrl);
    } catch {
      return jsonError('Invalid "url" parameter', 400);
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return jsonError('Only HTTP(S) URLs are allowed', 400);
    }

    if (parsed.username || parsed.password) {
      return jsonError('URLs with credentials are not allowed', 400);
    }

    if (isIPAddress(parsed.hostname)) {
      return jsonError('IP addresses are not allowed', 400);
    }

    // --- Domain validation (exact hostname match) ---
    if (!allowedSet.has(parsed.hostname)) {
      return jsonError(`Domain '${parsed.hostname}' is not in allowedDomains`, 403);
    }

    // --- Parse optional params ---
    const quality = Number(requestUrl.searchParams.get('q')) || defaultQuality;
    const fit = requestUrl.searchParams.get('fit') ?? 'cover';
    const clampedWidth = Math.min(w, maxWidth);
    const clampedHeight = Math.min(h, maxHeight);

    // --- Fetch with cf.image ---
    let response: Response;
    try {
      // The cf.image property is a Cloudflare-specific extension to RequestInit.
      // We cast to RequestInit because the standard type doesn't include `cf`,
      // but Cloudflare Workers' global `fetch` accepts it at runtime.
      const fetchOptions: RequestInit = {
        redirect: 'manual',
        signal: AbortSignal.timeout(fetchTimeout),
      };
      (fetchOptions as Record<string, unknown>).cf = {
        image: {
          width: clampedWidth,
          height: clampedHeight,
          quality,
          fit,
          format: 'auto',
        },
      };
      response = await fetch(sourceUrl, fetchOptions);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        return jsonError('Source image fetch timed out', 504);
      }
      return jsonError('Failed to fetch source image', 502);
    }

    // --- Handle redirects ---
    if (isRedirect(response.status)) {
      return jsonError('Source image returned redirect (not followed for security)', 502);
    }

    // --- Handle non-200 responses ---
    if (response.status === 404) {
      return jsonError('Source image not found', 404);
    }

    if (!response.ok) {
      return jsonError(`Source image returned status ${response.status}`, 502);
    }

    // --- Validate content type ---
    const contentType = response.headers.get('Content-Type') ?? '';
    if (!contentType.startsWith('image/')) {
      return jsonError('Source URL did not return an image', 502);
    }

    // --- Determine optimization status ---
    const cfResized = response.headers.get('cf-resized');
    const optimized = cfResized ? 'cf' : 'passthrough';

    // --- Return optimized response ---
    return new Response(response.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': `public, max-age=${cacheTtl}, immutable`,
        'X-Vertz-Image-Optimized': optimized,
      },
    });
  };
}
