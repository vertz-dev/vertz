import { describe, expect, it } from '@vertz/test';
import { s } from '@vertz/schema';
import { BadRequestException } from '../../exceptions';
import { parseBody, parseRequest } from '../request-utils';

/**
 * Build a Request that carries a multipart/form-data body + correct
 * content-type (with boundary). `new Request(url, { body: FormData })`
 * does not auto-populate the content-type header in every runtime/test env,
 * so we serialize manually with a fixed boundary.
 */
async function makeMultipartRequest(url: string, fd: FormData): Promise<Request> {
  const boundary = '----vertzFormBoundary' + Math.random().toString(36).slice(2);
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  for (const [name, value] of fd.entries()) {
    parts.push(encoder.encode(`--${boundary}\r\n`));
    if (typeof value === 'string') {
      parts.push(
        encoder.encode(`Content-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`),
      );
    } else {
      const file = value;
      parts.push(
        encoder.encode(
          `Content-Disposition: form-data; name="${name}"; filename="${file.name}"\r\n` +
            `Content-Type: ${file.type || 'application/octet-stream'}\r\n\r\n`,
        ),
      );
      parts.push(new Uint8Array(await file.arrayBuffer()));
      parts.push(encoder.encode('\r\n'));
    }
  }
  parts.push(encoder.encode(`--${boundary}--\r\n`));
  const totalBytes = parts.reduce((sum, p) => sum + p.byteLength, 0);
  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const p of parts) {
    body.set(p, offset);
    offset += p.byteLength;
  }
  return new Request(url, {
    method: 'POST',
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
      'content-length': String(body.byteLength),
    },
    body,
  });
}

describe('parseRequest', () => {
  it('extracts method, path, query, and headers from a Request', () => {
    const request = new Request('http://localhost:3000/users?page=1&limit=20', {
      method: 'GET',
      headers: { 'content-type': 'application/json', 'x-custom': 'value' },
    });

    const parsed = parseRequest(request);

    expect(parsed.method).toBe('GET');
    expect(parsed.path).toBe('/users');
    expect(parsed.query).toEqual({ page: '1', limit: '20' });
    expect(parsed.headers['content-type']).toBe('application/json');
    expect(parsed.headers['x-custom']).toBe('value');
  });

  it('preserves the raw Request reference', () => {
    const request = new Request('http://localhost:3000/test');
    const parsed = parseRequest(request);

    expect(parsed.raw).toBe(request);
  });

  it('combines duplicate headers per HTTP spec', () => {
    const headers = new Headers();
    headers.append('accept', 'text/html');
    headers.append('accept', 'application/json');
    const request = new Request('http://localhost:3000/test', { headers });
    const parsed = parseRequest(request);

    // Per HTTP spec, duplicate headers are combined with ", "
    expect(parsed.headers.accept).toBe('text/html, application/json');
  });

  it('handles path without query string', () => {
    const request = new Request('http://localhost:3000/api/v1/users');
    const parsed = parseRequest(request);

    expect(parsed.path).toBe('/api/v1/users');
    expect(parsed.query).toEqual({});
  });

  it('normalizes mixed-case header names to lowercase', () => {
    const request = new Request('http://localhost:3000/api', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token123',
        'Content-Type': 'application/json',
        'X-Custom-Header': 'custom-value',
      },
    });

    const parsed = parseRequest(request);

    expect(parsed.headers.authorization).toBe('Bearer token123');
    expect(parsed.headers['content-type']).toBe('application/json');
    expect(parsed.headers['x-custom-header']).toBe('custom-value');
    // Verify uppercase keys do not exist
    expect(parsed.headers.Authorization).toBeUndefined();
    expect(parsed.headers['Content-Type']).toBeUndefined();
    expect(parsed.headers['X-Custom-Header']).toBeUndefined();
  });
});

