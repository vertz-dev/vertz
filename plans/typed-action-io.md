# Typed Action I/O

**Status:** Rev 2 (post-review)
**Date:** 2026-03-28
**Packages:** `@vertz/server`, `@vertz/testing`

---

## Problem

Custom action handlers in `entity()` and `service()` receive `input: any` and (for services) `ctx: any` despite having explicit body/response schemas. Developers must manually extract types with `Infer<typeof schema>` to get type safety in handler bodies.

**Root cause:** The generic constraints on `entity()` and `service()` use `any` for action type parameters:

```typescript
// service.ts — ALL three params are any → handler gets (input: any, ctx: any)
TActions extends Record<string, ServiceActionDef<any, any, any>>

// entity.ts — TInput/TOutput are any, but TResponse/TCtx are concrete
TActions extends Record<string, EntityActionDef<any, any, TModel['table']['$response'], EntityContext<TModel, TInject>>>
```

TypeScript uses the **constraint type** for contextual typing of callback parameters. When the constraint is `ServiceActionDef<any, any, any>`, the handler gets `(input: any, ctx: any) => Promise<any>` — all type information is lost.

**Current state per call site:**

| | `input` | `ctx` | `row` | `return` |
|---|---|---|---|---|
| **service()** | `any` | `any` | N/A | inferred from body |
| **entity()** | `any` | typed (`EntityContext<TModel, TInject>`) | typed (`TModel['table']['$response']`) | inferred from body |

**Impact:** Violates Principle 1 ("If it builds, it works") — code compiles even with wrong handler logic because `any` accepts everything. Also violates Principle 3 ("AI agents are first-class users") — LLMs can't rely on compiler feedback to write correct handlers.

---

## POC Results

**Question:** Can we fix inference without adding a helper function?

**Approaches tested:**

| Approach | Technique | Result |
|----------|-----------|--------|
| A — `action()` helper | Separate generic function per action | **Works** — TypeScript infers `TInput` from `body: SchemaLike<TInput>` in a direct generic call |
| B — Mapped conditional type | `ExtractInput<TRaw[K]>` conditional on config's mapped type | **Fails** — TypeScript can't resolve conditional types during contextual typing |
| C — Intersection mapped type | `TActions[K] & { handler: (input: I) => ... }` | **Fails** — same as B, conditional types deferred |
| D — Handler-free constraint | Constraint without handler, add handler via mapped type | **Fails** — conditional `TShape extends { body: SchemaLike<infer I> }` deferred |

**Question:** Does `action()` preserve entity `ctx`/`row` typing from the parent constraint?

**Answer:** No. `action()` pre-types the handler at the call site. Once the handler's contextual type is `(input: TInput, ctx: any, row: any) => ...`, the entity constraint can't re-narrow `ctx` and `row`. The assignability check passes (contravariant params), but the handler body already has `any` for those positions.

**Conclusion:** `action()` types `input` and return from body/response schemas. For services, the complementary constraint fix gives typed `ctx`. For entities, `ctx` and `row` keep their existing typing from the entity constraint ONLY when `action()` is NOT used — with `action()`, they become `any`.

---

## API Surface

### `action()` — typed action definition

```typescript
import { s } from '@vertz/schema';
import { action, service } from '@vertz/server';

// Service action — fully typed (input, ctx, return)
export const notifications = service('notifications', {
  inject: { tasks },
  access: { send: rules.authenticated(), status: rules.public },
  actions: {
    send: action({
      body: s.object({
        taskId: s.uuid(),
        channel: s.enum(['email', 'slack', 'sms']),
        message: s.string(),
      }),
      response: s.object({
        sent: s.boolean(),
        deliveredAt: s.string().optional(),
      }),
      handler: async (input, ctx) => {
        // ✅ input: { taskId: string; channel: 'email' | 'slack' | 'sms'; message: string }
        // ✅ ctx: ServiceContext<{ tasks: typeof tasksEntity }> (from constraint fix)
        const task = await ctx.entities.tasks.get(input.taskId);
        return { sent: true, deliveredAt: new Date().toISOString() };
      },
    }),

    status: action({
      method: 'GET',
      response: s.object({ healthy: s.boolean(), pendingCount: s.number() }),
      handler: async (_input, _ctx) => {
        // ✅ _input: unknown (no body schema)
        return { healthy: true, pendingCount: 0 };
      },
    }),
  },
});
```

