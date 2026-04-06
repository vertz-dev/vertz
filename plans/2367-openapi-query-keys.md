# `queryKey()` Utility for TanStack Query Integration (#2367)

## Problem

Users adopting `@vertz/openapi` alongside TanStack Query need cache-friendly query keys. Rather than complicating the code generator, we provide a small utility function in `@vertz/fetch` that users combine with existing SDK metadata to build query keys in their own hooks.

## API Surface

### The utility

```ts
// @vertz/fetch
export interface QueryKeyInput {
  path: string;
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
}

export function queryKey(input: QueryKeyInput): readonly unknown[] {
  // 1. Split path on `{param}` placeholders, interleaving static segments with param values
  // 2. Append query object if defined
  // 3. Strip trailing nullish values
}
```

### Key derivation from path template

The path template is split on `{param}` placeholders. Static segments and resolved param values alternate in the output array:

```ts
queryKey({ path: '/tasks' })
// => ['/tasks']

queryKey({ path: '/tasks/{taskId}', params: { taskId: 'abc' } })
// => ['/tasks', 'abc']

queryKey({ path: '/teams/{teamId}/members/{memberId}', params: { teamId: 't1', memberId: 'm1' } })
// => ['/teams', 't1', '/members', 'm1']

queryKey({ path: '/teams/{teamId}/members', params: { teamId: 't1' } })
// => ['/teams', 't1', '/members']
```

### Query params

When `query` is defined, it's appended as the last element:

```ts
queryKey({ path: '/tasks', query: { status: 'active' } })
// => ['/tasks', { status: 'active' }]

queryKey({ path: '/tasks', query: undefined })
// => ['/tasks']

queryKey({ path: '/tasks/{taskId}', params: { taskId: 'abc' }, query: { include: 'comments' } })
// => ['/tasks', 'abc', { include: 'comments' }]
```

### Trailing nullish filtering

Param values that are `undefined` or `null` (plus any trailing static segments after them) are stripped from the end to prevent broken cache keys:

```ts
queryKey({ path: '/tasks/{taskId}', params: { taskId: undefined } })
// => ['/tasks']  — NOT ['/tasks', undefined]

queryKey({ path: '/teams/{teamId}/members/{memberId}', params: { teamId: 't1', memberId: undefined } })
// => ['/teams', 't1', '/members']

queryKey({ path: '/teams/{teamId}/members/{memberId}', params: { teamId: undefined, memberId: undefined } })
// => ['/teams']
```

### Usage — wrapping generated SDK methods in custom hooks

```ts
import { queryKey } from '@vertz/fetch';

const sdk = createClient();

function useGetTask(taskId: string) {
  return useQuery({
    queryKey: queryKey({ path: '/tasks/{taskId}', params: { taskId } }),
    queryFn: () => sdk.tasks.get(taskId),
  });
}

function useListTasks(filters?: ListTasksQuery) {
  return useQuery({
    queryKey: queryKey({ path: '/tasks', query: filters }),
    queryFn: () => sdk.tasks.list(filters),
  });
}

// Invalidation — partial keys for hierarchical matching
queryClient.invalidateQueries({ queryKey: queryKey({ path: '/tasks' }) });
queryClient.invalidateQueries({ queryKey: queryKey({ path: '/tasks/{taskId}', params: { taskId } }) });
queryClient.invalidateQueries({ queryKey: queryKey({ path: '/teams/{teamId}', params: { teamId } }) });
```

## Manifesto Alignment

- **No magic** — A plain function that parses a path template and builds an array. Users see exactly what the key is.
- **Composable** — Works with any cache library (TanStack Query, SWR, custom). Users build their own hooks.
- **Convention over configuration** — One utility, one pattern. No config flags, no generator changes.
- **LLM-first** — Structured metadata input, trivial for an LLM to use in generated hooks.

## Why path-based keys

The `path` field uses the path template from the OpenAPI spec (`'/tasks/{taskId}'`). This is intentional:

- **Paths are stable** — they come directly from the OpenAPI spec. Resource names are derived.
- **Paths are hierarchical** — `/teams/{id}/members` naturally nests under `/teams/{id}`, enabling prefix-based invalidation.
- **Paths are universal** — any cache library can use them. Resource names are a Vertz SDK abstraction.

## Migration from Orval

For users migrating from Orval (like the issue reporter with 278 usages across 170 files), the mapping is 1:1:

```ts
// Before (Orval) — auto-generated, coupled to SDK
sdk.brands.get_brand_queryKeys(brandId)    // => ["web", brandId]
sdk.brands.find_many_queryKeys(orgId)      // => ["web", orgId, "brands"]

// After (Vertz) — user-defined hooks using queryKey()
queryKey({ path: '/brands/{brandId}', params: { brandId } })  // => ['/brands', brandId]
queryKey({ path: '/brands', query: { orgId } })               // => ['/brands', { orgId }]
```

