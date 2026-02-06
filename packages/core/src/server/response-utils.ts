export function createJsonResponse(data: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
  });
}

interface VertzLike {
  statusCode: number;
  toJSON: () => Record<string, unknown>;
}

function isVertzException(error: unknown): error is VertzLike {
  return (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    'toJSON' in error &&
    typeof (error as any).toJSON === 'function'
  );
}

export function createErrorResponse(error: unknown): Response {
  if (isVertzException(error)) {
    return createJsonResponse(error.toJSON(), error.statusCode);
  }

  return createJsonResponse(
    { error: 'InternalServerError', message: 'Internal Server Error', statusCode: 500 },
    500,
  );
}
