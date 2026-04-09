import { describe, expect, it } from '@vertz/test';
import { BadRequestException } from '../../exceptions';
import { parseBody, parseRequest } from '../request-utils';

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
});
