import { describe, expect, it, vi } from 'vitest';
import { FetchClient } from './client';
import { FetchError } from './errors';

function createStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

describe('FetchClient.requestStream (SSE)', () => {
  it('yields parsed SSE data events', async () => {
    const sseBody = 'data: {"id":1,"message":"hello"}\n\ndata: {"id":2,"message":"world"}\n\n';
    const stream = createStream([sseBody]);

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );

    const client = new FetchClient({
      baseURL: 'http://localhost:3000',
      fetch: mockFetch,
    });

    const events: unknown[] = [];
    for await (const event of client.requestStream({
      method: 'GET',
      path: '/api/events',
      format: 'sse',
    })) {
      events.push(event);
    }

    expect(events).toEqual([
      { id: 1, message: 'hello' },
      { id: 2, message: 'world' },
    ]);
  });

  it('handles SSE events split across chunks', async () => {
    const stream = createStream(['data: {"id":1}\n', '\ndata: {"id":2}\n\n']);

    const mockFetch = vi.fn().mockResolvedValue(new Response(stream, { status: 200 }));

    const client = new FetchClient({
      baseURL: 'http://localhost:3000',
      fetch: mockFetch,
    });

    const events: unknown[] = [];
    for await (const event of client.requestStream({
      method: 'GET',
      path: '/api/events',
      format: 'sse',
    })) {
      events.push(event);
    }

    expect(events).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('ignores non-data SSE fields (event, id, retry)', async () => {
    const sseBody = 'event: update\nid: 42\nretry: 3000\ndata: {"type":"update"}\n\n';
    const stream = createStream([sseBody]);
    const mockFetch = vi.fn().mockResolvedValue(new Response(stream, { status: 200 }));

    const client = new FetchClient({
      baseURL: 'http://localhost:3000',
      fetch: mockFetch,
    });

    const events: unknown[] = [];
    for await (const event of client.requestStream({
      method: 'GET',
      path: '/api/events',
      format: 'sse',
    })) {
      events.push(event);
    }

    expect(events).toEqual([{ type: 'update' }]);
  });

  it('throws on non-OK response', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' }));

    const client = new FetchClient({
      baseURL: 'http://localhost:3000',
      fetch: mockFetch,
    });

    const events: unknown[] = [];
    await expect(async () => {
      for await (const event of client.requestStream({
        method: 'GET',
        path: '/api/events',
        format: 'sse',
      })) {
        events.push(event);
      }
    }).rejects.toThrow(FetchError);

    expect(events).toEqual([]);
  });

  it('sets Accept header for SSE', async () => {
    const stream = createStream([]);
    const mockFetch = vi.fn().mockResolvedValue(new Response(stream, { status: 200 }));

    const client = new FetchClient({
      baseURL: 'http://localhost:3000',
      fetch: mockFetch,
    });

    for await (const _ of client.requestStream({
      method: 'GET',
      path: '/api/events',
      format: 'sse',
    })) {
      // consume
    }

    const [request] = mockFetch.mock.calls[0] as [Request];
    expect(request.headers.get('Accept')).toBe('text/event-stream');
  });
});

describe('FetchClient.requestStream (NDJSON)', () => {
  it('yields parsed NDJSON lines', async () => {
    const ndjsonBody = '{"id":1,"name":"alice"}\n{"id":2,"name":"bob"}\n';
    const stream = createStream([ndjsonBody]);
    const mockFetch = vi.fn().mockResolvedValue(new Response(stream, { status: 200 }));

    const client = new FetchClient({
      baseURL: 'http://localhost:3000',
      fetch: mockFetch,
    });

    const items: unknown[] = [];
    for await (const item of client.requestStream({
      method: 'GET',
      path: '/api/stream',
      format: 'ndjson',
    })) {
      items.push(item);
    }

    expect(items).toEqual([
      { id: 1, name: 'alice' },
      { id: 2, name: 'bob' },
    ]);
  });

  it('handles NDJSON split across chunks', async () => {
    const stream = createStream(['{"id":1}\n{"id', '":2}\n']);
    const mockFetch = vi.fn().mockResolvedValue(new Response(stream, { status: 200 }));

    const client = new FetchClient({
      baseURL: 'http://localhost:3000',
      fetch: mockFetch,
    });

    const items: unknown[] = [];
    for await (const item of client.requestStream({
      method: 'GET',
      path: '/api/stream',
      format: 'ndjson',
    })) {
      items.push(item);
    }

    expect(items).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('skips blank lines in NDJSON', async () => {
    const ndjsonBody = '{"id":1}\n\n{"id":2}\n';
    const stream = createStream([ndjsonBody]);
    const mockFetch = vi.fn().mockResolvedValue(new Response(stream, { status: 200 }));

    const client = new FetchClient({
      baseURL: 'http://localhost:3000',
      fetch: mockFetch,
    });

    const items: unknown[] = [];
    for await (const item of client.requestStream({
      method: 'GET',
      path: '/api/stream',
      format: 'ndjson',
    })) {
      items.push(item);
    }

    expect(items).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('sets Accept header for NDJSON', async () => {
    const stream = createStream([]);
    const mockFetch = vi.fn().mockResolvedValue(new Response(stream, { status: 200 }));

    const client = new FetchClient({
      baseURL: 'http://localhost:3000',
      fetch: mockFetch,
    });

    for await (const _ of client.requestStream({
      method: 'GET',
      path: '/api/stream',
      format: 'ndjson',
    })) {
      // consume
    }

    const [request] = mockFetch.mock.calls[0] as [Request];
    expect(request.headers.get('Accept')).toBe('application/x-ndjson');
  });
});

describe('FetchClient.requestStream hooks', () => {
  it('calls onStreamStart, onStreamChunk, and onStreamEnd hooks', async () => {
    const stream = createStream(['data: {"id":1}\n\ndata: {"id":2}\n\n']);
    const mockFetch = vi.fn().mockResolvedValue(new Response(stream, { status: 200 }));

    const onStreamStart = vi.fn();
    const onStreamChunk = vi.fn();
    const onStreamEnd = vi.fn();

    const client = new FetchClient({
      baseURL: 'http://localhost:3000',
      hooks: { onStreamStart, onStreamChunk, onStreamEnd },
      fetch: mockFetch,
    });

    const events: unknown[] = [];
    for await (const event of client.requestStream({
      method: 'GET',
      path: '/api/events',
      format: 'sse',
    })) {
      events.push(event);
    }

    expect(onStreamStart).toHaveBeenCalledOnce();
    expect(onStreamChunk).toHaveBeenCalledTimes(2);
    expect(onStreamChunk).toHaveBeenCalledWith({ id: 1 });
    expect(onStreamChunk).toHaveBeenCalledWith({ id: 2 });
    expect(onStreamEnd).toHaveBeenCalledOnce();
  });
});