### Entity actions — tradeoff documented

For entity actions, developers choose between two options:

```typescript
import { s } from '@vertz/schema';
import { action, entity } from '@vertz/server';

// Option A: action() wrapper — typed input + return, ctx/row are any
entity('tasks', {
  model: tasksModel,
  actions: {
    assign: action({
      body: s.object({ assigneeId: s.uuid() }),
      response: s.object({ assigned: s.boolean() }),
      handler: async (input, ctx, row) => {
        // ✅ input: { assigneeId: string }
        // ❌ ctx: any — action() pre-types, entity constraint can't re-narrow
        // ❌ row: any — same reason
        return { assigned: true };
      },
    }),
  },
});

// Option B: inline (status quo) — typed ctx/row, input is any
entity('tasks', {
  model: tasksModel,
  actions: {
    assign: {
      body: s.object({ assigneeId: s.uuid() }),
      response: s.object({ assigned: s.boolean() }),
      handler: async (input, ctx, row) => {
        // ❌ input: any — constraint uses any for TInput
        // ✅ ctx: EntityContext<typeof tasksModel>
        // ✅ row: TasksResponse | null
        return { assigned: true };
      },
    },
  },
});
```

**Recommendation for entity actions:** Use `action()` when input typing matters most (complex body schemas with many fields). Use inline when ctx/row typing matters most (cross-entity operations, model-dependent logic).

**Future improvement:** A factory callback pattern (`actions: (a) => ({...})`) where the entity provides a scoped `action()` helper already typed with TModel/TInject would give full typing for all params. This is a follow-up design after this foundational change ships.

### `action()` function signature

```typescript
// Return type — explicit, not `typeof config`
interface ActionDef<TInput, TOutput> {
  readonly method?: string;
  readonly path?: string;
  readonly body?: SchemaLike<TInput>;
  readonly response: SchemaLike<TOutput>;
  readonly handler: (
    input: TInput,
    ctx: any,
    row: any,
  ) => Promise<TOutput | ResponseDescriptor<TOutput>>;
}

// Overload 1: With body (POST/PUT/PATCH actions)
export function action<TInput, TOutput>(config: {
  readonly method?: string;
  readonly path?: string;
  readonly body: SchemaLike<TInput>;
  readonly response: SchemaLike<TOutput>;
  readonly handler: (
    input: TInput,
    ctx: any,
    row: any,
  ) => Promise<TOutput | ResponseDescriptor<TOutput>>;
}): ActionDef<TInput, TOutput>;

// Overload 2: Without body (GET actions)
export function action<TOutput>(config: {
  readonly method?: string;
  readonly path?: string;
  readonly response: SchemaLike<TOutput>;
  readonly handler: (
    input: unknown,
    ctx: any,
    row: any,
  ) => Promise<TOutput | ResponseDescriptor<TOutput>>;
}): ActionDef<unknown, TOutput>;
```

**Design choices:**
- **Explicit return type (`ActionDef<TInput, TOutput>`)** — Not `typeof config`. The explicit return type is deterministic and doesn't leak implementation details. (Tech review B1)
- **`ctx: any, row: any`** — Explicit params instead of `...args: any[]`. Makes the handler signature clear (3 params for entity, 2 for service). The `any` is honest — `action()` can't type these positions.
- **Two overloads** — Overload 1 (with body) matches first when `body` is present. Overload 2 (without body) matches GET actions. TypeScript resolves by declaration order.

### Complementary: Fix service() TCtx constraint

The third generic param in the service constraint changes from `any` to the concrete context:

```typescript
// Before
TActions extends Record<string, ServiceActionDef<any, any, any>>

// After
TActions extends Record<string, ServiceActionDef<any, any, ServiceContext<TInject>>>
```

