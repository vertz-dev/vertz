# codegen: generate MutationDescriptor for service mutation methods

**Issue:** #2450
**Date:** 2026-04-09

## Problem

The `ServiceSdkGenerator` currently wraps **all** actions — including POST, PUT, PATCH, and DELETE — with `createDescriptor()`. Only GET methods should use `createDescriptor()` (returning `QueryDescriptor<T>`). Mutating methods should use `createMutationDescriptor()` (returning `MutationDescriptor<T>`), matching the pattern already established in `EntitySdkGenerator`.

Additionally, for POST/PUT/PATCH actions, the current code passes `body` as the `query` parameter to `createDescriptor()`, which is a bug — `createDescriptor`'s 4th argument is `query?: QueryParams`, not a request body.

## API Surface

### Current (broken)

```ts
// All methods use createDescriptor — even mutations
import { type FetchClient, createDescriptor } from '@vertz/fetch';

export function createNotificationsSdk(client: FetchClient) {
  return {
    send: Object.assign(
      (body: unknown) => createDescriptor('POST', '/notifications/send', () => client.post<unknown>('/notifications/send', body), body),
      //                                                                                                                       ^^^^ bug: body passed as query
      { url: '/notifications/send', method: 'POST' as const },
    ),
    status: Object.assign(
      () => createDescriptor('GET', '/notifications/status', () => client.get<unknown>('/notifications/status')),
      { url: '/notifications/status', method: 'GET' as const },
    ),
  };
}
```

### Expected (fixed)

```ts
import { type FetchClient, createDescriptor, createMutationDescriptor, queryKey } from '@vertz/fetch';

export function createNotificationsSdk(client: FetchClient) {
  return {
    send: Object.assign(
      (body: unknown) => createMutationDescriptor('POST', '/notifications/send', () => client.post<unknown>('/notifications/send', body), { entityType: 'notifications', kind: 'create' as const, body }),
      {
        url: '/notifications/send',
        method: 'POST' as const,
        queryKey: () => queryKey({ path: '/notifications/send' }),
      },
    ),
    status: Object.assign(
      () => createDescriptor('GET', '/notifications/status', () => client.get<unknown>('/notifications/status')),
      {
        url: '/notifications/status',
        method: 'GET' as const,
        queryKey: () => queryKey({ path: '/notifications/status' }),
      },
    ),
  };
}
```

For methods with path parameters, `.queryKey()` mirrors the method's typed signature with all params optional (for prefix matching):

```ts
// Generated for: GET /notifications/status/:messageId
get_status: Object.assign(
  (messageId: string) => createDescriptor('GET', ...),
  {
    url: '/notifications/status/:messageId',
    method: 'GET' as const,
    // Same param name & type as the method, but optional
    queryKey: (messageId?: string) => queryKey({
      path: '/notifications/status/{messageId}',
      params: { messageId },
    }),
  },
),

// Multiple path params — all mirrored, all optional
// Generated for: GET /teams/:teamId/members/:memberId
get_member: Object.assign(
  (teamId: string, memberId: string) => createDescriptor('GET', ...),
  {
    url: '/teams/:teamId/members/:memberId',
    method: 'GET' as const,
    queryKey: (teamId?: string, memberId?: string) => queryKey({
      path: '/teams/{teamId}/members/{memberId}',
      params: { teamId, memberId },
    }),
  },
),

// Mutation with path params — same principle
// Generated for: DELETE /notifications/:messageId
delete: Object.assign(
  (messageId: string) => createMutationDescriptor('DELETE', ...),
  {
    url: '/notifications/:messageId',
    method: 'DELETE' as const,
    queryKey: (messageId?: string) => queryKey({
      path: '/notifications/{messageId}',
      params: { messageId },
    }),
  },
),
```

The `queryKey()` function from `@vertz/fetch` truncates the key at the first undefined param, so prefix matching works naturally:

```ts
sdk.teams.get_member.queryKey('team-1', 'member-2')  // => ['/teams', 'team-1', '/members', 'member-2']
sdk.teams.get_member.queryKey('team-1')               // => ['/teams', 'team-1', '/members']  — matches all members in team
sdk.teams.get_member.queryKey()                        // => ['/teams']  — matches all teams
```

### MutationMeta derivation

Since services don't carry explicit entity semantics, we derive `MutationMeta` from what we know:

| HTTP Method       | `kind`     |
|-------------------|------------|
| POST              | `'create'` |
| PUT / PATCH       | `'update'` |
| DELETE            | `'delete'` |

- `entityType` is derived from `serviceName` (e.g., `'notifications'`)
- `body` is forwarded for POST/PUT/PATCH
- `id` is forwarded when path params exist (first path param is treated as `id`)

## Developer Usage

The primary consumers are React apps (like Observatory) using **TanStack Query**. The descriptors eliminate manual `queryKey` construction and path string duplication.

### Before: manual key construction (current, broken)

```tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKey } from '@vertz/fetch';

// Query — must duplicate path strings for cache keys
function useOrganization(orgId: string, queryParams?: OrgQueryParams) {
  return useQuery({
    queryKey: queryKey({
      path: '/internal/organizations/{organization_id}',
      params: { organization_id: orgId },
      query: queryParams,
    }),
    queryFn: async () => {
      const result = await sdk.internalOrganizations.get(orgId, queryParams);
      return unwrap(result).data;
    },
  });
}

// Mutation — manual invalidation with hardcoded path
function useCreateOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateOrgInput) => {
      const result = await sdk.internalOrganizations.create(body);
      return unwrap(result).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKey({ path: '/internal/organizations/' }),
      });
    },
  });
}
```

### After: descriptor-driven (with this change)

```tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Query — use .queryKey() for the key, descriptor as queryFn (it's thenable)
function useOrganization(orgId: string) {
  return useQuery({
    queryKey: sdk.internalOrganizations.get.queryKey(orgId),
    queryFn: () => sdk.internalOrganizations.get(orgId),  // thenable — TanStack awaits it
  });
}

// Mutation — invalidate with .queryKey() on the list method
function useCreateOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateOrgInput) => sdk.internalOrganizations.create(body),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: sdk.internalOrganizations.find_many.queryKey(),
      });
    },
  });
}
```

### `.queryKey()` for cache operations

```tsx
// Prefetch — no descriptor instance needed, just the key
queryClient.prefetchQuery({
  queryKey: sdk.internalOrganizations.get.queryKey(orgId),
  queryFn: () => sdk.internalOrganizations.get(orgId),
});

// Read from cache
const cached = queryClient.getQueryData(
  sdk.internalOrganizations.get.queryKey(orgId),
);

// Prefix invalidation — omit params to match all queries for that method
// Invalidates get('org-1'), get('org-2'), etc.
queryClient.invalidateQueries({
  queryKey: sdk.internalOrganizations.get.queryKey(),
});
```

### Building a typed hook wrapper

```tsx
// A thin wrapper to reduce boilerplate across the app
function useDescriptorQuery<T>(descriptorFn: () => QueryDescriptor<T>, deps: unknown[]) {
  const descriptor = useMemo(() => descriptorFn(), deps);
  return useQuery({
    queryKey: [descriptor._key],
    queryFn: () => descriptor,  // thenable — no ._fetch() needed
  });
}

// Usage — one line per query
const { data: org } = useDescriptorQuery(
  () => sdk.internalOrganizations.get(orgId),
  [orgId],
);
const { data: orgs } = useDescriptorQuery(
  () => sdk.internalOrganizations.find_many(queryParams),
  [queryParams],
);
```

### Direct await (non-React contexts)

```ts
// In a server action, API route, or script — just await the descriptor
const result = await sdk.internalOrganizations.create({ name: 'Acme Corp' });
if (!result.ok) {
  console.error('Failed:', result.error.message);
  return;
}
console.log('Created:', result.data);
```

