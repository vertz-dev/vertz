import { VertzException } from '../exceptions';
export function createJsonResponse(data, status = 200, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
  });
}
export function createErrorResponse(error) {
  if (error instanceof VertzException) {
    return createJsonResponse(error.toJSON(), error.statusCode);
  }
  return createJsonResponse(
    { error: 'InternalServerError', message: 'Internal Server Error', statusCode: 500 },
    500,
  );
}
//# sourceMappingURL=response-utils.js.map
