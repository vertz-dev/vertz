import { buildCtx } from '../context/ctx-builder';
import { BadRequestException } from '../exceptions';
import type { NamedMiddlewareDef } from '../middleware/middleware-def';
import { type ResolvedMiddleware, runMiddlewareChain } from '../middleware/middleware-runner';
import { isOk, isResult } from '../result';
import { Trie } from '../router/trie';
import { applyCorsHeaders, handleCors } from '../server/cors';
import { parseBody, parseRequest } from '../server/request-utils';
import { createErrorResponse, createJsonResponse } from '../server/response-utils';
import type { AppConfig } from '../types/app';
import type { HandlerCtx } from '../types/context';

/**
 * Creates a JSON response and applies CORS headers if configured.
 */
function createResponseWithCors(
  data: unknown,
  status: number,
  config: AppConfig,
  request: Request,
): Response {
  const response = createJsonResponse(data, status);
  if (config.cors) {
    return applyCorsHeaders(config.cors, request, response);
  }
  return response;
}

type SchemaLike = { parse(value: unknown): { ok: boolean; data?: unknown; error?: unknown } };

/**
 * Patterns that indicate the error message contains internal details
 * that should not be exposed to the client (file paths, stack traces, etc.).
 */
const INTERNAL_DETAIL_PATTERNS = [
  /(?:^|[\s:])\/[\w./-]+/, // Unix file paths (e.g., /usr/src/app/...)
  /[A-Z]:\\[\w\\.-]+/, // Windows file paths (e.g., C:\Users\...)
  /node_modules/, // Node module paths
  /at\s+\w+\s+\(/, // Stack trace frames (e.g., "at Function (file:line)")
  /\.ts:\d+:\d+/, // TypeScript source locations (e.g., file.ts:10:5)
  /\.js:\d+:\d+/, // JavaScript source locations
];

/**
 * Sanitizes a schema validation error message to prevent leaking internal details.
 *
 * Returns the original message if it looks like a clean validation message,
 * or a generic fallback if it contains file paths, stack traces, or other
 * internal information.
 */
export function sanitizeValidationMessage(error: unknown, label: string): string {
  // If the error has an `issues` array (schema library convention), extract field messages
  if (
    error != null &&
    typeof error === 'object' &&
    'issues' in error &&
    Array.isArray((error as { issues: unknown[] }).issues)
  ) {
    const issues = (error as { issues: Array<{ message?: string }> }).issues;
    const messages = issues
      .map((issue) => (typeof issue.message === 'string' ? issue.message : ''))
      .filter(Boolean);
    if (messages.length > 0) {
      return messages.join(', ');
    }
  }

  // Extract message from Error instances
  const message = error instanceof Error ? error.message : '';

  if (!message) {
    return `Invalid ${label}`;
  }

  // Check for internal detail patterns
  for (const pattern of INTERNAL_DETAIL_PATTERNS) {
    if (pattern.test(message)) {
      return `Invalid ${label}`;
    }
  }

  return message;
}

function validateSchema(schema: SchemaLike, value: unknown, label: string): unknown {
  const result = schema.parse(value);
  if (!result.ok) {
    const message = sanitizeValidationMessage(result.error, label);
    throw new BadRequestException(message);
  }
  return result.data;
}

interface RouteEntry {
  handler: (ctx: HandlerCtx) => unknown;
  options: Record<string, unknown>;
  services: Record<string, unknown>;
  middlewares: ResolvedMiddleware[];
  paramsSchema?: SchemaLike;
  bodySchema?: SchemaLike;
  querySchema?: SchemaLike;
  headersSchema?: SchemaLike;
  responseSchema?: SchemaLike;
  errorsSchema?: Record<number, SchemaLike>;
}

function resolveMiddlewares(
  // biome-ignore lint/suspicious/noExplicitAny: runtime layer accepts any middleware generics
  globalMiddlewares: NamedMiddlewareDef<any, any>[],
): ResolvedMiddleware[] {
  return globalMiddlewares.map((mw) => ({
    name: mw.name,
    handler: mw.handler,
    resolvedInject: {},
  }));
}

export function buildHandler(
  config: AppConfig,
  // biome-ignore lint/suspicious/noExplicitAny: runtime layer accepts any middleware generics
  globalMiddlewares: NamedMiddlewareDef<any, any>[],
): (request: Request) => Promise<Response> {
  const trie = new Trie<RouteEntry>();
  const resolvedMiddlewares = resolveMiddlewares(globalMiddlewares);

  // Register entity routes (injected by @vertz/server)
  if (config._entityRoutes) {
    for (const route of config._entityRoutes) {
      const entry: RouteEntry = {
        handler: route.handler as (ctx: HandlerCtx) => unknown,
        options: {},
        services: {},
        middlewares: [],
        paramsSchema: route.paramsSchema,
        bodySchema: route.bodySchema,
        querySchema: route.querySchema,
        headersSchema: route.headersSchema,
        responseSchema: route.responseSchema,
        errorsSchema: route.errorsSchema,
      };
      trie.add(route.method, route.path, entry);
    }
  }

  return async (request: Request): Promise<Response> => {
    try {
      if (config.cors) {
        const corsResponse = handleCors(config.cors, request);
        if (corsResponse) return corsResponse;
      }

      const parsed = parseRequest(request);
      const match = trie.match(parsed.method, parsed.path);

      if (!match) {
        const allowed = trie.getAllowedMethods(parsed.path);
        if (allowed.length > 0) {
          return createJsonResponse(
            { error: { code: 'MethodNotAllowed', message: 'Method Not Allowed' } },
            405,
            { allow: allowed.join(', ') },
          );
        }
        return createJsonResponse({ error: { code: 'NotFound', message: 'Not Found' } }, 404);
      }

      const body = await parseBody(request);

      const raw = {
        request: parsed.raw,
        method: parsed.method,
        url: parsed.raw.url,
        headers: parsed.raw.headers,
      };

      const requestCtx: Record<string, unknown> = {
        params: match.params,
        body,
        query: parsed.query,
        headers: parsed.headers,
        raw,
      };

      const middlewareState = await runMiddlewareChain(resolvedMiddlewares, requestCtx);

      const entry = match.handler;

      // Run route-level middlewares after global ones
      if (entry.middlewares.length > 0) {
        const routeCtx = { ...requestCtx, ...middlewareState };
        const routeState = await runMiddlewareChain(entry.middlewares, routeCtx);
        for (const key of Object.keys(routeState)) {
          if (key !== '__proto__' && key !== 'constructor' && key !== 'prototype') {
            middlewareState[key] = routeState[key];
          }
        }
      }

      // Validate schemas if provided
      const validatedParams = entry.paramsSchema
        ? validateSchema(entry.paramsSchema, match.params, 'params')
        : match.params;
      const validatedBody = entry.bodySchema
        ? validateSchema(entry.bodySchema, body, 'body')
        : body;
      const validatedQuery = entry.querySchema
        ? validateSchema(entry.querySchema, parsed.query, 'query')
        : parsed.query;
      const validatedHeaders = entry.headersSchema
        ? validateSchema(entry.headersSchema, parsed.headers, 'headers')
        : parsed.headers;

      const ctx = buildCtx({
        params: validatedParams as Record<string, unknown>,
        body: validatedBody,
        query: validatedQuery as Record<string, string>,
        headers: validatedHeaders as Record<string, string>,
        raw,
        middlewareState,
        services: entry.services,
        options: entry.options,
        env: {},
      });

      const result = await entry.handler(ctx);

      // Handle Result type (errors-as-values pattern)
      if (isResult(result)) {
        if (isOk(result)) {
          // Ok result - extract data and validate against response schema if enabled
          const data = result.data;
          if (config.validateResponses && entry.responseSchema) {
            const validation = entry.responseSchema.parse(data);
            if (!validation.ok) {
              const message =
                validation.error instanceof Error
                  ? validation.error.message
                  : 'Response schema validation failed';
              console.warn(`[vertz] Response validation warning: ${message}`);
            }
          }
          return createResponseWithCors(data, 200, config, request);
        } else {
          // Err result - use error status and body
          const errorStatus = result.status;
          const errorBody = result.body;

          // Validate error response against error schema if enabled
          if (config.validateResponses && entry.errorsSchema) {
            const errorSchema = entry.errorsSchema[errorStatus];
            if (errorSchema) {
              const validation = errorSchema.parse(errorBody);
              if (!validation.ok) {
                const message =
                  validation.error instanceof Error
                    ? `Error schema validation failed for status ${errorStatus}: ${validation.error.message}`
                    : `Error schema validation failed for status ${errorStatus}`;
                console.warn(`[vertz] Response validation warning: ${message}`);
              }
            }
          }
          return createResponseWithCors(errorBody, errorStatus, config, request);
        }
      }

      // Validate response against schema if enabled (backwards compat for plain objects)
      if (config.validateResponses && entry.responseSchema) {
        const validation = entry.responseSchema.parse(result);
        if (!validation.ok) {
          const message =
            validation.error instanceof Error
              ? validation.error.message
              : 'Response schema validation failed';
          console.warn(`[vertz] Response validation warning: ${message}`);
        }
      }

      // If result is already a Response, return it directly (allows HTML/file responses)
      const response =
        result === undefined
          ? new Response(null, { status: 204 })
          : result instanceof Response
            ? result
            : createJsonResponse(result);

      if (config.cors) {
        return applyCorsHeaders(config.cors, request, response);
      }

      return response;
    } catch (error) {
      return createErrorResponse(error);
    }
  };
}
