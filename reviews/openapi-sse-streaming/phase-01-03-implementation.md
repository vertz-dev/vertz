# Implementation Review: OpenAPI SSE/Streaming

- **Author:** osaka
- **Reviewer:** adversarial-review-agent
- **Commits:** 44ee93034..b06695496
- **Date:** 2026-04-02

## CI Status
- [x] Quality gates passed (268 tests, 0 failures)

## Review Checklist
- [x] Delivers what the ticket asks for
- [x] TDD compliance
- [x] No type gaps or missing edge cases
- [x] No security issues
- [x] Public API changes match design doc

## Findings

### Changes Requested

#### 1. [should-fix] `validateUniqueMethodNames` does not account for the `Stream` suffix collision

**Severity:** should-fix

**Location:** `packages/openapi/src/generators/resource-generator.ts`, lines 84-108 and 46-62

**Problem:** `validateUniqueMethodNames()` runs on the original `resource.operations` before the dual-content expansion. It checks `op.methodName` values, but the generator later appends `'Stream'` to create a streaming variant for dual-content operations. This means a collision between the expanded `methodName + 'Stream'` and an existing operation's `methodName` is never detected.

**Reproduction scenario:** A resource has:
1. Operation `listTasks` with `methodName: 'list'`, dual content type (JSON + SSE)
2. Operation `listTasksStream` with `methodName: 'listStream'`

The validator sees `list` and `listStream` -- no duplicate detected. But the generator produces three methods: `list` (JSON from op1), `listStream` (SSE from op1), and `listStream` (from op2). The second `listStream` silently overwrites the first in the JavaScript object literal, producing incorrect generated code with no error.

**Fix:** After checking original method names, also check that `op.methodName + 'Stream'` does not collide with any existing method name when the operation has `op.streamingFormat && op.jsonResponse`. Example:

```ts
// After the existing duplicate check:
for (const op of resource.operations) {
  if (op.streamingFormat && op.jsonResponse) {
    const streamName = op.methodName + 'Stream';
    if (seen.has(streamName)) {
      throw new Error(
        `Method name collision: dual-content operation "${op.operationId}" generates ` +
        `"${streamName}" which conflicts with existing method "${streamName}" in resource "${resource.name}".`
      );
    }
  }
}
```

---

#### 2. [nit] No test for GET streaming endpoint with query params

**Severity:** nit

**Location:** `packages/openapi/src/generators/__tests__/resource-generator.test.ts`

**Problem:** There is a test for POST + body + query + streaming (line 748), but no test for GET + query + streaming (without a body). While the code handles this correctly (param generation is method-agnostic), the test gap means this combination is not explicitly verified.

**Suggestion:** Add a test case for a GET streaming operation with query params to verify the generated signature is `(query?: XxxQuery, options?: { signal?: AbortSignal }): AsyncGenerator<T>` and the call includes `query` in the options object.

---

#### 3. [nit] No test for SSE + NDJSON both present in a single response

**Severity:** nit

**Location:** `packages/openapi/src/parser/__tests__/openapi-parser.test.ts`

**Problem:** `getStreamingContentSchema` has an implicit precedence rule: SSE is checked before NDJSON. If a response declares both `text/event-stream` and `application/x-ndjson`, SSE wins silently. This is a reasonable default, but the behavior is untested. While this scenario is extremely unlikely in practice, documenting the precedence with a test makes the behavior explicit and prevents regressions.

---

#### 4. [nit] Generated code has a trailing `signal: options?.signal` even when streaming-only with no abort needed

**Severity:** nit (intentional per design doc)

**Location:** `packages/openapi/src/generators/resource-generator.ts`, line 196

**Problem:** `buildStreamingCall` always appends `signal: options?.signal` to the options object. When `options` is `undefined` (the argument is optional), this evaluates to `signal: undefined`. This is harmless -- `@vertz/fetch`'s `requestStream` simply ignores `undefined` values in its options. The design doc explicitly specifies this behavior, so this is correct but noted for completeness.

---

### Approved Items

1. **Parser changes are clean and well-structured.** `getStreamingContentSchema` follows the same pattern as `getJsonContentSchema`. The dual-content detection in `pickSuccessResponse` correctly separates JSON and streaming schemas. `$ref` resolution is properly handled by routing through `resolveSchemaForOutput`.

2. **Type additions are non-breaking.** `streamingFormat` and `jsonResponse` are optional fields on `ParsedOperation`, so existing consumers (types-generator, schema-generator) are unaffected.

3. **Generator correctly forks dual-content into two methods.** The `jsonOp` spread strips `streamingFormat` so the JSON method uses the standard `buildCall` path, while `streamOp` uses `buildStreamingCall`. The `jsonResponse: undefined` on `streamOp` prevents infinite recursion.

4. **Import collection handles all streaming scenarios.** `collectTypeImports` correctly adds both the streaming type and the JSON response type for dual-content operations, and handles the `unknown` fallback without generating an import for it.

5. **JSDoc `@throws` annotation is correctly emitted for every streaming method** and not for standard methods. This matches the design doc's error handling strategy.

6. **Integration tests cover the full pipeline** (parser -> grouper -> generator) for SSE, NDJSON, POST+body+SSE, schema-less SSE, and dual content types.

7. **Changeset is properly formatted** and references both issues (#2212, #2220).

8. **No `as any`, no `@ts-ignore`, no security issues.** The generated `encodeURIComponent` calls prevent path traversal in path params. No user input reaches `eval` or template strings without encoding.

## Resolution

All findings addressed:

1. **[should-fix] Stream suffix collision** — Fixed. `validateUniqueMethodNames()` now checks that `op.methodName + 'Stream'` does not collide with any existing method name for dual-content operations. Added test that verifies the error is thrown.

2. **[nit] GET streaming + query params test** — Added. New test verifies generated signature is `(query?: T, options?: { signal?: AbortSignal }): AsyncGenerator<T>` and call includes `query`.

3. **[nit] SSE + NDJSON precedence test** — Added. New parser test verifies SSE wins when both `text/event-stream` and `application/x-ndjson` are present.

4. **[nit] Trailing `signal: options?.signal`** — No change needed (intentional per design doc, noted for completeness).

Quality gates: 271 tests pass, typecheck clean, lint 0 errors.
