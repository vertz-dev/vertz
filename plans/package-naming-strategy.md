# Package Naming Strategy Analysis

**Author:** Josh (Developer Advocate)  
**Date:** 2026-02-14  
**Status:** Analysis for CTO Review  
**Branch:** `docs/package-naming`

---

## Executive Summary

This analysis addresses the CTO's concerns about confusing package names in Vertz's public API, specifically around `@vertz/core` and the `createApp` method. The core problem: **naming that sounds foundational but actually only covers the REST/API layer creates friction and confusion**, especially in multi-service architectures.

**Bottom line:** Rename `@vertz/core` to `@vertz/server` (or `@vertz/api`) and rename `createApp()` to `createServer()`. This aligns with developer expectations and scales cleanly for microservices.

---

## 1. The Problem with Current Names

### 1.1 `@vertz/core` Suggests "Foundation of Everything"

The name "core" implies:
- This is the foundation the entire framework builds on
- Without it, nothing works
- It probably includes the UI layer, routing, and the app lifecycle

**Reality:**
- `@vertz/core` is **only** the HTTP/REST server layer
- It doesn't know about UI, components, or rendering
- It's conceptually a "mini-Express" with Vertz's module system

**The confusion:**
```ts
// What a developer thinks:
import { createApp } from 'vertz/core';
// → "This creates my entire Vertz application with UI and API"

// What actually happens:
import { createApp } from 'vertz/core';
// → "This creates an HTTP server that handles REST routes"
```

### 1.2 `createApp()` Implies Full Application

The method name `createApp` follows conventions from:
- React: `createApp()` creates a React application
- Vue: `createApp()` creates a Vue application
- Angular: `platformBrowserDynamic().bootstrapModule()`

In all these frameworks, "app" means the **whole application** — UI, routing, state, lifecycle.

In Vertz, `createApp` only creates the **REST server**. If a developer wants a UI, they need `@vertz/ui` separately.

### 1.3 The Multi-Service Confusion

When someone has both `@vertz/ui` and `@vertz/core` in the same project:

```ts
// A real multi-service project:
import { createApp } from 'vertz/core';     // Creates REST API server
import { createApp } from 'vertz/ui';       // Wait, creates UI?

// What if they have two REST services?
import { createApp as createUsersAPI } from 'vertz/core';
import { createApp as createOrdersAPI } from 'vertz/core';
// → Variable renaming required to avoid collision!
```

The imports don't communicate:
- Which one is the API server?
- Which one is the UI renderer?
- How do they connect to each other?

### 1.4 Breaking Changes Are Expensive

If we ship the meta-package (`vertz`) with confusing names and then rename later:

```ts
// v1.0 (confusing)
import { createApp } from 'vertz';

// v1.1 (renamed) — BREAKING CHANGE
import { createServer } from 'vertz';
```

Every tutorial, Stack Overflow answer, and blog post breaks. The migration cost is real.

**Better to get it right before the meta-package ships.**

---

## 2. Naming Alternatives for the API/HTTP Package

### Options with Pros and Cons

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **`vertz/core`** | Current name, short | Confusing — implies foundation of everything | ❌ Rejected |
| **`vertz/server`** | Clear: this creates a server | "Server" could mean any server type | ✅ Recommended |
| **`vertz/api`** | Clear: REST API focus | Too narrow? What about WebSocket? | ✅ Strong candidate |
| **`vertz/http`** | Precise: HTTP layer | Too technical/low-level for some users | ⚠️ Acceptable |
| **`vertz/rest`** | Specific to REST | Too narrow — what about future protocols? | ❌ Rejected |
| **`vertz/service`** | Architectural term | Very generic — could mean anything | ⚠️ Acceptable |

### Analysis

**`vertz/server` — Top Recommendation**
- Clear mental model: "I'm creating a server that listens on HTTP"
- Scales: you can have multiple servers (microservices)
- Familiar: similar to `express()`, `fastify()`, `hono()`
- Not confused with "the core of the framework"

**`vertz/api` — Strong Alternative**
- Emphasizes the API surface
- Clear for REST-focused apps
- Slightly more specific than "server"

### Recommendation

**Rename `@vertz/core` → `@vertz/server`**

Rationale:
- Communicates exactly what it does (creates an HTTP server)
- Scales for microservices (multiple servers = multiple services)
- Doesn't imply it's the "foundation" of everything
- Short, memorable, clear

---

## 3. Method Naming: `createApp` → `createServer`

### Current Problem

```ts
// What does this do?
const app = createApp();
// → Creates an HTTP server? A UI app? The whole thing?
```

