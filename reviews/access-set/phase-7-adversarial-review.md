# Access Set — Adversarial Review

## Sub-Phase 7.1: Server computeAccessSet + encoding

### Findings

1. **computedAt non-determinism** — `computeAccessSet` uses `new Date().toISOString()` for `computedAt`, causing the encoded JSON to differ between invocations even when the access set is logically identical. This was caught and fixed: ETag hash and JWT acl hash now exclude `computedAt` from the hash payload. RESOLVED.

2. **No pagination on getRolesForUser** — `getRolesForUser` scans all assignments linearly. For production with many users, this is O(n) per call. Acceptable for v0 with InMemoryStore but should be indexed in production stores. NON-BLOCKING.

3. **resolveInheritedRole only supports linear hierarchy** — If the hierarchy had branching (A -> B, A -> C), the current code only follows a linear chain. This matches the design (linear hierarchy array) so is correct. VERIFIED.

4. **Sparse encoding strips all denied-without-meta entries** — Missing entitlements default to denied on decode. Edge case: if a new entitlement is added to the definition after encoding, decodeAccessSet fills it in as denied. This is correct behavior. VERIFIED.

## Sub-Phase 7.2: JWT Integration

### Findings

1. **2KB budget includes full encoded JSON** — The `byteLength` check uses `new TextEncoder().encode(canonicalJson).length` where `canonicalJson` includes `computedAt`. Since `computedAt` is ~30 bytes, this slightly reduces the effective budget. Acceptable tradeoff. NON-BLOCKING.

2. **overflow=true sends no set** — When the encoded set exceeds 2KB, only the hash is sent. Client must fetch from GET /api/auth/access-set. This is by design. VERIFIED.

3. **ETag uses plain hash, not quoted** — RFC 7232 specifies ETags should be quoted (`"hash"`). Current implementation uses bare hash. The comparison still works because both sides use the same format. Minor non-compliance, non-blocking.

## Sub-Phase 7.3: Client-side can() + AccessContext

### Findings

1. **FALLBACK_DENIED is static, not reactive** — When `can()` is called without a provider, it returns a static object with plain properties (`{ value: false }`), not actual signals. This is intentional: it logs a warning and returns safe defaults. If someone later wraps it in a Provider, the existing `can()` calls won't react. This is acceptable because the warning tells developers to fix it. VERIFIED.

2. **computed() in can() captures context at call time** — The `useAccessContext()` call inside `can()` reads the context synchronously. The computed signals then derive from the access set signal. If the entity parameter is reactive (signal-wrapped), it won't auto-update. This matches the design: entity is treated as a plain value snapshot. VERIFIED.

3. **Stable ID for AccessContext** — Uses `@vertz/ui::AccessContext` per the stable-id convention. VERIFIED.

## Sub-Phase 7.4: AccessGate + createAccessProvider

### Findings

1. **AccessGate explicit return type `: unknown`** — Required by `isolatedDeclarations`. The alternative would be to make the function more specific but since it returns either the fallback or children result (both unknown), this is correct. VERIFIED.

2. **createAccessProvider reads from globalThis** — The SSR hydration reads from `window.__VERTZ_ACCESS_SET__`. In non-browser environments, `window` may not exist. The `typeof window !== 'undefined'` guard handles this. VERIFIED.

## Sub-Phase 7.5: SSR + Compiler Integration

### Findings

1. **XSS escaping in createAccessSetScript** — Escapes `<`, `\u2028`, `\u2029`. This prevents script injection via `</script>` or line separator characters. Nonce attribute is also escaped. VERIFIED.

2. **Manifest loader extended for @vertz/ui/* subpaths** — The condition `moduleSpecifier.startsWith('@vertz/ui/')` correctly matches `@vertz/ui/auth` but not `@vertz/ui-compiler` (which starts with `@vertz/ui-`). VERIFIED.

3. **can registered in SIGNAL_API_REGISTRY** — Properties: allowed, reasons, reason, meta, loading. Matches the AccessCheck type. VERIFIED.

## Sub-Phase 7.6: Integration Tests

### Findings

1. **package.json exports mismatch with bunup output** — Adding `src/auth/public.ts` as a 9th entry point caused bunup to change its output directory structure from `dist/` to `dist/src/`. Package.json exports were updated to match. This is a fragile coupling between bunup's internal common-prefix detection and the package.json. Should be noted for future entry point additions. NOTED.

2. **verifyJWT imported from non-public path** — `../../node_modules/@vertz/server/src/auth/jwt` is used because `verifyJWT` is not part of the public API. This is acceptable for integration tests that need to verify JWT internals. NON-BLOCKING.

3. **Dynamic import for @vertz/ui/auth** — Client tests use `await import('@vertz/ui/auth')` to avoid module resolution at load time. This works because the test runner resolves the import lazily. VERIFIED.

## Overall Assessment

The implementation matches the design doc. All 6 sub-phases are complete with passing tests. Key trade-offs (non-deterministic computedAt, linear hierarchy assumption, 2KB budget) are reasonable for v0. The ETag hash fix was critical and was caught during testing.

**Status: APPROVED with minor notes**
