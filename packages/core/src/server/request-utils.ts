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

async function readBodyBytes(request: Request, maxBodySize: number): Promise<Uint8Array | null> {
  const contentLengthHeader = request.headers.get('content-length');
  const contentLength = contentLengthHeader ? Number.parseInt(contentLengthHeader, 10) : 0;

  if (maxBodySize > 0 && Number.isFinite(contentLength) && contentLength > maxBodySize) {
    throw new BadRequestException('Request body too large');
  }

  if (!request.body) {
    return null;
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    totalBytes += value.byteLength;
    if (maxBodySize > 0 && totalBytes > maxBodySize) {
      await reader.cancel();
      throw new BadRequestException('Request body too large');
    }

    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return body;
}

export async function parseBody(
  request: Request,
  maxBodySize: number = DEFAULT_MAX_BODY_SIZE,
): Promise<unknown> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const rawBody = await readBodyBytes(request, maxBodySize);
    const decodedBody = rawBody ? new TextDecoder().decode(rawBody) : '';
    try {
      return JSON.parse(decodedBody);
    } catch {
      throw new BadRequestException('Invalid JSON body');
    }
  }

  if (contentType.includes('application/xml')) {
    const rawBody = await readBodyBytes(request, maxBodySize);
    const decodedBody = rawBody ? new TextDecoder().decode(rawBody) : '';
    return decodedBody;
  }

  if (contentType.startsWith('text/')) {
    const rawBody = await readBodyBytes(request, maxBodySize);
    const decodedBody = rawBody ? new TextDecoder().decode(rawBody) : '';
    return decodedBody;
  }

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const rawBody = await readBodyBytes(request, maxBodySize);
    const decodedBody = rawBody ? new TextDecoder().decode(rawBody) : '';
    return Object.fromEntries(new URLSearchParams(decodedBody));
  }

  return undefined;
}