This makes `ctx` properly typed for service actions even without `action()`.

**After this change — service actions:**

| | `input` | `ctx` | `return` |
|---|---|---|---|
| Without `action()` | `any` | `ServiceContext<TInject>` (new!) | inferred from body |
| With `action()` | typed from body | `any` (action() pre-types ctx) | checked against response |

**Note:** When using `action()`, `ctx` is `any` because `action()` pre-types the handler at the call site — the service constraint cannot retroactively re-narrow it. For fully typed service handlers, combine inline actions (for `ctx`) with explicit `Infer<>` for input, or use `action()` when input typing matters most.

**Backward compat:** Inline actions (without `action()`) get better ctx typing. This is a pure improvement — nothing breaks.

### Complementary: EntityDefinition preserves action types

Add a phantom `__actions` field to `EntityDefinition`, mirroring what `ServiceDefinition` already does:

```typescript
export interface EntityDefinition<
  TModel extends ModelDef = ModelDef,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TActions extends Record<string, EntityActionDef<any, any, any, any>> = Record<string, EntityActionDef>,
> {
  // ... existing fields ...
  /** @internal Phantom type — carries concrete action types for type extraction. */
  readonly __actions?: TActions;
}
```

**Array compat:** `EntityDefinition<TModel>` (1 explicit param) uses the default for `TActions`. `EntityDefinition[]` (no params) uses defaults for both. This mirrors the existing `ServiceDefinition<TActions>` pattern which already works with arrays. (Tech review SF1 — verified by type test.)

### Backward compatibility

`action()` is additive. Developers who don't wrap actions continue to work exactly as before. The wrapper is opt-in.

**No migration required.** Existing code compiles unchanged. The `action()` wrapper can be adopted incrementally, one action at a time.

### Principle 2 tension — "two ways to do things"

With `action()`, there are temporarily two ways to define actions: wrapped (typed input/return) and inline (typed ctx/row for entities). This is an accepted tradeoff:

1. For **services**: `action()` is strictly superior (typed input + ctx + return). Inline is never recommended. A future **oxlint rule** (`no-untyped-service-action`) should warn when service actions lack the wrapper.
2. For **entities**: both options have a tradeoff. The factory callback pattern (future) will collapse this to one way.

---

## Manifesto Alignment

### Principle 1 — "If it builds, it works"

Today, action handlers compile with wrong logic because `input: any` accepts everything. After this change, `action()` makes the compiler catch type mismatches in handler bodies — wrong property access on input, wrong return shape.

### Principle 2 — "One way to do things"

For services: `action()` is THE way. For entities: temporary two-path situation (documented above) until factory callback ships.

### Principle 3 — "AI agents are first-class users"

LLMs can now rely on compiler errors to fix handler logic. Without this, an LLM writing a handler gets `input: any` and has no feedback loop to catch mistakes.

### What was rejected

- **Builder pattern** (`service('auth').action('login').body(...).handler(...)`) — Chains look clean but change the config-object API surface. Config objects are more LLM-friendly (single block of code, no method ordering concerns).
- **Mapped conditional types** — TypeScript can't resolve conditional types during contextual typing. POC'd and failed (Approaches B, C, D).
- **`satisfies` operator** — Only works on values, not type parameter constraints.
- **`typeof config` return type** — Fragile, leaks handler implementation details. Use explicit `ActionDef<TInput, TOutput>` instead. (Tech review B1)
- **Rest params `...args: any[]`** — Hides the handler arity. Use explicit `ctx: any, row: any` params instead. (Tech review B2)

---

## Non-Goals

- **Runtime behavior changes** — `action()` is identity at runtime. It returns its argument unchanged. No new runtime code paths, no performance impact.
- **Removing `any` from constraints entirely** — The `any` for TInput/TOutput in the constraint stays. Removing it would break backward compat. The `action()` helper works around it.
- **Entity test proxy custom actions** — Adding `.assign()`, `.complete()` etc. to `EntityTestProxy` is a separate follow-up. This design only adds the type preservation (`__actions` phantom) needed to build that later.
- **Codegen changes** — The SDK generator already produces typed action methods. This design fixes the _definition site_, not the generated client.
- **Full entity action typing** — Typing ALL entity handler params (input + ctx + row) from a single wrapper requires a factory callback pattern. This is a follow-up design.

