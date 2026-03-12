// ---------------------------------------------------------------------------
// Dev-mode image proxy for /_vertz/image route.
// Fetches the original image without transformation (no cf.image in dev).
// ---------------------------------------------------------------------------

function jsonError(error: string, status: number): Response {
  return new Response(JSON.stringify({ error, status }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const FETCH_TIMEOUT_MS = 10_000;

export async function handleDevImageProxy(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const sourceUrl = url.searchParams.get('url');

  if (!sourceUrl) {
    return jsonError('Missing required "url" parameter', 400);
  }

  let parsed: URL;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    return jsonError('Invalid "url" parameter', 400);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return jsonError('Only HTTP(S) URLs are allowed', 400);
  }

  let response: Response;
  try {
    response = await fetch(sourceUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      return jsonError('Image fetch timed out', 504);
    }
    return jsonError('Failed to fetch image', 502);
  }

  if (!response.ok) {
    return jsonError(`Upstream returned status ${response.status}`, 502);
  }

  const contentType = response.headers.get('Content-Type') ?? 'application/octet-stream';

  return new Response(response.body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
    },
  });
}