Users write one thin hook per endpoint. This is typically what Orval users already do (wrapping the generated key in a `useQuery` call). The `queryKey()` utility replaces the auto-generated key function; the hook structure stays the same.

## Non-Goals

- **Not changing the code generator (Phase 1)** — The `@vertz/openapi` generator is unchanged in this phase. Users compose `queryKey()` with the generated SDK in their own hooks.
- **Not a TanStack Query adapter** — We provide the key utility, not `useQuery` wrappers.
- **Not adding `queryKey` to `QueryDescriptor`** — `QueryDescriptor._key` (flat string) and `queryKey()` (array) serve different purposes and stay separate.

## Future Work

This utility is the foundation, not the ceiling. It enables further integration in future phases:

- **Phase 2: Generator companion methods** — `@vertz/openapi` could emit `getQueryKey(id)` methods on each resource, using `queryKey()` internally. This would give Orval-style auto-generated keys without manual hooks.
- **`QueryDescriptor.queryKey` getter** — `QueryDescriptor` could gain a `.queryKey` property that converts the flat `_key` string to an array key using this utility, bridging Vertz internals with external cache libraries.
- **`@vertz/openapi-tanstack` adapter** — A separate package could auto-generate full `useQuery`/`useMutation` hooks from the SDK, using `queryKey()` for cache keys.

## Unknowns

None. This is a single pure function with no dependencies.

## Type Flow Map

No generics. The function takes `QueryKeyInput` and returns `readonly unknown[]`. The return type is compatible with TanStack Query's `QueryKey` (`readonly unknown[]`).

## E2E Acceptance Test

```ts
import { describe, it, expect } from 'bun:test';

describe('Feature: queryKey utility', () => {
  describe('Given a path with no params', () => {
    it('Then returns the path as a single-element array', () => {
      // queryKey({ path: '/tasks' }) => ['/tasks']
    });
  });

  describe('Given a path with params', () => {
    describe('When all param values are defined', () => {
      it('Then interleaves static segments and param values', () => {
        // queryKey({ path: '/tasks/{taskId}', params: { taskId: 'abc' } }) => ['/tasks', 'abc']
      });
    });

    describe('When a trailing param value is undefined', () => {
      it('Then strips it and any trailing static segment', () => {
        // queryKey({ path: '/tasks/{taskId}', params: { taskId: undefined } }) => ['/tasks']
      });
    });

    describe('When a trailing param value is null', () => {
      it('Then strips it', () => {
        // queryKey({ path: '/tasks/{taskId}', params: { taskId: null } }) => ['/tasks']
      });
    });
  });

  describe('Given nested resource paths', () => {
    describe('When all params are defined', () => {
      it('Then produces the full key array', () => {
        // queryKey({ path: '/teams/{teamId}/members/{memberId}', params: { teamId: 't1', memberId: 'm1' } })
        // => ['/teams', 't1', '/members', 'm1']
      });
    });

    describe('When the last param is undefined', () => {
      it('Then strips from the last defined value', () => {
        // queryKey({ path: '/teams/{teamId}/members/{memberId}', params: { teamId: 't1', memberId: undefined } })
        // => ['/teams', 't1', '/members']
      });
    });

    describe('When all params are undefined', () => {
      it('Then returns just the first static segment', () => {
        // queryKey({ path: '/teams/{teamId}/members/{memberId}', params: { teamId: undefined, memberId: undefined } })
        // => ['/teams']
      });
    });
  });

  describe('Given a query object', () => {
    describe('When the query is defined', () => {
      it('Then appends it as the last element', () => {
        // queryKey({ path: '/tasks', query: { status: 'active' } }) => ['/tasks', { status: 'active' }]
      });
    });

    describe('When the query is undefined', () => {
      it('Then omits it', () => {
        // queryKey({ path: '/tasks', query: undefined }) => ['/tasks']
      });
    });

    describe('When both params and query are defined', () => {
      it('Then query comes after params', () => {
        // queryKey({ path: '/tasks/{taskId}', params: { taskId: 'abc' }, query: { include: 'comments' } })
        // => ['/tasks', 'abc', { include: 'comments' }]
      });
    });
  });

  describe('Given a path with trailing static segment after params', () => {
    it('Then includes the trailing segment', () => {
      // queryKey({ path: '/teams/{teamId}/members', params: { teamId: 't1' } })
      // => ['/teams', 't1', '/members']
    });
  });

  describe('Given an empty path', () => {
    it('Then returns an empty array', () => {
      // queryKey({ path: '' }) => []
    });
  });
});
```

## Files Changed

1. `packages/fetch/src/query-key.ts` — New file, `queryKey()` function + `QueryKeyInput` type
2. `packages/fetch/src/query-key.test.ts` — Tests
3. `packages/fetch/src/index.ts` — Re-export `queryKey` and `QueryKeyInput`