---

## Unknowns

All unknowns resolved during review.

~~1. Does `action()` handler interact correctly with entity() constraint for `ctx` and `row`?~~

**Resolved:** No. `action()` pre-types the handler at the call site. The entity constraint can't re-narrow `ctx` and `row` after `action()` has typed them as `any`. This is an accepted tradeoff — documented in the API Surface section with both options for entity actions.

~~2. Does `action()` with inline schemas preserve inference?~~

**Resolved:** Yes. POC confirmed — inline `s.object({...})` works identically to const schemas.

---

## Type Flow Map

```
Developer writes:
  action({
    body: s.object({ taskId: s.uuid() }),     ←─ ObjectSchema<{ taskId: StringSchema }>
    response: s.object({ sent: s.boolean() }), ←─ ObjectSchema<{ sent: BooleanSchema }>
    handler: async (input, ctx) => { ... },
  })

action<TInput, TOutput>() infers:
  body: SchemaLike<TInput>
    └─ ObjectSchema extends Schema<{ taskId: string }>
    └─ Schema.parse() returns Result<{ taskId: string }, ParseError>
    └─ Result<T> = { ok: true; data: T } | { ok: false; error: ParseError }
    └─ Matches SchemaLike<T>.parse() return type → TInput = { taskId: string }

  response: SchemaLike<TOutput>
    └─ Same flow → TOutput = { sent: boolean }

  handler: (input: TInput, ctx: any, row: any) => Promise<TOutput>
    └─ Contextual typing: input: { taskId: string }
    └─ Return check: must be { sent: boolean }
    └─ ctx/row: any (not typed by action())

Returns: ActionDef<{ taskId: string }, { sent: boolean }>
  └─ Assignable to ServiceActionDef<any, any, ServiceContext<TInject>>
  └─ Assignable to EntityActionDef<any, any, TResponse, TCtx>
  └─ Stored in ServiceDefinition.__actions phantom → extractable downstream

For INLINE service actions (without action()):
  ctx gets contextual typing from CONSTRAINT: ServiceContext<TInject>
  └─ ctx is fully typed in inline service handlers (new!)

For action()-wrapped service actions:
  ctx is pre-typed as any by action() at the call site
  └─ The service constraint CANNOT retroactively re-narrow ctx
  └─ ctx remains any in the handler body — documented tradeoff
```

**Dead generics check:** None. TInput flows from body → handler input. TOutput flows from response → handler return. Both reach the consumer (handler body).

---

## E2E Acceptance Test

