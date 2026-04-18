# Phase 3: TypeScript integration test with real Anthropic SDK + docs + changeset

## Context

Phases 1 and 2 landed the runtime change. Phase 3 proves end-to-end that a Vertz server handler can now instantiate `@anthropic-ai/sdk` without `dangerouslyAllowBrowser`, documents the server-environment guarantee, and adds a changeset.

**Design reference:** `plans/2760-browser-detection-fix.md`, "E2E Acceptance Test" section.

## Tasks

### Task 3.1: Add `@anthropic-ai/sdk` as a dev dependency of integration-tests

**Files:** (2)
- `packages/integration-tests/package.json` (modified — add `@anthropic-ai/sdk` to `devDependencies`; pin to a version with stable browser-check semantics, e.g. `^0.88.0`)
- `vertz.lock` (modified — will update automatically via `vtz install`)

**What to implement:**

```bash
cd packages/integration-tests && vtz add @anthropic-ai/sdk --dev
```

Verify:
- Lock file updates
- `vtz install` from repo root succeeds

**Acceptance criteria:**
- [ ] `@anthropic-ai/sdk` appears in `packages/integration-tests/package.json` under `devDependencies`
- [ ] `vertz.lock` is updated and committed
- [ ] `vtz install` is idempotent after the change

---

### Task 3.2: Integration test: handler constructs Anthropic SDK without the flag (RED→GREEN)

**Files:** (1)
- `packages/integration-tests/src/__tests__/server-clean-env.test.ts` (new)

**What to implement:**

Write a test that boots the Vertz server in a test harness, registers a handler that constructs `new Anthropic({ apiKey })`, and asserts the construction does not throw. Do NOT make a real API call — we're only testing the environment check.

```ts
import { describe, it, expect } from '@vertz/testing';
import { createTestServer } from '@vertz/testing';

describe('Feature: server handlers see a Worker-like environment', () => {
  describe('Given a handler evaluates typeof window', () => {
    it('then the result is "undefined"', async () => {
      const server = await createTestServer({
        handlers: {
          typeOfWindow: async () => typeof window,
        },
      });
      const result = await server.invoke('typeOfWindow');
      expect(result).toBe('undefined');
      await server.close();
    });
  });

  describe('Given a handler constructs @anthropic-ai/sdk', () => {
    it('then construction succeeds without dangerouslyAllowBrowser', async () => {
      const server = await createTestServer({
        handlers: {
          construct: async () => {
            const Anthropic = (await import('@anthropic-ai/sdk')).default;
            const client = new Anthropic({ apiKey: 'test-key' });
            return !!client;
          },
        },
      });
      const result = await server.invoke('construct');
      expect(result).toBe(true);
      await server.close();
    });
  });

  describe('Given a handler evaluates typeof document', () => {
    it('then the result is "undefined"', async () => {
      const server = await createTestServer({
        handlers: {
          typeOfDocument: async () => typeof document,
        },
      });
      const result = await server.invoke('typeOfDocument');
      expect(result).toBe('undefined');
      await server.close();
    });
  });
});
```

**Important:** Follow `.claude/rules/integration-test-safety.md`. If the test uses a real server port, WebSocket, or file watcher, use the patterns in that doc (afterEach cleanup, timeouts on waits, `.local.ts` suffix if CI-unsafe).

If `createTestServer` does not exist, study how existing integration tests boot handlers (see `packages/integration-tests/src/__tests__/` for conventions) and either add a minimal test harness or invoke the runtime directly.

**Acceptance criteria:**
- [ ] Test compiles and runs via `vtz test packages/integration-tests/src/__tests__/server-clean-env.test.ts`
- [ ] Before Phase 1+2 changes, the `construct` test would fail with the "browser-like environment" error (verify by temporarily reverting the change on a local branch, optional)
- [ ] After Phase 1+2 changes, all three tests pass
- [ ] Test cleans up resources in `afterEach` per integration-test-safety rules

---

### Task 3.3: Update Mintlify docs

**Files:** (2)
- `packages/mint-docs/guides/server/environment.mdx` (new OR modified — if a "Server environment" page exists, update it; otherwise create)
- `packages/mint-docs/docs.json` (modified only if adding a new page to the nav)

**What to implement:**

