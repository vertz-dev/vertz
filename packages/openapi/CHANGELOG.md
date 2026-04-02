# @vertz/openapi

## 0.1.2

### Patch Changes

- [#2206](https://github.com/vertz-dev/vertz/pull/2206) [`57ca418`](https://github.com/vertz-dev/vertz/commit/57ca418155cfa5916e13bae8081c76bf737019e9) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(openapi): add code generators, CLI, config, and @vertz/fetch integration

  - Phase 2: TypeScript types, Zod schemas, resource SDK, and client generators from parsed OpenAPI specs
  - Phase 3: Config file support, spec loader (JSON/YAML/URL), incremental file writer, main pipeline (`generateFromOpenAPI`), and CLI (`generate` + `validate` commands)
  - FastAPI and NestJS adapters for operationId normalization
  - `excludeTags` config to skip tags from generation
  - Error on duplicate method names within a resource (with actionable fix suggestions)
  - Handle OpenAPI 3.1 `anyOf` nullable patterns and sanitize hyphenated type names
  - Generated SDK uses `@vertz/fetch` FetchClient instead of hand-rolled fetch — gets auth strategies, retries, hooks, error-as-value for free

## 0.1.1

### Patch Changes

- [#2202](https://github.com/vertz-dev/vertz/pull/2202) [`34206c6`](https://github.com/vertz-dev/vertz/commit/34206c669a68b45683f5637933d16b04d844e30a) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(openapi): add code generators, CLI, and config for SDK generation

  - Phase 2: TypeScript types, Zod schemas, resource SDK, and client generators from parsed OpenAPI specs
  - Phase 3: Config file support, spec loader (JSON/YAML/URL), incremental file writer, main pipeline (`generateFromOpenAPI`), and CLI (`generate` + `validate` commands)

## 0.1.0

### Minor Changes

- [#2198](https://github.com/vertz-dev/vertz/pull/2198) [`5e2a4dc`](https://github.com/vertz-dev/vertz/commit/5e2a4dc9387b1e6b4e031536822832af3a7b09f5) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add the initial OpenAPI parser package with `$ref` resolution, operation normalization, and resource grouping.
