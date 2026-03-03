import { BadRequestException } from '../exceptions';

export interface ParsedRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  raw: Request;
}

export function parseRequest(request: Request): ParsedRequest {
  const url = new URL(request.url);

  return {
    method: request.method,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams),
    headers: Object.fromEntries([...request.headers].map(([k, v]) => [k.toLowerCase(), v])),
    raw: request,
  };
}

const DEFAULT_MAX_BODY_SIZE = 10 * 1024 * 1024; // 10MB

export async function parseBody(
  request: Request,
  maxBodySize: number = DEFAULT_MAX_BODY_SIZE,
): Promise<unknown> {
  const contentLength = parseInt(request.headers.get('content-length') ?? '0', 10);
  if (maxBodySize && contentLength > maxBodySize) {
    throw new BadRequestException('Request body too large');
  }

  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    try {
      return await request.json();
    } catch {
      throw new BadRequestException('Invalid JSON body');
    }
  }

  if (contentType.startsWith('text/')) {
    return request.text();
  }

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const text = await request.text();
    return Object.fromEntries(new URLSearchParams(text));
  }

  return undefined;
}