Add a short page or section describing the server runtime environment:

```mdx
---
title: Server Environment
description: What globals and APIs are available in Vertz server handlers
---

Vertz server handlers run in a Cloudflare-Workers-compatible JavaScript
environment. What you can rely on:

**Available:**
- `fetch`, `URL`, `URLSearchParams`, `Request`, `Response`, `Headers`, `AbortController`
- `navigator.userAgent` (identifies the Vertz server)
- `crypto`, `performance`, `setTimeout`, `queueMicrotask`
- Standard ECMAScript: `Promise`, `Map`, `Set`, `WeakMap`, `Intl`, etc.
- Vertz APIs: `service()`, `entity()`, and everything in `@vertz/server`

**Not available (by design):**
- `window`, `document`, `HTMLElement`, `Element`, `Node` and other DOM APIs
- `location`, `history`, `localStorage`, `sessionStorage`

### Using third-party SDKs

Because server handlers do not expose browser globals, SDKs that gate on
`typeof window !== 'undefined'` (such as `@anthropic-ai/sdk`, `openai`, or
`stripe`) work out of the box — no `dangerouslyAllowBrowser: true` flag
required.

```ts
import Anthropic from '@anthropic-ai/sdk';
import { service } from '@vertz/server';

export default service({
  summarize: async ({ text }: { text: string }) => {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
    // Just works — no browser flag needed.
    return client.messages.create({ /* … */ });
  },
});
```

### Why this matters

If you previously worked around this by passing `dangerouslyAllowBrowser:
true`, you can now remove that flag. The flag disables a legitimate safety
check that prevents API keys from leaking into client bundles — keeping it
enabled in a handler is confusing and unsafe if the file is ever imported
by client code.
```

**Acceptance criteria:**
- [ ] Page renders in the Mintlify preview
- [ ] Nav includes the page under Server / Environment (if docs.json needs updating)
- [ ] Content aligns with the final behavior (no aspirational APIs mentioned)

---

### Task 3.4: Add changeset

**Files:** (1)
- `.changeset/fix-server-browser-detection.md` (new)

**What to implement:**

```markdown
---
'@vertz/core': patch
---

fix(runtime): server handlers no longer expose browser globals (`window`,
`document`, etc.), so SDKs like `@anthropic-ai/sdk` work without
`dangerouslyAllowBrowser: true` [#2760]
```

Identify the correct package(s) to attribute the patch to. If the change is in the `vtz` runtime binary, the appropriate frontend package to mark may be `@vertz/cli-runtime`, `@vertz/runtime`, or both. Read `.changeset/config.json` to understand which packages participate in versioning and pick accordingly.

**Acceptance criteria:**
- [ ] Changeset file created with `patch` bump
- [ ] Correct package names referenced (verify against `.changeset/config.json`)
- [ ] Issue #2760 linked in the message

---

## Quality Gates

Before final PR:
- Full monorepo: `vtz test && vtz run typecheck && vtz run lint`
- Full Rust: `cd native && cargo test --all && cargo clippy --all-targets -- -D warnings && cargo fmt --all -- --check`
- `bash scripts/audit-window-document-refs.sh` clean

## Adversarial Review

After Phase 3 green, review must verify:
- Integration test actually fails with an untouched `dom_shim.rs` (briefly test by stashing the change, running the test, and confirming the "browser-like environment" error)
- Docs accurately describe the final behavior (e.g. if `navigator` is kept, the docs must say so; if `URL` and `URLSearchParams` come from deno_core not the shim, the docs shouldn't misattribute them)
- Changeset bumps the right packages

Write review to `reviews/2760-browser-detection-fix/phase-03-integration-tests-docs.md`.

## Post-Phase-3: Final PR

1. Rebase `viniciusdacal/v8-browser-detection` on `origin/main`
2. Re-run full quality gates after rebase
3. Push with `-u origin`
4. Open PR with title `fix(runtime): clean Node-like env for server handlers [#2760]`
5. PR body includes:
   - Public API Changes summary (none — internal runtime change)
   - Summary of all three phases
   - Links to per-phase review files
   - E2E acceptance test status
6. Monitor CI via `gh pr checks <pr-number> --watch` until green
7. Notify the user only once CI is green
