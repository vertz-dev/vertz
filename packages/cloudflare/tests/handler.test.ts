import type { AppBuilder } from '@vertz/core';
import { describe, expect, it, vi } from 'vitest';
import { createHandler } from '../src/handler.js';

describe('createHandler', () => {
  it('returns proper Worker export with fetch method', () => {
    const mockHandler = vi.fn().mockResolvedValue(new Response('OK'));
    const mockApp = {
      handler: mockHandler,
    } as unknown as AppBuilder;

    const worker = createHandler(mockApp);

    expect(worker).toHaveProperty('fetch');
    expect(typeof worker.fetch).toBe('function');
  });

  it('forwards requests to the vertz handler', async () => {
    const mockResponse = new Response('Hello from handler');
    const mockHandler = vi.fn().mockResolvedValue(mockResponse);
    const mockApp = {
      handler: mockHandler,
    } as unknown as AppBuilder;

    const worker = createHandler(mockApp);
    const request = new Request('https://example.com/api/test');
    const mockEnv = {};
    const mockCtx = {} as ExecutionContext;

    const response = await worker.fetch(request, mockEnv, mockCtx);

    expect(mockHandler).toHaveBeenCalledWith(request);
    expect(response).toBe(mockResponse);
  });

  it('strips basePath prefix from pathname', async () => {
    const mockHandler = vi.fn().mockResolvedValue(new Response('OK'));
    const mockApp = {
      handler: mockHandler,
    } as unknown as AppBuilder;

    const worker = createHandler(mockApp, { basePath: '/api' });
    const request = new Request('https://example.com/api/users');
    const mockEnv = {};
    const mockCtx = {} as ExecutionContext;

    await worker.fetch(request, mockEnv, mockCtx);

    expect(mockHandler).toHaveBeenCalledTimes(1);
    const calledRequest = mockHandler.mock.calls[0][0] as Request;
    const url = new URL(calledRequest.url);
    expect(url.pathname).toBe('/users');
  });

  it('strips basePath with trailing slash correctly', async () => {
    const mockHandler = vi.fn().mockResolvedValue(new Response('OK'));
    const mockApp = {
      handler: mockHandler,
    } as unknown as AppBuilder;

    const worker = createHandler(mockApp, { basePath: '/api' });
    const request = new Request('https://example.com/api/');
    const mockEnv = {};
    const mockCtx = {} as ExecutionContext;

    await worker.fetch(request, mockEnv, mockCtx);

    const calledRequest = mockHandler.mock.calls[0][0] as Request;
    const url = new URL(calledRequest.url);
    expect(url.pathname).toBe('/');
  });

  it('handles basePath when pathname does not start with basePath', async () => {
    const mockHandler = vi.fn().mockResolvedValue(new Response('OK'));
    const mockApp = {
      handler: mockHandler,
    } as unknown as AppBuilder;

    const worker = createHandler(mockApp, { basePath: '/api' });
    const request = new Request('https://example.com/other/path');
    const mockEnv = {};
    const mockCtx = {} as ExecutionContext;

    await worker.fetch(request, mockEnv, mockCtx);

    const calledRequest = mockHandler.mock.calls[0][0] as Request;
    const url = new URL(calledRequest.url);
    expect(url.pathname).toBe('/other/path');
  });

  it('preserves query parameters when stripping basePath', async () => {
    const mockHandler = vi.fn().mockResolvedValue(new Response('OK'));
    const mockApp = {
      handler: mockHandler,
    } as unknown as AppBuilder;

    const worker = createHandler(mockApp, { basePath: '/api' });
    const request = new Request('https://example.com/api/users?page=1&limit=10');
    const mockEnv = {};
    const mockCtx = {} as ExecutionContext;

    await worker.fetch(request, mockEnv, mockCtx);

    const calledRequest = mockHandler.mock.calls[0][0] as Request;
    const url = new URL(calledRequest.url);
    expect(url.pathname).toBe('/users');
    expect(url.searchParams.get('page')).toBe('1');
    expect(url.searchParams.get('limit')).toBe('10');
  });

  it('preserves request headers and method', async () => {
    const mockHandler = vi.fn().mockResolvedValue(new Response('OK'));
    const mockApp = {
      handler: mockHandler,
    } as unknown as AppBuilder;

    const worker = createHandler(mockApp, { basePath: '/api' });
    const request = new Request('https://example.com/api/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token123',
      },
    });
    const mockEnv = {};
    const mockCtx = {} as ExecutionContext;

    await worker.fetch(request, mockEnv, mockCtx);

    const calledRequest = mockHandler.mock.calls[0][0] as Request;
    expect(calledRequest.method).toBe('POST');
    expect(calledRequest.headers.get('Content-Type')).toBe('application/json');
    expect(calledRequest.headers.get('Authorization')).toBe('Bearer token123');
  });

  it('works without basePath option', async () => {
    const mockResponse = new Response('No basePath');
    const mockHandler = vi.fn().mockResolvedValue(mockResponse);
    const mockApp = {
      handler: mockHandler,
    } as unknown as AppBuilder;

    const worker = createHandler(mockApp);
    const request = new Request('https://example.com/api/test');
    const mockEnv = {};
    const mockCtx = {} as ExecutionContext;

    const response = await worker.fetch(request, mockEnv, mockCtx);

    expect(mockHandler).toHaveBeenCalledWith(request);
    expect(response).toBe(mockResponse);
    const calledRequest = mockHandler.mock.calls[0][0] as Request;
    expect(new URL(calledRequest.url).pathname).toBe('/api/test');
  });

  it('returns 500 response when handler throws an error', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const testError = new Error('Test error');
    const mockHandler = vi.fn().mockRejectedValue(testError);
    const mockApp = {
      handler: mockHandler,
    } as unknown as AppBuilder;

    const worker = createHandler(mockApp);
    const request = new Request('https://example.com/api/test');
    const mockEnv = {};
    const mockCtx = {} as ExecutionContext;

    const response = await worker.fetch(request, mockEnv, mockCtx);

    expect(mockHandler).toHaveBeenCalledWith(request);
    expect(response.status).toBe(500);
    expect(await response.text()).toBe('Internal Server Error');
    expect(consoleErrorSpy).toHaveBeenCalledWith('Unhandled error in worker:', testError);

    consoleErrorSpy.mockRestore();
  });
});
