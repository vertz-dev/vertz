import { VertzException } from '../exceptions';

export function createJsonResponse(
  data: unknown,
  status = 200,
  headers?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
  });
}

export function createErrorResponse(error: unknown): Response {
  if (error instanceof VertzException) {
    return createJsonResponse(error.toJSON(), error.statusCode);
  }

  return createJsonResponse(
    { error: { code: 'InternalServerError', message: 'Internal Server Error' } },
    500,
  );
}
