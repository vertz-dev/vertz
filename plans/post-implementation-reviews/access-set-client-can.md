# Retrospective: Access Set Bootstrap + Client-Side can() [#1021]

## What went well

- **Vertical slicing worked**: Each sub-phase produced independently testable, working code. The server-side (7.1-7.2) worked end-to-end before client-side work started.
- **TDD caught the ETag bug**: The ETag 304 test failed because `computedAt` was non-deterministic. Writing the test first exposed the issue before it could reach production.
- **Sparse encoding is elegant**: Only storing allowed entries + denied-with-meta in the JWT keeps the payload small while preserving full fidelity on decode.
- **Signal API registry integration**: Registering `can` in the reactivity manifest was straightforward thanks to the existing infrastructure.

## What went wrong

- **bunup output path fragility**: Adding a 9th entry point (`src/auth/public.ts`) caused bunup to change its output directory structure from `dist/` to `dist/src/`. This required updating all `exports` paths in `package.json`. The root cause is bunup's common-prefix detection algorithm, which changes behavior based on the number/pattern of entry points. This was a time-consuming detour.
- **computedAt in hash**: The `computeAccessSet` function includes `computedAt: new Date().toISOString()` in the access set. This was initially included in the ETag/JWT hash, making the hash non-deterministic. The fix was to hash only stable fields.

## How to avoid it

- **bunup output paths**: Before adding a new entry point to bunup, do a test build to verify the output structure matches package.json exports. Consider pinning the output structure explicitly in the config if bunup supports it.
- **Non-deterministic fields in hashes**: When computing content-based hashes, explicitly exclude time-varying fields. Create a `stablePayload` extraction pattern and document it.

## Process changes adopted

- Always verify bunup output structure after modifying entry points
- For content-based hashing, explicitly enumerate which fields are included rather than hashing the full serialized form
