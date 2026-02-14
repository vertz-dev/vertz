# Package Consolidation Proposal
**Author:** josh (DX Engineer)  
**Date:** 2026-02-14  
**Status:** Proposal

## Current State

To build a vertz UI app with SSR, developers need:
1. `@vertz/ui` — reactivity, components, router, hydration
2. `@vertz/ui-server` — SSR rendering (renderToStream, serializeToHtml, critical CSS)
3. `@vertz/ui-compiler` — Vite plugin for JSX transformation
4. `@vertz/core` — server runtime, middleware, DI

**CTO's thesis:** This is too many packages. Consolidate to reduce friction.

---

## DX Analysis

### 1. The Ideal Import Experience

From a new user's perspective, the ideal experience is:

```bash
npm create vertz-app my-app
cd my-app
npm run dev
```

**That's it.** The scaffolding tool handles dependencies. But what about the _learning_ experience?

When a developer opens `package.json`, they should be able to understand their stack at a glance:

**Current (4 packages):**
```json
{
  "@vertz/ui": "^1.0.0",
  "@vertz/ui-server": "^1.0.0",
  "@vertz/ui-compiler": "^1.0.0",
  "@vertz/core": "^1.0.0"
}
```
👎 **Reaction:** "Wait, why do I need three UI packages?"

**Consolidated (2 packages):**
```json
{
  "vertz": "^1.0.0",
  "@vertz/core": "^1.0.0"
}
```
👍 **Reaction:** "Oh, vertz for UI, core for backend. Got it."

The mental model is clearer with fewer packages.

---

### 2. Package Structure Recommendation

**Option A: Merge into `@vertz/ui`**
- Keep `@vertz/ui` as the UI package
- Absorb `@vertz/ui-server` and `@vertz/ui-compiler`
- Pro: Maintains current naming
- Con: Doesn't feel as bold or opinionated

**Option B: Create `vertz` (Recommended)**
- New top-level package: `vertz`
- Contains everything UI-related (client, server, compiler)
- Clear distinction: `vertz` = UI framework, `@vertz/core` = backend runtime
- Pro: Strong branding, clearer purpose
- Pro: Enables `import { createApp } from 'vertz'` (clean!)
- Con: Migration path needed for existing users

**Recommendation: Option B** — It's more opinionated and creates a clearer mental model.

---

### 3. How Other Frameworks Handle This

**Next.js:**
```json
{ "next": "14.0.0", "react": "18.0.0" }
```
- One package for the framework
- SSR/SSG/ISR all included by default
- No separate `next-server` or `next-compiler`
- **Takeaway:** Consolidation works at scale

**Remix:**
```json
{ "@remix-run/node": "2.0.0", "@remix-run/react": "2.0.0" }
```
- Split by environment (node/cloudflare/deno) and client
- Makes sense because deployment targets differ significantly
- **Takeaway:** Split when there's a clear environmental boundary

**SolidStart:**
```json
{ "solid-start": "0.4.0", "solid-js": "1.8.0" }
```
- One meta-framework package
- Includes SSR, routing, and build tools
- **Takeaway:** Start simple, add complexity only when needed

**Astro:**
```json
{ "astro": "4.0.0" }
```
- Single package, opinionated SSR-first
- Integrations are separate (`@astrojs/react`, etc.)
- **Takeaway:** Core should be unified

**Verdict:** The industry trend is toward consolidation for core functionality. Split packages are for deployment targets or optional integrations, not core features.

---

### 4. The Compiler Question

Should `@vertz/ui-compiler` (the Vite plugin) be auto-configured?

**Current Flow:**
```js
// vite.config.js
import vertz from '@vertz/ui-compiler'

export default {
  plugins: [vertz()]
}
```

**With consolidation:**
```js
import { vertzPlugin } from 'vertz/vite'
// or just
import vertz from 'vertz/vite'

export default {
  plugins: [vertz()]
}
```

**Even better — auto-detection:**
If `vertz` is installed, the plugin could be auto-applied via Vite's plugin pipeline (similar to how Vue/Svelte plugins work).

```js
// vite.config.js — no vertz import needed!
export default {
  // vertz auto-detects and applies its plugin
}
```

**Recommendation:** 
1. Short-term: Bundle compiler in `vertz/vite` export
2. Long-term: Explore auto-detection (but manual config is fine)

The key is that developers don't need to understand the compiler is separate — it's just part of "using vertz."

---

### 5. Tradeoffs: Consolidation vs Granularity

| **Aspect** | **Granular (4 packages)** | **Consolidated (1-2 packages)** |
|-----------|--------------------------|----------------------------------|
| **Install friction** | High ("why so many?") | Low ("just install vertz") |
| **Mental model** | Confusing for new users | Clear and opinionated |
| **Bundle size (client-only)** | Smaller (only install `@vertz/ui`) | Same with tree-shaking |
| **Versioning** | Can ship SSR updates independently | Must coordinate releases (but you should anyway) |
| **npm audit surface** | More packages = more potential alerts | Fewer packages = simpler maintenance |
| **Ecosystem clarity** | Looks modular but feels scattered | Looks opinionated and cohesive |
| **Advanced use cases** | Easier to swap out SSR layer? | Can still expose subpath exports |

**Key insight:** Tree-shaking makes bundle size a non-issue. Modern bundlers (Vite, Rollup, esbuild) will eliminate unused code even if everything ships in one package.