```typescript
import { describe, expectTypeOf, it } from 'bun:test';
import { d } from '@vertz/db';
import { s } from '@vertz/schema';
import { action, entity, service } from '@vertz/server';

const tasksTable = d.table('tasks', {
  id: d.uuid().primary(),
  title: d.text(),
  status: d.text(),
});
const tasksModel = d.model(tasksTable);

// ---------------------------------------------------------------------------
// Service action: input, ctx, and return are strictly typed
// ---------------------------------------------------------------------------

describe('Feature: Typed action I/O', () => {
  describe('Given a service action with action() wrapper', () => {
    describe('When the handler accesses input properties', () => {
      it('Then input is typed from body schema, not any', () => {
        service('test', {
          actions: {
            send: action({
              body: s.object({ taskId: s.uuid(), message: s.string() }),
              response: s.object({ sent: s.boolean() }),
              handler: async (input, _ctx) => {
                expectTypeOf(input.taskId).toBeString();
                expectTypeOf(input.message).toBeString();
                // @ts-expect-error — 'nonExistent' doesn't exist on input
                void input.nonExistent;
                return { sent: true };
              },
            }),
          },
        });
      });

      it('Then input is NOT any (regression guard)', () => {
        service('test', {
          actions: {
            send: action({
              body: s.object({ name: s.string() }),
              response: s.object({ ok: s.boolean() }),
              handler: async (input) => {
                // If input were any, this would compile. With proper typing, it errors.
                // @ts-expect-error — input.name is string, not assignable to number
                const _num: number = input.name;
                void _num;
                return { ok: true };
              },
            }),
          },
        });
      });
    });

    describe('When the handler returns a wrong shape', () => {
      it('Then TypeScript rejects the return type', () => {
        service('test', {
          actions: {
            send: action({
              body: s.object({ taskId: s.uuid() }),
              response: s.object({ sent: s.boolean() }),
              // @ts-expect-error — return type { wrong: true } doesn't match { sent: boolean }
              handler: async (_input) => ({ wrong: true }),
            }),
          },
        });
      });
    });

    describe('When the action has no body (GET)', () => {
      it('Then input is unknown', () => {
        service('test', {
          actions: {
            status: action({
              method: 'GET',
              response: s.object({ ok: s.boolean() }),
              handler: async (input, _ctx) => {
                expectTypeOf(input).toBeUnknown();
                return { ok: true };
              },
            }),
          },
        });
      });
    });
  });

  // -------------------------------------------------------------------------
  // Service ctx is typed (complementary constraint fix)
  // -------------------------------------------------------------------------

  describe('Given a service with inject and action()', () => {
    const tasksEntity = entity('tasks', { model: tasksModel });

    describe('When the handler accesses ctx', () => {
      it('Then ctx is any — action() pre-types ctx, constraint cannot re-narrow', () => {
        service('notif', {
          inject: { tasks: tasksEntity },
          actions: {
            send: action({
              body: s.object({ id: s.uuid() }),
              response: s.object({ ok: s.boolean() }),
              handler: async (_input, ctx) => {
                // ctx is any when using action() — documented tradeoff
                expectTypeOf(ctx).toBeAny();
                return { ok: true };
              },
            }),
          },
        });
      });
    });
  });

  // -------------------------------------------------------------------------
  // Entity action: input typed from action(), ctx/row are any
  // -------------------------------------------------------------------------

  describe('Given an entity action with action() wrapper', () => {
    describe('When the handler accesses input', () => {
      it('Then input is typed from body schema', () => {
        entity('tasks', {
          model: tasksModel,
          actions: {
            complete: action({
              body: s.object({ reason: s.string() }),
              response: s.object({ done: s.boolean() }),
              handler: async (input, _ctx, _row) => {
                expectTypeOf(input.reason).toBeString();
                // @ts-expect-error — 'nonExistent' doesn't exist on input
                void input.nonExistent;
                // Note: _ctx and _row are any — documented tradeoff
                return { done: true };
              },
            }),
          },
        });
      });
    });
  });

  // -------------------------------------------------------------------------
  // Inline entity action (no wrapper): ctx/row typed, input any
  // -------------------------------------------------------------------------

  describe('Given an entity action WITHOUT action() wrapper', () => {
    describe('When the handler accesses ctx and row', () => {
      it('Then ctx and row are typed from model (status quo preserved)', () => {
        entity('tasks', {
          model: tasksModel,
          actions: {
            complete: {
              body: { parse: (v: unknown) => ({ ok: true as const, data: v as { reason: string } }) },
              response: { parse: (v: unknown) => ({ ok: true as const, data: v as { done: boolean } }) },
              handler: async (_input, _ctx, row) => {
                // ctx and row are typed from entity constraint
                if (row) row.title satisfies string;
                return { done: true };
              },
            },
          },
        });
      });
    });
  });

  // -------------------------------------------------------------------------
  // Backward compat: inline service action still compiles after constraint fix
  // -------------------------------------------------------------------------

  describe('Given a service action WITHOUT action() wrapper (backward compat)', () => {
    it('Then inline actions still compile after TCtx constraint change', () => {
      service('test', {
        actions: {
          ping: {
            response: { parse: (v: unknown) => ({ ok: true as const, data: v as { ok: boolean } }) },
            handler: async () => ({ ok: true }),
          },
        },
      });
    });
  });

  // -------------------------------------------------------------------------
  // Content descriptor support
  // -------------------------------------------------------------------------

  describe('Given action() with content descriptor schemas', () => {
    it('Then content.xml() types input as string', () => {
      // Deferred to Phase 1 implementation — content descriptors implement SchemaLike<string>
    });
  });
});
```

