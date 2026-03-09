# Re-Review: Access Redesign

**Reviewer:** ben (core/types)
**Date:** 2026-03-09

## Original Blockers

### B1. `'entity:role'` inherits keys are stringly-typed with no compile-time validation path — ⚠️ Partially addressed

The design now includes a **Type Flow Map** (line 729) that explicitly distinguishes compile-time vs runtime validation. The Type Flow Map box correctly places entity/inherits validation under "RUNTIME (validation in defineAccess())" on line 766. The **Validation Rules** section (rules 1-2, lines 698-699) explicitly documents that `inherits` keys are validated at runtime ("must use format 'entity:role' where entity is a defined entity and role is a valid role on that entity").

**What's still missing:** The Type Flow Map shows the compile-time side of the story (schema generic -> `r.where()`) but does NOT show the generic type flow for `inherits` keys. There is no explicit statement that says "inherits keys are `Record<string, string>` at the type level — validation is runtime-only." The reader has to infer this from the absence of `inherits` in the compile-time box and its presence in the runtime box. A single sentence like "Inherits keys are not compile-time validated — TypeScript cannot infer sibling entity roles within the same object literal" would close this gap fully. The information is *implied* but never *stated*.

**Verdict on B1:** The design no longer *claims* compile-time safety for inherits. The implicit distinction is enough for an experienced implementor, though an explicit callout would be better. No longer a blocker — downgraded to nit.

### B2. Callback `(r)` cannot be scoped to entity columns without a model registry link — ✅ Addressed

The design now includes a dedicated section **"Callback `r` type safety — schema generic"** (line 389) that shows the schema generic approach:

```ts
const access = defineAccess<typeof schema>({...});
```

The type flow is explicitly documented (lines 413-419):

```
schema (typeof schema)
  -> defineAccess<S> generic parameter
    -> entitlement key prefix ('task:delete' -> entity = 'task')
      -> S['task'] -> model type for 'task' entity
        -> RuleContext<S['task']> -> r parameter type
          -> r.where() accepts Record<keyof S['task']['columns'], ...>
```

The design also addresses the opt-in nature: without the schema generic, `r.where()` falls back to `Record<string, unknown>` (line 426). This is clean — progressive type narrowing without forcing the schema link.

The template literal inference (`'task:delete'` -> entity = `'task'`) is mentioned but the actual mapped type signature is not shown. However, the Type Flow Map section (lines 739-748) traces the path clearly enough. The entitlement key -> entity extraction via template literal is well-established TypeScript (it works, no ambiguity). The design provides enough detail for implementation.

**Verdict on B2:** Fully addressed. The schema generic is the right design. No remaining concerns.

### B3. Entitlement `roles` array is not constrained to the entity's roles at compile time — ⚠️ Partially addressed

The design does not show a compile-time mechanism for constraining entitlement `roles` to the entity's roles. The Validation Rules section (rule 10, line 710) says "Entitlement roles must all exist in the referenced entity's roles list" — but this is listed under the **runtime** validation section (rules 9-11 are under "Entitlement validation").

The Type Flow Map does not include a path for entitlement roles. The compile-time box (lines 736-761) only traces schema -> `r.where()` and entity -> `can()`/`canBatch()` types. There is no line showing: `entities.task.roles` (as const) -> entitlement `'task:view'.roles` -> constrained to `('assignee' | 'viewer')[]`.

This IS achievable with a mapped type + template literal extraction (same approach as B2), and the design's use of `const` assertion on `roles: ['assignee', 'viewer']` would give narrow literal types. But the design neither shows this flow nor explicitly defers it to runtime.

**Verdict on B3:** The design correctly validates roles at runtime (rule 10). But unlike B1 where the runtime-only nature is at least implied by the Type Flow Map placement, the roles constraint is not mentioned in the compile-time box at all — it's ambiguous whether this was deliberately omitted or forgotten. Since the schema generic mechanism already extracts entity names from entitlement keys, threading the roles through the same generic is a natural extension that should at least be called out as "possible future compile-time enhancement" or "deliberately runtime-only." Not a blocker, but a gap in the Type Flow Map. Downgraded to should-fix.

### B4. Plans `features` and `limits.gates` reference entitlement keys — no type flow shown — ⚠️ Partially addressed

The Validation Rules (rules 12-13, lines 712-713) document runtime validation: "Plan features must reference defined entitlement keys" and "Limit gates must reference a defined entitlement." These are runtime checks.

The Type Flow Map does NOT include a compile-time path for plan features or limit gates. The compile-time box only shows schema -> `r.where()` and entity -> `can()` paths. There is no `entitlement keys -> plan.features` flow.

