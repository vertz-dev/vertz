# Retrospective: How We Shipped SSR Without Usable SSR

**Date:** 2026-02-14  
**Trigger:** CTO ran `vite dev`, viewed page source, saw no server-rendered HTML. Expected SSR to "just work" after PR #262 merged.

---

## What Happened

We built a complete SSR rendering pipeline (`@vertz/ui-server`) with streaming, Suspense boundaries, hydration markers, head management, critical CSS, and asset injection. 66 tests passing. Well-documented. Technically impressive.

**Nobody could use it without writing 400 lines of boilerplate.**

The task-manager example proved it *worked* — but only because a developer (agent) manually wired up:
- A DOM shim (250 lines)
- A server JSX runtime (100 lines)  
- A custom entry-server with manual router integration (100 lines)
- A custom dev server bypassing `vite dev`
- Conditional package.json exports

The actual framework — the thing a user `npm install`s — contributed zero DX for SSR. The primitives existed. The integration didn't.

---

## Root Cause Analysis

### 1. We built primitives, not features

The implementation plan (Phase 5) defined SSR as:
> "renderToStream(), component-to-HTML serialization, Suspense boundaries, hydration markers..."

These are **primitives**. The actual *feature* — "a developer adds `ssr: true` and their app server-renders" — was split off into Phase 8 (`[P8-2a]` "Vite plugin full dev server integration"). Phase 8 was never started.

**The ticket was marked ✅ Complete when the primitives shipped.** Nobody asked "can a developer actually use this?"

### 2. The acceptance criteria tested internals, not user outcomes

Look at the acceptance criteria for ui-010-ssr:

```
✅ renderToStream() returns a ReadableStream of valid HTML
✅ Suspense boundaries emit placeholder first, then replacement chunk
✅ Interactive components get data-v-id markers
✅ Static components produce NO hydration markers
✅ Head component injects meta/title into the stream
```

Every single criterion is about the **rendering engine internals**. Not one says:

```
❌ Developer adds ssr: true to vite.config.ts and vite dev serves SSR HTML
❌ View source in the browser shows rendered page content
❌ No additional files required beyond vite.config.ts change
```

We tested that the engine works. We never tested that a human can use the engine.

### 3. The example proved the wrong thing

PR #262 ("REAL SSR with Vite") was a heroic effort — DOM shim, server JSX runtime, entry-server, all manually wired. It proved SSR *works*. But it also **normalized the boilerplate**. Instead of raising a flag ("wait, why does the user need 5 extra files?"), it became "SSR is done, let's move on."

The example should have been the RED flag, not the GREEN flag. When your demo needs 400 lines of glue code to use a framework feature, the feature isn't done.

### 4. No "developer hat" testing

Nobody ran through the flow as a new developer would:
1. `npm create vertz-app`
2. Add SSR somehow
3. `vite dev`
4. View source
5. See rendered HTML

If anyone had done this, they would have immediately hit the wall: `vite dev` doesn't do SSR. There's no documented way to enable it. The only working path requires copying boilerplate from an example.

### 5. Phased implementation lost the thread

The implementation plan split work across 8 phases. Phase 5 (SSR primitives) and Phase 8 (DX integration) were separated by months of other work. By the time Phase 5 shipped, the urgency was on the next phase — not on going back to wire everything together.

This is a classic problem: **horizontal slicing** (build all primitives, then all integrations) instead of **vertical slicing** (build one complete feature end-to-end, then the next).

---

## What We Should Have Done

### A. Define features as user outcomes, not API surfaces

Instead of:
> "Implement renderToStream() with out-of-order Suspense boundaries"

The ticket should have been:
> "A developer adds `ssr: true` to their Vite config. `vite dev` serves server-rendered HTML. View source shows the full page."

The rendering engine is an *implementation detail* of this feature, not the feature itself.

### B. Acceptance criteria = developer walkthrough

Every feature ticket should include a **"new developer test"**:

```markdown
## Developer Walkthrough (must pass before marking complete)

1. Create a new vertz app with `npm create vertz-app`
2. Follow the docs to enable [feature]
3. Run `vite dev`
4. Verify [expected outcome] in the browser
5. No undocumented steps, no copying from examples, no "just read the source"
```

If this walkthrough fails, the feature is not done — regardless of how many unit tests pass.

### C. Vertical slices, not horizontal layers

Don't build all primitives in Phase 5 and all integrations in Phase 8. Instead:

```
Feature: SSR
  Slice 1: vite dev serves SSR HTML for a simple component (end-to-end)
  Slice 2: Streaming SSR with Suspense
  Slice 3: Head management
  Slice 4: Hydration
  Slice 5: Production build
```

Each slice is usable on its own. No slice ships without the Vite integration.

### D. The "use it" gate

Before marking any feature complete, someone must **use it from scratch** — not tweak the existing example, not run the existing tests, but start from `npm init` and get to a working app. This is the only test that catches DX gaps.

### E. Examples are smoke tests, not proofs of concept

An example that requires custom boilerplate is a **failing smoke test**. The example should use the public API exactly as documented. If the example needs escape hatches, the API isn't ready.

---

## Action Items

### Immediate
- [x] Created plan for zero-config SSR (`plans/ssr-zero-config.md`)
- [x] Created issue #265, assigned to Ben
- [ ] Ben implements Milestone 1 (target: 3-4 days)

### Process Changes

1. **Add "Developer Walkthrough" section to ticket template**  
   Every feature ticket gets a concrete walkthrough that must pass before the ticket closes. No exceptions.

2. **Acceptance criteria must include at least one "user outcome" test**  
   Not just "renderToStream returns valid HTML" but "developer runs vite dev and sees SSR HTML."

3. **Vertical slice by default**  
   When planning features, the first slice must be end-to-end (even if minimal). Internal primitives ship only as part of a usable slice.

4. **"Fresh start" gate for milestone completion**  
   Before any milestone is marked done, someone must go through the setup flow from scratch. Not "it works in our monorepo" — "it works in a new project."

5. **Examples must use only the public API**  
   If an example imports from `../dom-shim` or writes a custom server, that's a bug in the framework, not a feature of the example. Flag it.

6. **Review agent-written code for "did they solve the problem or build the machinery?"**  
   Agents (and humans) tend to build impressive internals and skip the last mile of integration. Reviewers should explicitly ask: "Can a developer use this without reading the source code?"

---

## The Deeper Lesson

We confused **"it works"** with **"someone can use it."**

A rendering engine that produces perfect HTML but requires 400 lines of manual wiring is not SSR support. It's an SSR *toolkit*. Toolkits are for framework authors. We're building a framework — the integration IS the product.

Every feature we ship should pass the "first 5 minutes" test: can a developer go from zero to working in 5 minutes with just the docs? If not, the feature isn't done. The primitives are done. The feature isn't.

This isn't just about SSR. We need to audit every "complete" feature through this lens before launch:
- Can someone set up the router without copying from the example?
- Can someone use forms without reading the compiler source?
- Can someone deploy to production without a custom server file?

If any answer is "no," we have more work to do.
