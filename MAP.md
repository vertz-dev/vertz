# vertz Design Docs Map

> Central index of architectural decisions, specs, and design debates.

---

## Entity/Domain Layer

> Foundational layer for business logic, data modeling, and access control.

| Doc | Status | Description |
|-----|--------|-------------|
| [Entity-Driven Architecture (EDA)](plans/entity-driven-architecture.md) | 🔄 In Progress | Foundational design for vertz's middle layer between DB and UI. Defines entity(), action(), service(), domain() primitives with DDD alignment. |

---

## Testing & DX Debates

> Research and trade-off analysis for testing strategies and developer experience.

### E2E Testing DX

| Doc | Status | Description |
|-----|--------|-------------|
| [E2E Testing DX: Hybrid DSL](plans/debate-e2e-testing-dx-hybrid-dsl.md) | 📋 Draft | Debate on hybrid DSL approach for E2E tests. |
| [E2E Testing DX: Natural Language](plans/debate-e2e-testing-dx-natural-language.md) | 📋 Draft | Debate on natural language test authoring. |
| [E2E Testing DX: Type-Safe](plans/debate-e2e-testing-dx-type-safe.md) | 📋 Draft | Debate on type-safe test definitions. |

### Framework DX

| Doc | Status | Description |
|-----|--------|-------------|
| [Framework DX: Explicit Control](plans/debate-e2e-dx-explicit-control.md) | 📋 Draft | Debate on explicit vs implicit framework control. |
| [Framework DX: LLM-Native](plans/debate-e2e-dx-llm-native.md) | 📋 Draft | Debate on LLM-native tooling approach. |
| [Framework DX: Zero Boilerplate](plans/debate-e2e-dx-zero-boilerplate.md) | 📋 Draft | Debate on zero-boilerplate philosophy. |

---

## Other Design Docs

- [Database Design](plans/db-design.md)
- [Entity-Aware API](plans/entity-aware-api.md)
- [UI Design](plans/ui-design.md)
- [vertz Core API Design](plans/vertz-core-api-design.md)
- [Access System](plans/access-system.md)
- [Auth Module Spec](plans/auth-module-spec.md)
