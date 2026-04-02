---
'@vertz/openapi': patch
---

feat(openapi): add code generators, CLI, and config for SDK generation

- Phase 2: TypeScript types, Zod schemas, resource SDK, and client generators from parsed OpenAPI specs
- Phase 3: Config file support, spec loader (JSON/YAML/URL), incremental file writer, main pipeline (`generateFromOpenAPI`), and CLI (`generate` + `validate` commands)
