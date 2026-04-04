# Phase 3: ServiceConfig TFeatures

## Context

Issue #2004: BaseContext exposes auth/tenancy fields regardless of app configuration. Phase 2 added `TFeatures` to `EntityConfig`. This phase does the same for `ServiceConfig` and `ServiceActionDef`, ensuring service handler `ctx` parameters can also be narrowed.

Design doc: `plans/2004-base-context-conditional-types.md` (Rev 3, Section 8 "ServiceConfig — Same TFeatures pattern")

## Tasks

### Task 1: Add TFeatures to ServiceConfig

**Files:** (3)
- `packages/server/src/service/types.ts` (modified)
- `packages/server/src/service/service.ts` (modified)
- `packages/server/src/__tests__/service-config-features.test-d.ts` (new)

**What to implement:**

1. Add `TFeatures` to `ServiceConfig`:

```typescript
export interface ServiceConfig<
  TActions extends Record<string, ServiceActionDef<any, any, any>> = Record<string, ServiceActionDef>,
  TInject extends Record<string, EntityDefinition> = {},
  TFeatures extends ContextFeatures = FullFeatures,
> {
  readonly inject?: TInject;
  readonly access?: Partial<Record<Extract<keyof NoInfer<TActions>, string>, AccessRule>>;
  readonly actions: {
    readonly [K in keyof TActions]: TActions[K] extends ServiceActionDef<infer TIn, infer TOut, any>
      ? {
          readonly method?: string;
          readonly path?: string;
          readonly body?: SchemaLike<TIn>;
          readonly response: SchemaLike<TOut>;
          readonly handler: (
            input: TIn,
            ctx: BaseContext<TFeatures> & {
              readonly entities: InjectToOperations<TInject>;
              readonly request: ServiceRequestInfo;
            },
          ) => Promise<TOut | ResponseDescriptor<TOut>>;
        }
      : TActions[K];
  };
}
```

Note: The handler parameter uses an inline intersection `BaseContext<TFeatures> & { entities, request }` instead of `ServiceContext<TInject>`, because `ServiceContext` extends `BaseContext` (always `FullFeatures`). When `TFeatures = FullFeatures` (the default), this inline intersection is structurally identical to `ServiceContext<TInject>`.

2. Update `service()` function to accept the new generic:

```typescript
export function service<
  TInject extends Record<string, EntityDefinition> = {},
  TActions extends Record<string, ServiceActionDef<any, any, any>> = ...,
  TFeatures extends ContextFeatures = FullFeatures,
>(name: string, config: ServiceConfig<TActions, TInject, TFeatures>): ServiceDefinition<TActions> { ... }
```

3. Write type-level tests:

```typescript
// Default: FullFeatures — all fields available
service('reports', {
  actions: {
    generate: {
      response: schema,
      handler: async (input, ctx) => {
        const _u: string | null = ctx.userId;    // OK
        const _r = ctx.request;                    // OK — always available
        return result;
      },
    },
  },
});

// With NoFeatures — no auth/tenant fields
// (typed() factory handles this — test with explicit generic)
```

**Acceptance criteria:**
- [ ] `service('name', config)` with default TFeatures compiles as before
- [ ] Service handler `ctx` includes `entities` and `request` regardless of TFeatures
- [ ] Service handler `ctx.userId` is present only when `TFeatures.auth` is true
- [ ] All existing service definitions compile unchanged
- [ ] All existing service tests pass
- [ ] Typecheck passes: `vtz run typecheck`
