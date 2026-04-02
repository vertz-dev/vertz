---
'@vertz/openapi': patch
---

feat(openapi): add code generators, CLI, config, and @vertz/fetch integration

- Phase 2: TypeScript types, Zod schemas, resource SDK, and client generators from parsed OpenAPI specs
- Phase 3: Config file support, spec loader (JSON/YAML/URL), incremental file writer, main pipeline (`generateFromOpenAPI`), and CLI (`generate` + `validate` commands)
- FastAPI and NestJS adapters for operationId normalization
- `excludeTags` config to skip tags from generation
- Error on duplicate method names within a resource (with actionable fix suggestions)
- Handle OpenAPI 3.1 `anyOf` nullable patterns and sanitize hyphenated type names
- Generated SDK uses `@vertz/fetch` FetchClient instead of hand-rolled fetch — gets auth strategies, retries, hooks, error-as-value for free
