/**
 * Type tests for ParamSchema on route definitions.
 *
 * @see plans/route-param-schemas.md
 */

import type { ParamSchema } from '../define-routes';
import { defineRoutes } from '../define-routes';
import { useParams } from '../router-context';

// ── ParamSchema interface ───────────────────────────────────────────────────

// Positive: valid schema compiles
const validSchema: ParamSchema<{ id: string }> = {
  parse(raw) {
    const { id } = raw as { id: string };
    return { ok: true, data: { id } };
  },
};
void validSchema;

// Positive: schema with non-string parsed values
const numSchema: ParamSchema<{ id: number }> = {
  parse(raw) {
    const { id } = raw as { id: string };
    return { ok: true, data: { id: Number(id) } };
  },
};
void numSchema;

// ── RouteConfig accepts params ──────────────────────────────────────────────

// Positive: route config with params schema compiles
defineRoutes({
  '/tasks/:id': {
    component: () => document.createElement('div'),
    params: validSchema,
  },
});

// Positive: route config without params schema compiles (backward compat)
defineRoutes({
  '/tasks/:id': {
    component: () => document.createElement('div'),
  },
});

// Positive: route config with both params and searchParams
defineRoutes({
  '/tasks/:id': {
    component: () => document.createElement('div'),
    params: validSchema,
    searchParams: {
      parse(raw) {
        return { ok: true as const, data: raw as { page: string } };
      },
    },
  },
});

// ── useParams overloads ─────────────────────────────────────────────────────

// Overload 1: path literal → string params (backward compat)
const strParams = useParams<'/tasks/:id'>();
const _strId: string = strParams.id;
void _strId;

// @ts-expect-error - 'name' not on ExtractParams<'/tasks/:id'>
strParams.name;

// Overload 2: parsed type assertion
const parsedParams = useParams<{ id: string }>();
const _parsedId: string = parsedParams.id;
void _parsedId;

// @ts-expect-error - 'name' not on { id: string }
parsedParams.name;

// Overload 2 with non-string type
const numParams = useParams<{ id: number }>();
const _numId: number = numParams.id;
void _numId;
