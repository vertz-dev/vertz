import { coerceFormDataToSchema } from '@vertz/schema';
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

type SchemaLike = { parse(value: unknown): { ok: boolean; data?: unknown; error?: unknown } };

export interface ParseBodyOptions {
  maxBodySize?: number;
  /**
   * Schema used to coerce string-valued form fields (boolean/number/BigInt/Date)
   * to their expected types. Applied to both `application/x-www-form-urlencoded`
   * and `multipart/form-data` bodies. Has no effect on JSON/text/XML bodies.
   */
  coerceSchema?: SchemaLike;
}

export async function parseBody(
  request: Request,
  options: ParseBodyOptions | number = DEFAULT_MAX_BODY_SIZE,
): Promise<unknown> {
  const opts: ParseBodyOptions =
    typeof options === 'number' ? { maxBodySize: options } : (options ?? {});
  const maxBodySize = opts.maxBodySize ?? DEFAULT_MAX_BODY_SIZE;
  const coerceSchema = opts.coerceSchema;

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
    const params = new URLSearchParams(decodedBody);
    return coerceFormDataToSchema(params, coerceSchema ?? null);
  }

  if (contentType.includes('multipart/form-data')) {
    // Read bytes via `readBodyBytes` first so the streaming byte-budget check
    // applies even when the client omits `content-length` (chunked transfer).
    // Then hand the captured bytes to the platform's multipart parser through
    // a synthetic Response (Response supports construction from bytes, whereas
    // Request does not accept the raw Headers object in every runtime).
    const rawBody = await readBodyBytes(request, maxBodySize);
    if (!rawBody) return coerceFormDataToSchema(new FormData(), coerceSchema ?? null);
    let formData: FormData;
    try {
      const blob = new Blob([rawBody as BlobPart], { type: contentType });
      const surrogate = new Response(blob);
      formData = await surrogate.formData();
    } catch {
      throw new BadRequestException('Invalid multipart body');
    }
    return coerceFormDataToSchema(formData, coerceSchema ?? null);
  }

  return undefined;
}