### Type discrimination

```ts
import { isQueryDescriptor, isMutationDescriptor } from '@vertz/fetch';

const desc = sdk.internalOrganizations.find_many();
isQueryDescriptor(desc);   // true  — _tag === 'QueryDescriptor'

const mut = sdk.internalOrganizations.create({ name: 'Acme' });
isMutationDescriptor(mut);  // true — _tag === 'MutationDescriptor'
```

## Manifesto Alignment

- **Principle 1 (If it builds, it works):** Descriptors carry typed metadata. Using the correct descriptor type ensures compile-time correctness for consumers that differentiate queries from mutations.
- **Principle 2 (One way to do things):** Entity SDK already uses `createMutationDescriptor` for mutations. Service SDK should follow the same pattern. No two patterns for the same concept.
- **Principle 3 (AI agents are first-class):** An LLM consuming the generated SDK can rely on `_tag === 'MutationDescriptor'` vs `'QueryDescriptor'` to distinguish operations, without inspecting HTTP methods.

## Non-Goals

- **Query parameter support for service GET actions:** Services don't currently expose query params in the IR. Adding them is a separate enhancement.
- **Typed input/output schemas for services:** Services use `unknown` for input/output types. Adding typed schemas requires IR changes beyond this issue.
- **Optimistic update support for services:** Entity SDK accepts an `optimistic?: OptimisticHandler` parameter. Services don't have entity semantics strong enough to warrant this yet.
- **Config flag to opt out:** The old behavior (using `createDescriptor` for mutations) is a bug. No opt-out needed.
- **Entity SDK custom actions fix:** The `EntitySdkGenerator` has the same bug in its custom `actions` loop (lines 224-248). A separate issue will be filed to track that fix.

## Unknowns

None identified. The `createMutationDescriptor` API and the `ServiceSdkGenerator` code are both straightforward. The change is mechanical.

## Type Flow Map

```
CodegenServiceAction.method (HttpMethod)
  → isMutation check (POST|PUT|PATCH|DELETE)
  → createMutationDescriptor() call in generated code
  → MutationDescriptor<T> return type (inferred)
  → consumer: descriptor._tag === 'MutationDescriptor'
  → consumer: descriptor._mutation.entityType === serviceName
  → consumer: descriptor._mutation.kind === derived kind
```

No new generics introduced. The existing `MutationDescriptor<T>` generic flows from the `client.*<T>()` call.

## E2E Acceptance Test

