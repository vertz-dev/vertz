# Phase 01 Review — mike (Architecture)

## Scope
Overall architecture of the entity-centric redesign, backward compatibility strategy, design doc alignment.

## Findings

### Blockers
None.

### Should-Fix
None.

### Observations

- **Backward compatibility strategy is sound.** The key architectural decision — deriving `hierarchy`, `roles`, and `inheritance` from the `entities` config — preserves the contract for all downstream consumers (`access-context.ts`, `access-set.ts`, `role-assignment-store.ts`) without requiring changes to those files. This is the right approach for Phase 1: change input, preserve output shape.

- **`EntitlementDef.plans` shim is acceptable.** Adding `plans?: string[]` back to `EntitlementDef` keeps `access-context.ts` and `access-set.ts` type-clean. Since the new `defineAccess()` never populates `plans`, the `entDef.plans?.length` guards in those files always evaluate to falsy — plan checks are effectively no-ops. This is fine for Phase 1 since plan validation is Phase 2's scope.

- **Hierarchy inference is correctly scoped.** Entities not in any inheritance chain are included in the hierarchy (appended at the end). This matches the spec: standalone entities are valid, they just don't participate in inheritance.

- **Design doc alignment:** Phase 1 spec in `plans/access-redesign/phase-01-entity-restructuring.md` lists all validation rules (1-8 entities, 9-11 entitlements, 20-21 inheritance direction). All are implemented and tested. Plan validation (rules 12-19) is correctly deferred.

- **New types are exported.** `EntityDef`, `EntitlementValue`, and `RuleContext` are now exported from both `auth/index.ts` and `src/index.ts`. This enables consumers to type-annotate their own configs.

- **No cross-cutting changes.** The change is entirely contained within `define-access.ts` (source) and test files. No changes to `access-context.ts`, `access-set.ts`, `role-assignment-store.ts`, or any other runtime files. Clean separation.

### Risk Assessment
Low risk. The change is additive at the type level (new input format, same output shape) and the backward-compat strategy means downstream code doesn't need updating. The only risk is if a consumer depends on the old `DefineAccessInput` shape directly — but that's the whole point of a breaking change in pre-v1.

### Verdict
**Pass.** Architecture is clean, backward compatibility is maintained, and the change is well-scoped to Phase 1 deliverables.