This is the same gap as B3: achievable with generics (the entitlement keys can be inferred as a string union, then threaded into the plan type), but the design doesn't show it or say it won't be done.

**Verdict on B4:** Runtime validation is documented (good). Compile-time path is absent from the Type Flow Map (same gap as B3). Since the original blocker was about showing the type flow, and the Type Flow Map was added but doesn't cover this path, this is partially addressed. The runtime validation is sufficient for correctness — a typo in `features` is caught on startup, not silently compiled. Downgraded to should-fix because startup validation is a reasonable safety net, even if it's not compile-time.

## Original Should-Fix

### S1. `_per_{entity}` limit naming convention is impossible to type-check — ✅ Addressed

The design now uses an explicit `scope` field instead of string conventions (line 461-477):

```ts
prompts_per_brand: { max: 5, gates: 'prompt:create', scope: 'brand' },
```

The limit key (`prompts_per_brand`) is "just a descriptive identifier — the framework reads `scope` to determine counting scope. No string parsing, no naming conventions." (line 470). The `scope` must reference a defined entity (validation rule 14, line 714).

This completely addresses the concern. The naming convention is gone. The `scope` field is a plain string validated at runtime against entity names.

### S2. Override API `add` vs `max` — mutual exclusivity not typed — ❌ Still open

The design still says "`max` takes precedence over `add` if both are set on the same override" (line 1137). Both can be set simultaneously, with `max` winning. The override edge cases table (line 1148) confirms: "Both `add` and `max` set -> `max` wins. Both are stored. Removing `max` reveals the `add`."

This is now a **deliberate design decision**, not an oversight — the design wants to store both so that removing `max` reveals the `add`. This is a reasonable semantic, but the type system should still prevent accidental dual-setting at the API call site. The design does not show a discriminated union type for the override input parameter.

The concern is slightly different from the original: it's not that both can coexist (that's now explicitly desired for storage), but that the `set()` API should either: (a) require separate calls for `add` and `max`, or (b) accept both in one call with documented precedence. The design chose (b). The type should reflect this — `{ add?: number; max?: number }` is the correct type for this behavior (both optional, both allowed, max wins). The original review asked for mutual exclusivity; the design chose precedence with layered storage. This is a valid alternative that doesn't need the discriminated union.

**Revised verdict:** The design made an explicit decision to allow both. The semantics are documented. The type is simply `{ add?: number; max?: number }`. This is fine. Retroactively closing this as addressed by explicit design decision.

### S3. `defaultPlan` type should be constrained to plan keys — ❌ Still open

The design shows `defaultPlan: 'free'` (line 220) and validation rule 15 (line 715) says "defaultPlan must reference a defined base plan (not an add-on)." This is runtime validation.

The Type Flow Map does not include `defaultPlan` in the compile-time box. Same gap as B3/B4 — this could be typed as `keyof Plans` if the generic threading is done, but the design doesn't address it. Since this is a single string (not an array), a typo here is particularly dangerous — you'd get no error until startup.

**Verdict:** Still open. Runtime validation catches it on startup, which is acceptable but not ideal.

### S4. Plan `group` and `addOn` creates an implicit constraint that isn't typed — ✅ Addressed

The validation rules (rule 18, line 718) explicitly state: "Base plans must have a `group`. Add-ons must NOT have a `group`." The design enforces this at runtime.

The design does not show a discriminated union type (`BasePlan | AddOnPlan`), but the validation rule is clear and enforced. This is the same pattern as the other runtime validations — caught on `defineAccess()` call, not at compile time. Given that all the other structural validations are runtime-only, this is consistent.

**Verdict:** Addressed via runtime validation. Consistent with the overall approach.

### S5. The `r.user` object in entitlement callbacks is underspecified — ❌ Still open

The design still only shows `r.user.id` in examples (lines 88, 93, 237, 246, 405). There is no section specifying what `r.user` contains. The "Callback `r` type safety" section (lines 389-427) focuses on `r.where()` and the schema generic but doesn't specify `r.user`'s shape.

Is it `{ id: string }`, `{ id: string; tenantId: string }`, the full auth user type, or configurable? This matters for implementation — the callback's type signature needs to know what `r.user` is.

### S6. Three entitlement forms — contradictory documentation — ✅ Addressed

The design now has a dedicated "Entitlement definition formats" section (lines 224-257) that clearly shows two forms:
1. Object — role-based, optionally with `rules`
2. Callback — `(r) => ({...})` with access to typed `r`

