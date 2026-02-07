import { describe, it, expect } from 'vitest';
import { parseRequest, parseBody } from '../request-utils';
import { BadRequestException } from '../../exceptions';

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
});