### Options

| Option | Clarity | DX | Verdict |
|--------|---------|-----|---------|
| **`createApp()`** | ❌ Confusing | ❌ Implies full app | ❌ Keep (but fix) |
| **`createServer()`** | ✅ Clear | ✅ Explicit | ✅ Recommended |
| **`createAPI()`** | ✅ Clear | ✅ REST-focused | ✅ Alternative |
| **`createService()`** | ⚠️ Ambiguous | ⚠️ Too generic | ❌ Rejected |

### Analysis

**`createServer()` — Top Recommendation**
```ts
import { createServer } from 'vertz/server';

const server = createServer({
  routes: [...],
  middleware: [...],
});

server.listen(3000);
```

Mental model: "I'm creating an HTTP server." Clear, explicit, unmistakable.

**`createAPI()` — Strong Alternative**
```ts
import { createAPI } from 'vertz/api';

const api = createAPI({
  routes: [...],
});
```

Emphasizes REST API creation. Good if we're positioning as an API framework.

### Recommendation

**Rename `createApp()` → `createServer()`**

Rationale:
- Explicit: creates an HTTP server, nothing more
- Scales: multiple servers = multiple microservices
- Familiar: aligns with `express()`, `fastify()`
- No confusion with "creating a UI app"

---

## 4. Multi-Service Developer Experience

### The Scenario

A developer has:
- **3 microservices:** users, orders, payments
- **2 UIs:** admin dashboard, customer portal
- **Shared schemas** across all services

### How Imports Should Look

**Option A: With `vertz/server` (Recommended)**

```ts
// users-service/src/index.ts
import { createServer } from 'vertz/server';
import { route } from 'vertz/server';
import { createModule } from 'vertz/server';
import { createEnv } from 'vertz/server';

// Service 1: Users API
export const usersServer = createServer({
  routes: [route('/users', () => ...)],
  modules: [userModule],
});

// orders-service/src/index.ts  
import { createServer } from 'vertz/server';

// Service 2: Orders API
export const ordersServer = createServer({
  routes: [route('/orders', () => ...)],
});

// payments-service/src/index.ts
import { createServer } from 'vertz/server';

// Service 3: Payments API
export const paymentsServer = createServer({
  routes: [route('/payments', () => ...)],
});

// admin-dashboard/src/index.ts
import { createApp } from 'vertz/ui';

// UI 1: Admin Dashboard
export const adminApp = createApp({
  pages: [...],
});

// customer-portal/src/index.ts
import { createApp } from 'vertz/ui';

// UI 2: Customer Portal
export const portalApp = createApp({
  pages: [...],
});
```

**What the developer sees:**
- `vertz/server` → REST API
- `vertz/ui` → Web UI
- Can't confuse them because the names are different

**Option B: If we kept `vertz/core` (Not Recommended)**

```ts
// Problem: Same import for different things!
import { createApp } from 'vertz/core';      // Creates REST API server
import { createApp } from 'vertz/ui';        // Creates UI app

// Problem: Need to rename to use both!
import { createApp as createAPIServer } from 'vertz/core';
import { createApp as createUIApp } from 'vertz/ui';
```

### Project Structure

```
my-monorepo/
├── packages/
│   ├── users-service/        # vertz/server
│   │   ├── src/
│   │   │   ├── index.ts      # createServer()
│   │   │   └── routes/
│   │   └── package.json     # "dependencies": { "vertz": "..." }
│   │
│   ├── orders-service/       # vertz/server
│   │   ├── src/
│   │   │   └── index.ts      # createServer()
│   │   └── package.json
│   │
│   ├── payments-service/    # vertz/server
│   │   ├── src/
│   │   │   └── index.ts      # createServer()
│   │   └── package.json
│   │
│   ├── admin-dashboard/      # vertz/ui
│   │   ├── src/
│   │   │   └── index.ts      # createApp()
│   │   └── package.json
│   │
│   ├── customer-portal/      # vertz/ui
│   │   ├── src/
│   │   │   └── index.ts      # createApp()
│   │   └── package.json
│   │
│   └── shared-schemas/      # vertz/schema
│       ├── src/
│       │   └── schemas.ts
│       └── package.json
```

### Shared Schemas

```ts
// shared-schemas/src/schemas.ts
import { createSchema } from 'vertz/schema';

export const UserSchema = createSchema({
  id: 'string',
  email: 'string',
  name: 'string',
});

export const OrderSchema = createSchema({
  id: 'string',
  userId: 'string',
  total: 'number',
});
```

Each service imports what it needs:

```ts
// users-service/src/routes/get-user.ts
import { UserSchema } from '@my-org/shared-schemas';
import { route } from 'vertz/server';

export const getUser = route('/users/:id', async ({ params }) => {
  const user = await db.users.find(params.id);
  return UserSchema.parse(user); // Validate before returning
});
```

---

## 5. Comparison: How Other Frameworks Handle This

| Framework | Package | Entry Point | What It Creates |
|-----------|---------|-------------|-----------------|
| **Express** | `express` | `express()` | HTTP server/app |
| **Fastify** | `fastify` | `fastify()` | HTTP server |
| **Hono** | `hono` | `new Hono()` | Router (can be adapter to server) |
| **Next.js** | `next` | Convention | Full framework (no explicit createApp) |
| **Remix** | `@remix-run/react` | `<Remix/>` | SSR app wrapper |
| **Nuxt** | `nuxt` | Convention | Full framework |
| **SvelteKit** | `@sveltejs/kit` | Convention | Full framework |

### Key Observations

1. **Server-focused frameworks** (Express, Fastify, Hono): Use explicit factory functions (`createServer`, `fastify()`, `new Hono()`). Clear what you're making.

2. **Full-stack frameworks** (Next.js, Nuxt, SvelteKit): Convention-based, no explicit createApp. The "app" emerges from file structure.

3. **Vertz is in a unique position:** It has BOTH server (`vertz/server`) and UI (`vertz/ui`) components. The names MUST distinguish between them.

### What Works for Vertz

**Best model: Express/Fastify style**

```ts
// Clear: creates an HTTP server
import { createServer } from 'vertz/server';

// Clear: creates a UI app  
import { createApp } from 'vertz/ui';
```

This way:
- `createServer()` = HTTP server (like `express()`)
- `createApp()` = UI app (like React's `createApp()`)

The names are different because the concepts are different.

---

## 6. Recommendation

### Primary Recommendation

| Current | Recommended | Rationale |
|---------|-------------|-----------|
| `@vertz/core` | `@vertz/server` | Clear that this is an HTTP server, not "the core of everything" |
| `createApp()` | `createServer()` | Explicit: creates server, not "the whole app" |

### Migration Path

1. **Add `@vertz/server` as alias** (v0.2.0)
   ```ts
   // packages/server/src/index.ts
   // Re-export everything from core
   export * from '@vertz/core';
   export { createApp as createServer } from '@vertz/core';
   ```

2. **Add deprecation warnings** (v0.2.0)
   ```ts
   // packages/core/src/index.ts
   import { createApp } from './app';
   
   export function createApp(...args: Parameters<typeof createApp>) {
     console.warn('⚠️ @vertz/core is deprecated. Use @vertz/server instead.');
     console.warn('⚠️ createApp() is deprecated. Use createServer() instead.');
     return createApp(...args);
   }
   ```

3. **Update meta-package** (v0.2.0)
   ```ts
   // vertz/src/server.ts
   export * from '@vertz/server';
   ```

4. **Remove old names** (v0.3.0)
   - Remove `@vertz/core` exports
   - Remove `createApp` (only `createServer` remains)

### Code Changes Required

```ts
// BEFORE (confusing)
import { createApp } from 'vertz/core';
const app = createApp();

// AFTER (clear)
import { createServer } from 'vertz/server';
const server = createServer();
```

### Meta-Package Impact

The `vertz` meta-package should export both:

```ts
// vertz/src/index.ts
// Server/API
export { createServer } from '@vertz/server';

// UI (separate!)
export { createApp } from '@vertz/ui';

// Also export schema, db, fetch, etc.
export * from '@vertz/schema';
export * from '@vertz/db';
export * from '@vertz/fetch';
```

This way:
- `import { createServer } from 'vertz'` → creates HTTP server
- `import { createApp } from 'vertz/ui'` → creates UI app
- **Never ambiguous.**

---

## Summary

| Issue | Current | Recommended |
|-------|---------|-------------|
| Package name | `@vertz/core` | `@vertz/server` |
| Method name | `createApp()` | `createServer()` |
| Multi-service DX | Confusing (same names) | Clear (different names) |
| Developer expectation | "Core = foundation" | "Server = HTTP server" |

**This is the minimal change that solves the CTO's concerns while maintaining backward compatibility during migration.**

---

## Next Steps

1. **CTO approval** of this analysis
2. **Create implementation ticket** for renaming
3. **Update meta-package exports** to include both paths
4. **Add deprecation warnings** in v0.2.0
5. **Remove old names** in v0.3.0

---

**Analysis complete.** Ready for review.