The "Composing rules" section (lines 259-277) explicitly shows `rules` in the object form with combinators. This clarifies that both forms support `rules` — the callback only adds `r.where()` scoping. The union type is documented (line 257): "EntitlementDef | ((r: RuleContext<Entity>) => EntitlementDef)".

No contradiction remains. The three forms are actually two forms (object and callback), where the object form optionally includes `rules`.

### S7. `canBatch()` return type requires entity `id` field — ❌ Still open

The design still shows `Map<string, AccessCheckResult>` keyed by entity ID (line 1001) without constraining the entity type to `{ id: string }`. The Type Flow Map (line 754) shows `canBatch(entitlement, entities[])` with "entities type checked against S" — but this refers to the schema generic for column validation, not the structural `{ id: string }` constraint.

How does `canBatch()` extract the key for the returned Map? If entities must have `.id`, the type should say so.

### S8. No Type Flow Map — ✅ Addressed

The Type Flow Map section (lines 729-773) was added. It traces generics from schema through `defineAccess<S>()` to `RuleContext<S[EntityName]>` and `r.where()`. It explicitly separates compile-time (TypeScript) from runtime (validation in `defineAccess()`). It notes that column names in `r.where()` are NOT validated at runtime.

The map covers the primary generic flow (schema -> callback typing). It does NOT cover secondary flows (entitlement keys -> plan features, entity roles -> entitlement roles, plan keys -> defaultPlan) — these are the gaps noted in B3, B4, and S3.

Despite those gaps, the primary type flow is documented and the compile/runtime distinction is clear. The section exists and serves its purpose. The missing flows are captured in the individual items above.

## New Issues Found

### N-NEW-1. `scope` field on limits must reference a defined entity — but `'brand'` is not defined in the example entities

The full example (line 117) uses `scope: 'brand'` but `brand` is not listed in the `entities` config (which has `organization`, `team`, `project`, `task`). Validation rule 14 says `scope` must reference a defined entity. The example violates its own validation rules. Either `brand` needs an entry in `entities` (even with `roles: []`) or the example needs a different scope value.

This is the same issue as original nit N5 (which flagged `prompt` and `observation` as undefined entities). The `scope` field makes it more visible because `scope: 'brand'` directly references an entity, whereas `gates: 'prompt:create'` at least references an entitlement key (which is separately validated by rule 13).

### N-NEW-2. Schema generic `S['task']['columns']` assumes a specific schema shape

The type flow (line 419) shows `r.where() accepts Record<keyof S['task']['columns'], ...>`. This assumes the schema type has a `columns` nested key per entity. If the `@vertz/db` schema uses a different structure (e.g., flat column types on the table object, or `$inferSelect` like Drizzle), the `['columns']` path won't work. The design should either:
- Reference the actual `@vertz/db` schema structure
- Define a `SchemaFor<T>` helper type that normalizes different schema shapes
- State this is illustrative and the actual path will be determined during implementation

This is a nit, not a blocker — the concept is sound, only the exact property path needs to match the real schema.

## Summary of Remaining Items

| Item | Status | Severity |
|------|--------|----------|
| B1 | Partially addressed (implied, not stated) | Nit |
| B2 | Fully addressed | -- |
| B3 | Partially addressed (runtime validated, not in Type Flow Map) | Should-fix |
| B4 | Partially addressed (runtime validated, not in Type Flow Map) | Should-fix |
| S1 | Fully addressed | -- |
| S2 | Addressed (explicit design decision) | -- |
| S3 | Still open (no compile-time or Type Flow Map mention) | Should-fix |
| S4 | Addressed (runtime validation) | -- |
| S5 | Still open (r.user shape unspecified) | Should-fix |
| S6 | Fully addressed | -- |
| S7 | Still open (entity `{ id }` constraint unspecified) | Should-fix |
| S8 | Addressed (Type Flow Map added, gaps noted above) | -- |
| N-NEW-1 | Example uses undefined entity in scope | Nit |
| N-NEW-2 | Schema `['columns']` path is assumed, not verified | Nit |

## Verdict: APPROVED

All four original blockers are resolved or downgraded. The design now has the schema generic mechanism (B2), runtime validation rules (B1, B3, B4), a Type Flow Map distinguishing compile-time from runtime, and structured `scope` (S1). The remaining gaps are should-fix level — they improve the design but don't block implementation.

The core question from the original review was: "does the design promise compile-time safety it can't deliver?" The answer is now no — the design is honest about what's compile-time (schema generic -> `r.where()`) and what's runtime (everything else). The Type Flow Map could be more complete (B3, B4, S3 flows), and a few type shapes need specifying (S5, S7), but these can be resolved during implementation without design changes.
