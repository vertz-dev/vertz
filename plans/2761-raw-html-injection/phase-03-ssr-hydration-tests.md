# Phase 3: SSR + Hydration Integration Tests

## Context

Phase 1 shipped the runtime helper and Phase 2 wired the compiler. This phase proves the full SSR → hydration → reactive-update roundtrip works end-to-end, using public package imports only. No production code changes expected — if an integration test uncovers a bug, fix it in the appropriate package and record the fix in the phase review.

**Design doc:** `plans/2761-raw-html-injection.md`
**Prereq:** Phases 1 and 2 landed.

---

## Task 3.1: SSR + hydration + reactive update integration test

**Files:** (≤3)
- `packages/ui-server/src/__tests__/inner-html-integration.test.ts` (new)
- (If a bug is uncovered) one fix file in `packages/ui/` or `packages/ui-server/` plus its existing unit test.

**What to implement:**

An integration test that uses the SSR render pipeline, the hydration entry point, and a reactive signal to prove all three paths agree:

```ts
// Pseudocode — adapt to the existing test patterns in packages/ui-server/src/__tests__/.
import { renderToString } from '@vertz/ui-server';
import { hydrate } from '@vertz/ui';
// choose existing helpers — use the same testing utilities as the other router/ui-server integration tests

describe('Feature: innerHTML across SSR + hydration + reactive update', () => {
  describe('Given a component with static innerHTML', () => {
    it('renders raw HTML on the server, preserves node identity on hydration, and applies reactive updates', async () => {
      function App({ html }: { html: string }) {
        return <pre className="code" innerHTML={html} />;
      }

      // 1. Server render
      const serverHtml = await renderToString(() => <App html="<b>x</b>" />);
      expect(serverHtml).toContain('<pre class="code"><b>x</b></pre>');

      // 2. Mount SSR markup + hydrate
      const root = mountHtml(serverHtml);
      const preBeforeHydrate = root.querySelector('pre');
      hydrate(() => <App html="<b>x</b>" />, root);
      // Hydration must not destroy the existing <pre> node.
      expect(root.querySelector('pre')).toBe(preBeforeHydrate);
      // innerHTML content preserved (identical bytes).
      expect(preBeforeHydrate!.innerHTML).toBe('<b>x</b>');

      // 3. Reactive update
      let html = '<b>x</b>';
      function Reactive() {
        return <pre innerHTML={html} />;
      }
      const root2 = document.createElement('div');
      // Use the same render entry point used by other reactivity tests
      renderInto(() => <Reactive />, root2);
      expect(root2.querySelector('pre')!.innerHTML).toBe('<b>x</b>');
      html = '<i>y</i>';
      await flushEffects();
      expect(root2.querySelector('pre')!.innerHTML).toBe('<i>y</i>');
    });
  });

  describe('Given a component with innerHTML set to undefined', () => {
    it('renders empty content on both server and client', async () => {
      const server = await renderToString(() => <pre innerHTML={undefined} />);
      expect(server).toContain('<pre></pre>');
      // client path
      const el = <pre innerHTML={undefined} />;
      expect(el.innerHTML).toBe('');
    });
  });

  describe('Given innerHTML text equivalent to SSR output', () => {
    it('hydration does not produce a console warning about content mismatch', async () => {
      const serverHtml = await renderToString(() => <pre innerHTML="<b>x</b>" />);
      const root = mountHtml(serverHtml);
      const warnings: string[] = [];
      const orig = console.warn;
      console.warn = (...args) => { warnings.push(args.join(' ')); };
      try {
        hydrate(() => <pre innerHTML="<b>x</b>" />, root);
      } finally {
        console.warn = orig;
      }
      expect(warnings).toHaveLength(0);
    });
  });
});
```

**Acceptance criteria:**
- [ ] The three scenarios above pass against `@vertz/ui-server` and `@vertz/ui` at their current public entry points (no relative imports into `src/`).
- [ ] `flushEffects`, `mountHtml`, `hydrate`, `renderToString`, `renderInto` (or equivalents) are located via the same import paths used in other integration tests in `packages/ui-server/src/__tests__/`. If any helper is missing, file a small follow-up task — do not hand-roll.
- [ ] The test runs against both the jsx-runtime fallback (dev/test) and the compiled path. If the existing integration harness uses the compiler, this is automatic; if not, add a variant that explicitly uses `compile()` from `@vertz/ui-server`.
- [ ] If any scenario uncovers a bug in Phase 1/2 code, file it as a blocker finding for this phase, fix it, add a unit test in the owning package, then re-run the integration test.

---

## Phase 3 Done When

- Integration test passes locally.
- Full quality gates pass: `vtz test && vtz run typecheck && vtz run lint`.
- No regressions in existing SSR/hydration tests.
- Adversarial review at `reviews/2761-raw-html-injection/phase-03-ssr-hydration-tests.md` approves.
- One commit referencing `#2761`.
