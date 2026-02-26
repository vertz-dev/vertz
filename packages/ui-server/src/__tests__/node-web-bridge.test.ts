import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import { describe, expect, it } from 'vitest';
import { createApiMiddleware, toNodeResponse, toWebRequest } from '../node-web-bridge';

function createMockReq(
  overrides: Partial<IncomingMessage> & { url: string; method?: string },
): IncomingMessage {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    method: 'GET',
    headers: {},
    socket: { encrypted: false } as Socket,
    ...overrides,
  }) as unknown as IncomingMessage;
}

interface MockRes {
  statusCode: number;
  body: string;
  headers: Record<string, string | string[]>;
  headersSent: boolean;
  writeHead: (status: number, headers?: Record<string, string>) => void;
  end: (body?: string) => void;
}

function createMockRes(): MockRes {
  const res: MockRes = {
    statusCode: 200,
    body: '',
    headers: {},
    headersSent: false,
    writeHead(status: number, headers?: Record<string, string>) {
      res.statusCode = status;
      if (headers) {
        Object.assign(res.headers, headers);
      }
      res.headersSent = true;
    },
    end(body?: string) {
      res.body = body ?? '';
    },
  };
  return res;
}

describe('toWebRequest', () => {
  it('converts GET request with correct URL, method, and headers', () => {
    const req = createMockReq({
      url: '/api/todos',
      method: 'GET',
      headers: { host: 'localhost:3000', 'content-type': 'application/json' },
    });

    const webReq = toWebRequest(req);

    expect(webReq.method).toBe('GET');
    expect(webReq.url).toBe('http://localhost:3000/api/todos');
    expect(webReq.headers.get('content-type')).toBe('application/json');
    expect(webReq.headers.get('host')).toBe('localhost:3000');
  });

  it('joins array headers with ", "', () => {
    const req = createMockReq({
      url: '/api/todos',
      headers: {
        host: 'localhost:3000',
        'set-cookie': ['a=1', 'b=2'],
      } as unknown as IncomingMessage['headers'],
    });

    const webReq = toWebRequest(req);

    expect(webReq.headers.get('set-cookie')).toBe('a=1, b=2');
  });

  it('uses default port when Host header is missing', () => {
    const req = createMockReq({
      url: '/api/todos',
      headers: {},
    });

    const webReq = toWebRequest(req);
    expect(webReq.url).toBe('http://localhost:3000/api/todos');
  });

  it('uses custom port when Host header is missing', () => {
    const req = createMockReq({
      url: '/api/todos',
      headers: {},
    });

    const webReq = toWebRequest(req, 8080);
    expect(webReq.url).toBe('http://localhost:8080/api/todos');
  });
});

describe('toNodeResponse', () => {
  it('sets status code and headers on Node response', async () => {
    const res = createMockRes();
    const webResponse = new Response('OK', {
      status: 201,
      headers: { 'content-type': 'application/json', 'x-custom': 'value' },
    });

    await toNodeResponse(res as unknown as ServerResponse, webResponse);

    expect(res.statusCode).toBe(201);
    expect(res.headers['content-type']).toBe('application/json');
    expect(res.headers['x-custom']).toBe('value');
  });

  it('writes response body', async () => {
    const res = createMockRes();
    const webResponse = new Response('{"id":1}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

    await toNodeResponse(res as unknown as ServerResponse, webResponse);

    expect(res.body).toBe('{"id":1}');
  });
});

describe('createApiMiddleware', () => {
  it('calls handler for requests matching pathPrefix', async () => {
    const handler = async (_req: Request) =>
      new Response('{"ok":true}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    const middleware = createApiMiddleware(handler);
    const req = createMockReq({
      url: '/api/todos',
      method: 'GET',
      headers: { host: 'localhost:3000' },
    });
    const res = createMockRes();
    let nextCalled = false;

    middleware(req, res as unknown as ServerResponse, () => {
      nextCalled = true;
    });

    // Allow async handler to complete
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('{"ok":true}');
  });

  it('calls next() for non-matching paths', () => {
    const handler = async () => new Response('should not reach');
    const middleware = createApiMiddleware(handler);
    const req = createMockReq({
      url: '/static/app.js',
      method: 'GET',
      headers: { host: 'localhost:3000' },
    });
    const res = createMockRes();
    let nextCalled = false;

    middleware(req, res as unknown as ServerResponse, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(res.body).toBe('');
  });

  it('calls next() for /api/openapi.json', () => {
    const handler = async () => new Response('should not reach');
    const middleware = createApiMiddleware(handler);
    const req = createMockReq({
      url: '/api/openapi.json',
      method: 'GET',
      headers: { host: 'localhost:3000' },
    });
    const res = createMockRes();
    let nextCalled = false;

    middleware(req, res as unknown as ServerResponse, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
  });

  it('buffers POST body and forwards it', async () => {
    let receivedBody = '';
    const handler = async (req: Request) => {
      receivedBody = await req.text();
      return new Response('created', { status: 201 });
    };
    const middleware = createApiMiddleware(handler);
    const req = createMockReq({
      url: '/api/todos',
      method: 'POST',
      headers: {
        host: 'localhost:3000',
        'content-type': 'application/json',
      },
    });
    const res = createMockRes();

    middleware(req, res as unknown as ServerResponse, () => {});

    // Simulate body chunks
    req.emit('data', Buffer.from('{"title":'));
    req.emit('data', Buffer.from('"Buy milk"}'));
    req.emit('end');

    // Allow async handler to complete
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(receivedBody).toBe('{"title":"Buy milk"}');
    expect(res.statusCode).toBe(201);
    expect(res.body).toBe('created');
  });

  it('responds with 500 JSON on handler error', async () => {
    const handler = async () => {
      throw new Error('Database connection failed');
    };
    const middleware = createApiMiddleware(handler);
    const req = createMockReq({
      url: '/api/todos',
      method: 'GET',
      headers: { host: 'localhost:3000' },
    });
    const res = createMockRes();

    middleware(req, res as unknown as ServerResponse, () => {});

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(res.statusCode).toBe(500);
    expect(res.headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('InternalError');
    expect(body.error.message).toContain('Database connection failed');
  });

  it('uses custom pathPrefix', async () => {
    const handler = async () => new Response('custom', { status: 200 });
    const middleware = createApiMiddleware(handler, { pathPrefix: '/v2/' });
    const req = createMockReq({
      url: '/v2/todos',
      method: 'GET',
      headers: { host: 'localhost:3000' },
    });
    const res = createMockRes();
    let nextCalled = false;

    middleware(req, res as unknown as ServerResponse, () => {
      nextCalled = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('custom');
  });
});