**Subpath exports solve opt-in:**
```json
// package.json of "vertz"
{
  "exports": {
    ".": "./dist/index.js",
    "./server": "./dist/server.js",
    "./vite": "./dist/vite.js",
    "./client-only": "./dist/client.js"
  }
}
```

Developers who truly want client-only can `import { ... } from 'vertz/client-only'` — but that's an advanced use case.

**Verdict:** Consolidation wins. Granularity is premature optimization.

---

### 6. The `create-vertz-app` Factor

Here's the thing: **`create-vertz-app` already solves the install problem.** Most users will never manually install these packages.

So why consolidate?

1. **Post-scaffolding learning:** After `create-vertz-app`, developers read their `package.json` and imports to understand the stack. Fewer packages = faster understanding.

2. **Documentation simplicity:** Every tutorial, guide, and Stack Overflow answer is simpler:
   - ❌ "Install @vertz/ui, @vertz/ui-server, and @vertz/ui-compiler"
   - ✅ "Install vertz"

3. **Upgrade path:** One package to bump, not four (even if `create-vertz-app` keeps them in sync, manually upgrading is simpler).

4. **Perception:** SolidStart, Next, Remix, Astro all ship as single packages. It signals maturity and thoughtfulness.

5. **Migration friction:** Even with a scaffolding tool, existing projects need to upgrade. Consolidation reduces long-term churn.

**Verdict:** `create-vertz-app` mitigates but doesn't eliminate the problem. Consolidation still provides significant DX value.

---

## Recommendation

### Proposed Package Structure

**Two packages:**

1. **`vertz`** — The UI framework
   - Reactivity system
   - Components and primitives
   - Router
   - Client-side hydration
   - **SSR rendering** (renderToStream, serializeToHtml)
   - **Critical CSS extraction**
   - **Vite plugin** (JSX transformation)
   - Default: SSR-enabled
   - Opt-out via `import { ... } from 'vertz/client-only'` for advanced users

2. **`@vertz/core`** — The backend runtime
   - Server runtime
   - Middleware
   - DI container
   - HTTP utilities

### Implementation Path

**Phase 1: Consolidate (Breaking change, v2.0)**
- Merge `@vertz/ui`, `@vertz/ui-server`, `@vertz/ui-compiler` → `vertz`
- Publish `vertz@2.0.0` and `@vertz/core@2.0.0`
- Deprecate old packages with clear migration guide
- Update `create-vertz-app` to use new structure

**Phase 2: Provide compatibility shims (Optional)**
```json
// @vertz/ui@2.0.0 becomes a re-export shim
{
  "name": "@vertz/ui",
  "version": "2.0.0",
  "main": "index.js"
}
```
```js
// index.js
module.exports = require('vertz');
console.warn('[@vertz/ui] This package is deprecated. Use "vertz" instead.');
```

This gives existing users time to migrate without breaking their builds.

### Import Examples

**Before:**
```js
import { createSignal, Router } from '@vertz/ui'
import { renderToStream } from '@vertz/ui-server'
import vertzPlugin from '@vertz/ui-compiler'
```

**After:**
```js
import { createSignal, Router, renderToStream } from 'vertz'
import { vertzPlugin } from 'vertz/vite'
```

**Advanced (client-only):**
```js
import { createSignal, Router } from 'vertz/client-only'
```

---

## Addressing Concerns

**"What if someone only wants client-side reactivity?"**
- Tree-shaking handles this automatically
- Bundle size will be identical to installing only `@vertz/ui`
- For true opt-out, provide `vertz/client-only` subpath

**"Doesn't this make the package harder to maintain?"**
- Not really — you're already maintaining all the code
- Monorepo structure (lerna/turborepo) can still keep code separated internally
- Publish as one package, but develop as modules

**"What about bundle size for the npm package?"**
- Irrelevant — users install once, bundlers tree-shake at build time
- Disk space is cheap, developer confusion is expensive

**"Won't this confuse people who want API-only?"**
- No — they install `@vertz/core` only
- Clear messaging: "vertz for UI apps, @vertz/core for APIs"

---

## Why This Matters (The Big Picture)

Developer experience is about **reducing cognitive load**. Every package a developer has to install and understand is a micro-decision:

- "Do I need this?"
- "What does this do?"
- "Are these versions compatible?"
- "Which one do I import from?"

By consolidating, you make a statement: **"vertz is an opinionated, SSR-first UI framework."** Developers who want that (most of them) get it immediately. Developers who don't want SSR can opt out — but they're the minority.

Look at the winners in the framework space: Next.js, Astro, SolidStart, Remix. They're all opinionated about SSR. They don't make you opt-in via a separate package. They assume you want the modern approach and make it the default.

**Be like them. Consolidate. Be opinionated.**

---

## Final Recommendation

✅ **Consolidate to `vertz` (UI + SSR + compiler) and `@vertz/core` (backend)**

**Why:**
- Clearer mental model
- Better DX for new users
- Simpler documentation
- Industry best practice
- Signals maturity and confidence

**Tradeoff:**
- Breaking change (but worth it early in the framework's lifecycle)

**Action items:**
1. Plan v2.0 with consolidated packages
2. Write migration guide
3. Update `create-vertz-app`
4. Update all docs and examples
5. Publish deprecation notices for old packages

---

**TL;DR:** Four packages is three too many. Ship `vertz` and `@vertz/core`. Be opinionated. Win on DX.
