/**
 * Developer Walkthrough — Route Param Schema Types
 *
 * Type-level test using public package imports (@vertz/ui).
 * Validates cross-package type safety for ParamSchema and useParams overloads.
 *
 * @see plans/route-param-schemas.md
 */

import type { ParamSchema } from '@vertz/ui';
import { defineRoutes, useParams } from '@vertz/ui';

// ── ParamSchema accepted in route config via public API ─────────────────────

const schema: ParamSchema<{ id: string }> = {
  parse(raw) {
    const { id } = raw as { id: string };
    return { ok: true, data: { id } };
  },
};

// Positive: route config with params schema compiles
defineRoutes({
  '/tasks/:id': {
    component: () => document.createElement('div'),
    params: schema,
  },
});

// ── useParams overloads via public API ──────────────────────────────────────

// Overload 1: backward compat — path literal → string params
const strParams = useParams<'/tasks/:id'>();
const _id: string = strParams.id;
void _id;

// @ts-expect-error - 'name' not on ExtractParams<'/tasks/:id'>
strParams.name;

// Overload 2: parsed type assertion
const parsedParams = useParams<{ id: string }>();
const _parsedId: string = parsedParams.id;
void _parsedId;

// @ts-expect-error - 'name' not on { id: string }
parsedParams.name;