```typescript
describe('Feature: Service SDK generates correct descriptor types', () => {
  describe('Given a service with GET and POST actions', () => {
    describe('When generating the SDK', () => {
      it('Then GET actions use createDescriptor', () => {
        // Generated code contains: createDescriptor('GET', ...)
        // Generated code does NOT contain: createMutationDescriptor('GET', ...)
      });

      it('Then POST actions use createMutationDescriptor', () => {
        // Generated code contains: createMutationDescriptor('POST', ...)
        // Generated code does NOT contain: createDescriptor('POST', ...)
      });

      it('Then PUT actions use createMutationDescriptor', () => {
        // Generated code contains: createMutationDescriptor('PUT', ...)
      });

      it('Then PATCH actions use createMutationDescriptor', () => {
        // Generated code contains: createMutationDescriptor('PATCH', ...)
      });

      it('Then DELETE actions use createMutationDescriptor', () => {
        // Generated code contains: createMutationDescriptor('DELETE', ...)
      });
    })
  });

  describe('Given a POST action with body', () => {
    describe('When generating the SDK', () => {
      it('Then body is passed in MutationMeta, not as query param', () => {
        // Generated code contains: { entityType: 'notifications', kind: 'create' as const, body }
        // Generated code does NOT contain: createDescriptor(..., body)
      });
    });
  });

  describe('Given a service with only GET actions', () => {
    describe('When generating the SDK', () => {
      it('Then import does NOT include createMutationDescriptor', () => {
        // import line only has: createDescriptor
      });
    });
  });

  describe('Given a service with only mutation actions', () => {
    describe('When generating the SDK', () => {
      it('Then import includes createMutationDescriptor but not createDescriptor', () => {
        // import line has: createMutationDescriptor
        // import line does NOT have: createDescriptor
      });
    });
  });

  describe('Given a DELETE action with path params', () => {
    describe('When generating the SDK', () => {
      it('Then first path param is passed as id in MutationMeta', () => {
        // Generated code contains: { entityType: 'notifications', kind: 'delete' as const, id: messageId }
      });
    });
  });

  describe('Given a GET action with no path params', () => {
    describe('When generating the SDK', () => {
      it('Then .queryKey() is attached and delegates to queryKey()', () => {
        // Generated code contains: queryKey: () => queryKey({ path: '/notifications/status' })
      });
    });
  });

  describe('Given a GET action with path params', () => {
    describe('When generating the SDK', () => {
      it('Then .queryKey() mirrors the method param names and types, all optional', () => {
        // Generated code contains: queryKey: (messageId?: string) => queryKey({ path: '/notifications/status/{messageId}', params: { messageId } })
        // Same param name as the method (messageId), same type (string), but optional
        // Calling .queryKey() with no args returns prefix key
        // Calling .queryKey('abc') returns full key with that param resolved
      });
    });
  });

  describe('Given a mutation action', () => {
    describe('When generating the SDK', () => {
      it('Then .queryKey() is also attached for mutationKey support', () => {
        // Generated code contains: queryKey: () => queryKey({ path: '/notifications/send' })
      });
    });
  });

  describe('Given any action', () => {
    describe('When generating the SDK', () => {
      it('Then queryKey is imported from @vertz/fetch', () => {
        // import line includes: queryKey
      });
    });
  });
});
```

## Files Changed

- `packages/codegen/src/generators/service-sdk-generator.ts` — use `createMutationDescriptor` for mutation methods
- `packages/codegen/src/__tests__/service-sdk-generator.test.ts` — update/add tests for mutation descriptor generation

## Implementation Notes

The change is scoped entirely to the `ServiceSdkGenerator.generateServiceSdk()` method:

1. **Determine if action is a mutation:** Use explicit set `POST | PUT | PATCH | DELETE` (not `!== 'GET'`, to avoid misclassifying HEAD/OPTIONS if they ever appear in the IR)
2. **Map HTTP method to mutation kind:** `POST → 'create'`, `PUT|PATCH → 'update'`, `DELETE → 'delete'`
3. **Build MutationMeta:** `{ entityType: serviceName, kind, body?, id? }` — note: `entityType` for services is a logical grouping key (the service name), not a reference to a database entity
4. **Use correct descriptor factory:** `createMutationDescriptor` for mutations, `createDescriptor` for queries
5. **Fix imports:** Only import what's needed (some services may have only GETs, only mutations, or both). Always import `queryKey`.
6. **Generate `.queryKey()` on each method:** Delegates to `queryKey()` from `@vertz/fetch`. Path params are converted from `:param` to `{param}` syntax for the `queryKey()` call. Path params are optional in `.queryKey()` to support prefix-based cache invalidation.

## Consumer Impact

Consumers must re-run codegen (`vtz run codegen`) to pick up the corrected descriptors. The generated SDK's runtime behavior changes: mutation methods now return `MutationDescriptor` (with `_tag: 'MutationDescriptor'`) instead of `QueryDescriptor`. Code that checks `_tag` or passes descriptors to `query()` vs `form()` will now receive the correct type.

## Review Sign-offs

- **DX:** Approved with suggestions (2026-04-09) — fix entity actions in same PR → deferred to separate issue; note entityType semantics → addressed in implementation notes
- **Product/Scope:** Approved (2026-04-09) — add consumer impact note → added above
- **Technical:** Approved with suggestions (2026-04-09) — use explicit mutation method set → addressed in step 1; file issue for entity actions bug → will file; add entityType comment → addressed in step 3
