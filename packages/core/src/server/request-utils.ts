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
    headers: Object.fromEntries(request.headers),
    raw: request,
  };
}

export async function parseBody(request: Request): Promise<unknown> {
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