describe('parseBody', () => {
  it('parses JSON body', async () => {
    const request = new Request('http://localhost:3000/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Jane', age: 30 }),
    });

    const body = await parseBody(request);

    expect(body).toEqual({ name: 'Jane', age: 30 });
  });

  it('parses form-urlencoded body', async () => {
    const request = new Request('http://localhost:3000/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'username=jane&password=secret',
    });

    const body = await parseBody(request);

    expect(body).toEqual({ username: 'jane', password: 'secret' });
  });

  it('parses text/plain body', async () => {
    const request = new Request('http://localhost:3000/webhook', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'hello world',
    });

    const body = await parseBody(request);

    expect(body).toBe('hello world');
  });

  it('throws BadRequestException for malformed JSON', async () => {
    const request = new Request('http://localhost:3000/api', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{invalid json',
    });

    await expect(parseBody(request)).rejects.toThrow(BadRequestException);
  });

  it('handles charset in content-type for JSON', async () => {
    const request = new Request('http://localhost:3000/api', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ test: true }),
    });

    const body = await parseBody(request);
    expect(body).toEqual({ test: true });
  });

  it('returns undefined for requests without body content-type', async () => {
    const request = new Request('http://localhost:3000/test', { method: 'GET' });

    const body = await parseBody(request);

    expect(body).toBeUndefined();
  });

  it('throws BadRequestException when Content-Length exceeds maxBodySize', async () => {
    const request = new Request('http://localhost:3000/api', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': '2000',
      },
      body: JSON.stringify({ data: 'x'.repeat(100) }),
    });

    await expect(parseBody(request, 1024)).rejects.toThrow(BadRequestException);
    await expect(parseBody(request, 1024)).rejects.toThrow('Request body too large');
  });

  it('parses body normally when Content-Length is within maxBodySize', async () => {
    const payload = { name: 'Alice' };
    const jsonBody = JSON.stringify(payload);
    const request = new Request('http://localhost:3000/api', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': String(jsonBody.length),
      },
      body: jsonBody,
    });

    const body = await parseBody(request, 10 * 1024 * 1024);

    expect(body).toEqual(payload);
  });

  it('uses default 10MB maxBodySize when no limit is specified', async () => {
    const request = new Request('http://localhost:3000/api', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': String(11 * 1024 * 1024),
      },
      body: JSON.stringify({ data: 'test' }),
    });

    await expect(parseBody(request)).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when a streamed body exceeds maxBodySize without Content-Length', async () => {
    const encoder = new TextEncoder();
    const createRequest = () =>
      new Request('http://localhost:3000/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode('{"data":"'));
            controller.enqueue(encoder.encode('x'.repeat(128)));
            controller.enqueue(encoder.encode('"}'));
            controller.close();
          },
        }),
        duplex: 'half',
      });

    await expect(parseBody(createRequest(), 64)).rejects.toThrow(BadRequestException);
    await expect(parseBody(createRequest(), 64)).rejects.toThrow('Request body too large');
  });

  it('treats text requests with no body as an empty string', async () => {
    const request = new Request('http://localhost:3000/api', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
    });

    await expect(parseBody(request)).resolves.toBe('');
  });

  it('parses application/xml body as string', async () => {
    const xml = '<root><item>value</item></root>';
    const request = new Request('http://localhost:3000/api', {
      method: 'POST',
      headers: { 'content-type': 'application/xml' },
      body: xml,
    });

    const body = await parseBody(request);
    expect(body).toBe(xml);
  });

  it('parses application/xml with charset as string', async () => {
    const xml = '<data/>';
    const request = new Request('http://localhost:3000/api', {
      method: 'POST',
      headers: { 'content-type': 'application/xml; charset=utf-8' },
      body: xml,
    });

    const body = await parseBody(request);
    expect(body).toBe(xml);
  });

  it('coerces urlencoded string fields to the schema shape when a coerceSchema is given', async () => {
    const request = new Request('http://localhost:3000/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'title=buy+milk&done=on&priority=3',
    });

    const schema = s.object({
      title: s.string(),
      done: s.boolean(),
      priority: s.number(),
    });

    const body = await parseBody(request, { coerceSchema: schema });

    expect(body).toEqual({ title: 'buy milk', done: true, priority: 3 });
  });

  it('leaves unchecked boolean fields as false when the key is absent (urlencoded)', async () => {
    const request = new Request('http://localhost:3000/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'title=buy+milk',
    });

    const schema = s.object({
      title: s.string(),
      done: s.boolean(),
    });

    const body = await parseBody(request, { coerceSchema: schema });

    expect(body).toEqual({ title: 'buy milk', done: false });
  });

  it('throws BadRequestException when multipart Content-Length exceeds maxBodySize', async () => {
    const fd = new FormData();
    fd.append('blob', 'x'.repeat(512));
    const request = await makeMultipartRequest('http://localhost:3000/upload', fd);

    await expect(parseBody(request, { maxBodySize: 32 })).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException for malformed multipart bodies', async () => {
    // `parseBody` feeds the raw bytes back through `Response.formData()` — the
    // platform parser must see the mismatch between the declared boundary and
    // the body content and throw, which our catch converts to 400. Runtimes
    // that silently return an empty FormData would cause this test to fail
    // with "expected throw" instead of passing trivially, which is the intent.
    const request = new Request('http://localhost:3000/upload', {
      method: 'POST',
      headers: {
        // boundary is declared but the body is not a valid multipart payload
        'content-type': 'multipart/form-data; boundary=----brokenBoundary',
      },
      body: 'not a valid multipart body',
    });

    await expect(parseBody(request)).rejects.toThrow(BadRequestException);
  });

  it('enforces maxBodySize on streamed multipart bodies without Content-Length', async () => {
    // Simulate a chunked-transfer multipart body — no Content-Length header.
    // The streaming byte-budget check in readBodyBytes must fire, not wait for
    // request.formData() to buffer the entire payload.
    const encoder = new TextEncoder();
    const request = new Request('http://localhost:3000/upload', {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=----b' },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('------b\r\n'));
          controller.enqueue(encoder.encode('Content-Disposition: form-data; name="x"\r\n\r\n'));
          controller.enqueue(encoder.encode('x'.repeat(512)));
          controller.enqueue(encoder.encode('\r\n------b--\r\n'));
          controller.close();
        },
      }),
      duplex: 'half',
    });

    await expect(parseBody(request, { maxBodySize: 32 })).rejects.toThrow(BadRequestException);
  });
});
