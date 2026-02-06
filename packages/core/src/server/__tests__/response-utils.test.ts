import { describe, it, expect } from 'vitest';
import { createJsonResponse, createErrorResponse } from '../response-utils';

describe('createJsonResponse', () => {
  it('creates a JSON response with default 200 status', () => {
    const response = createJsonResponse({ message: 'hello' });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json');
  });

  it('creates a JSON response with custom status', async () => {
    const response = createJsonResponse({ id: 1 }, 201);

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toEqual({ id: 1 });
  });

  it('merges custom headers', () => {
    const response = createJsonResponse({ ok: true }, 200, {
      'x-request-id': 'abc',
    });

    expect(response.headers.get('x-request-id')).toBe('abc');
    expect(response.headers.get('content-type')).toBe('application/json');
  });
});

describe('createErrorResponse', () => {
  it('creates an error response from a VertzException', async () => {
    const response = createErrorResponse({
      name: 'NotFoundException',
      message: 'User not found',
      statusCode: 404,
      code: 'NotFoundException',
      toJSON: () => ({
        error: 'NotFoundException',
        message: 'User not found',
        statusCode: 404,
        code: 'NotFoundException',
      }),
    });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe('NotFoundException');
    expect(body.message).toBe('User not found');
  });

  it('creates a generic 500 error for unknown errors', async () => {
    const response = createErrorResponse(new Error('something broke'));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe('InternalServerError');
    expect(body.message).toBe('Internal Server Error');
  });
});
