# @vertz/openapi

## 0.1.7

### Patch Changes

- [#2383](https://github.com/vertz-dev/vertz/pull/2383) [`f9e35e4`](https://github.com/vertz-dev/vertz/commit/f9e35e4cec498eb93192439e0c65f7cb3295c4da) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix `@vertz/openapi/adapters` export missing from dist. Add bunup config with all entry points (index, cli, adapters).

- Updated dependencies []:
  - @vertz/fetch@0.2.50

## 0.1.6

### Patch Changes

- [#2366](https://github.com/vertz-dev/vertz/pull/2366) [`3317b59`](https://github.com/vertz-dev/vertz/commit/3317b59a442f39d4a9ebb77e56fa2938d6f66ffe) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Add `@vertz/fetch` as a peer dependency (`>=0.2.47`) so package managers enforce the version that includes the `QueryParams` type fix (#2217).

## 0.1.5

### Patch Changes

- [#2243](https://github.com/vertz-dev/vertz/pull/2243) [`ca0007f`](https://github.com/vertz-dev/vertz/commit/ca0007f83b5be683fa1dfe4532a4d9ee846630d5) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Widen query param type from `Record<string, unknown>` to `QueryParams` (`object`) so typed interfaces from codegen are assignable without explicit index signatures.

## 0.1.4

### Patch Changes

- [#2225](https://github.com/vertz-dev/vertz/pull/2225) [`2a6392d`](https://github.com/vertz-dev/vertz/commit/2a6392d23dca5fb2c27819d0a6eb956e95f5405e) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(openapi): show raw tag names in duplicate method error, add index signature to query types

  The duplicate-method-names error now includes the raw OpenAPI tag names
  (e.g. `tags: "internal"`) so users know the exact value to pass to
  `excludeTags`. Previously only the sanitized resource name was shown.

  Generated query parameter interfaces now include `[key: string]: unknown`
  so they are assignable to `Record<string, unknown>` as expected by
  `FetchClient.get()`.

- [#2223](https://github.com/vertz-dev/vertz/pull/2223) [`267079a`](https://github.com/vertz-dev/vertz/commit/267079af4c89915b22b2eb0aba82dd9e3f4d13ad) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - fix(openapi): generate standalone types for recursive component schemas

  Component schemas with circular `$ref` references now produce proper type
  declarations in `types/components.ts` and `schemas/components.ts`.
  Previously, recursive references were emitted as bare type names that
  were never defined, causing TS2304 errors.

- [#2222](https://github.com/vertz-dev/vertz/pull/2222) [`0079387`](https://github.com/vertz-dev/vertz/commit/0079387c7d2dbc2d1094e785053070279d07d25d) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Shorten fallback type names by stripping redundant path segments from operationId.

  Generated type names like `ListBrandCompetitorsWebBrandIdCompetitorsGetQuery` are now shortened
  to `ListBrandCompetitorsQuery` by removing trailing HTTP method words and URL path segments that
  are already encoded in the operation's route.

  Closes #2219.

- [#2221](https://github.com/vertz-dev/vertz/pull/2221) [`1ceb0bc`](https://github.com/vertz-dev/vertz/commit/1ceb0bcf49dfb4779734ff1aa93c64632c0bba9e) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Support SSE and NDJSON streaming endpoints in generated SDKs.

  Endpoints with `text/event-stream` or `application/x-ndjson` response content types now generate
  `AsyncGenerator<T>` methods using `client.requestStream()`. Dual content-type responses (JSON +
  streaming) generate both a standard method and a `Stream`-suffixed streaming variant. All streaming
  methods include `AbortSignal` support and `@throws` JSDoc annotations.

  Closes #2212, closes #2220.

## 0.1.3

### Patch Changes

- [#2213](https://github.com/vertz-dev/vertz/pull/2213) [`f856b21`](https://github.com/vertz-dev/vertz/commit/f856b21979ab3f62ee20c8c11b2a0df7977c086e) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Fix identifier sanitization, CLI bin path, auth field casing, and fallback type names

  - Sanitize Zod schema variable names to produce valid JS identifiers (strip hyphens)
  - Fix CLI bin entry to import from dist/ instead of src/ for published package
  - Handle acronym-prefixed security scheme names (HTTPBearer → httpBearer)
  - PascalCase fallback type/schema names derived from operationId

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