---

## Implementation Plan

### Phase 1: `action()` helper + service TCtx fix + type tests

**Scope:** Add the `action()` function, fix service constraint TCtx, add comprehensive `.test-d.ts` coverage with negative tests that catch `any` poisoning.

**Acceptance criteria:**
```typescript
describe('Feature: action() helper types input from body schema', () => {
  describe('Given action() with s.object() body', () => {
    describe('When handler accesses input', () => {
      it('Then input is typed, not any', () => {})
      it('Then wrong property access is a compile error', () => {})
      it('Then input.field assigned to wrong type is a compile error (not-any guard)', () => {})
    })
    describe('When handler returns wrong type', () => {
      it('Then compile error on mismatched return', () => {})
    })
  })
  describe('Given action() without body', () => {
    describe('When handler accesses input', () => {
      it('Then input is unknown', () => {})
    })
  })
  describe('Given service() with inject and action()', () => {
    describe('When handler accesses ctx', () => {
      it('Then ctx.entities is typed from inject map', () => {})
    })
  })
  describe('Given entity() with action() wrapper', () => {
    describe('When handler accesses input', () => {
      it('Then input is typed from body schema', () => {})
    })
  })
  describe('Given action() with content descriptors', () => {
    describe('When body is content.xml()', () => {
      it('Then input is string', () => {})
    })
  })
  describe('Given action() with ResponseDescriptor return', () => {
    describe('When handler returns response({ data: wrongShape })', () => {
      it('Then compile error on mismatched data', () => {})
    })
  })
  describe('Backward compat', () => {
    describe('Given inline service action after TCtx constraint change', () => {
      it('Then still compiles', () => {})
    })
    describe('Given inline entity action', () => {
      it('Then ctx/row still typed from entity constraint', () => {})
    })
  })
})
```

**Files:**
- `packages/server/src/action.ts` — new file, `action()` function + `ActionDef` type
- `packages/server/src/index.ts` — export `action`, `ActionDef`
- `packages/server/src/service/service.ts` — fix TCtx constraint
- `packages/server/src/__tests__/action.test-d.ts` — type tests with negative cases
- `packages/server/src/__tests__/action.test.ts` — runtime tests (action() is identity)

### Phase 2: EntityDefinition `__actions` phantom

**Scope:** Add `__actions` phantom field to `EntityDefinition`, propagate TActions through `entity()` return type.

**Acceptance criteria:**
```typescript
describe('Feature: EntityDefinition preserves action types', () => {
  describe('Given entity() with typed actions', () => {
    describe('When extracting action types from definition', () => {
      it('Then __actions phantom carries concrete types', () => {})
      it('Then input/output types are extractable via conditional types', () => {})
    })
    describe('When using EntityDefinition in arrays', () => {
      it('Then EntityDefinition<TModel> is assignable to EntityDefinition[]', () => {})
    })
  })
})
```

**Files:**
- `packages/server/src/entity/types.ts` — add `__actions` phantom + TActions generic to `EntityDefinition`
- `packages/server/src/entity/entity.ts` — return `EntityDefinition<TModel, TActions>`
- `packages/server/src/entity/__tests__/entity.test-d.ts` — phantom type + array compat tests

### Phase 3: Update examples + docs + changeset

**Scope:** Update entity-todo example and docs to use `action()`. Add changeset.

**Files:**
- `examples/entity-todo/src/api/actions/webhooks/webhooks.service.ts` — wrap with `action()`
- `packages/mint-docs/` — action definition docs
- `.changeset/` — patch changeset for `@vertz/server`
