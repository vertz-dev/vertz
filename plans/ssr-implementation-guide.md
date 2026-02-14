# Vite SSR Implementation Guide for Task Manager

**Author:** nora  
**Date:** 2026-02-14  
**Context:** Ben's PR #261 hardcoded VNode trees. We need REAL SSR — actual JSX components rendered server-side.

---

## Problem Analysis

### What Went Wrong in PR #261

The `entry-server.ts` in commit `1890239` manually constructed VNode trees:

```typescript
const appContent: VNode = {
  tag: 'div',
  attrs: { 'data-testid': 'app-root' },
  children: [/* hardcoded VNode tree */]
};
```

**The issue:** The actual `App()` component and page components return `HTMLElement` objects (DOM nodes), not VNodes. The components use the DOM-based `jsx-runtime.ts` which calls `document.createElement()`.

### The Solution

We need to:

1. **Create a server-side JSX runtime** that generates VNodes instead of DOM nodes
2. **Use Vite's SSR API** to transform and load modules with the server runtime
3. **Actually call the real components** in `entry-server.ts`
4. **Handle the dual runtime problem** — components must work with both runtimes

---

## Architecture Overview

### The Dual Runtime Challenge

Vertz components are currently written to return DOM nodes:

```typescript
export function TaskListPage(props): HTMLElement {
  return <div>...</div> as HTMLElement;
}
```

For SSR, we need these same components to produce VNodes when running server-side.

### Solution: Runtime Switching

The trick is that **JSX is just function calls**. TypeScript compiles:

```jsx
<div class="foo">Hello</div>
```

Into:

```javascript
jsx('div', { class: 'foo', children: 'Hello' })
```

By swapping out which `jsx()` function is imported, we control the output type.

---

## Implementation Plan

### File Structure

```
examples/task-manager/
├── src/
│   ├── jsx-runtime.ts              # Client runtime (DOM nodes) [exists]
│   ├── jsx-runtime-server.ts       # Server runtime (VNodes) [create]
│   ├── entry-server.ts             # SSR entry point [rewrite]
│   ├── entry-client.ts             # Client hydration [create]
│   ├── server.ts                   # Dev server [create]
│   └── app.tsx                     # App component [exists]
├── vite.config.ts                  # [modify]
└── package.json                    # [modify]
```

---

## Step 1: Create Server JSX Runtime

**File:** `src/jsx-runtime-server.ts`

This runtime generates VNodes compatible with `@vertz/ui-server`:

```typescript
/**
 * Server-side JSX runtime for SSR.
 * 
 * Produces VNode trees compatible with @vertz/ui-server's renderToStream.
 * Used only during SSR; the client uses the DOM-based jsx-runtime.ts.
 */

import type { VNode, RawHtml } from '@vertz/ui-server';

type Tag = string | ((props: any) => any);

function normalizeChildren(children: any): (VNode | string | RawHtml)[] {
  if (children == null || children === false || children === true) return [];
  if (Array.isArray(children)) {
    return children.flatMap(normalizeChildren);
  }
  // VNode or RawHtml object
  if (typeof children === 'object' && ('tag' in children || '__raw' in children)) {
    return [children];
  }
  return [String(children)];
}

export function jsx(tag: Tag, props: Record<string, any>): VNode {
  // Component function — call it with props
  if (typeof tag === 'function') {
    return tag(props);
  }

  const { children, ...attrs } = props || {};

  // Filter out client-only props for SSR
  const serializableAttrs: Record<string, string> = {};
  for (const [key, value] of Object.entries(attrs)) {
    // Skip event handlers (onXxx functions)
    if (key.startsWith('on') && typeof value === 'function') {
      continue;
    }
    // Keep class, style, data-*, aria-*, etc.
    if (key === 'class' && value != null) {
      serializableAttrs.class = String(value);
    } else if (key === 'style' && value != null) {
      serializableAttrs.style = String(value);
    } else if (value === true) {
      serializableAttrs[key] = ''; // Boolean attribute
    } else if (value !== false && value != null) {
      serializableAttrs[key] = String(value);
    }
  }

  return {
    tag,
    attrs: serializableAttrs,
    children: normalizeChildren(children),
  };
}

export const jsxs = jsx;
export const jsxDEV = jsx;

export function Fragment(props: { children?: any }): VNode {
  // Fragment is a virtual container that gets unwrapped during serialization
  return {
    tag: 'fragment',
    attrs: {},
    children: normalizeChildren(props?.children),
  };
}
```

**Key points:**

- Strips event handlers (`onClick`, etc.) — they don't work in SSR
- Converts all props to strings for HTML serialization
- Returns VNode objects, not DOM elements
- Function components (like `<App />`) get called and must return VNodes

---

## Step 2: Rewrite Entry Server

**File:** `src/entry-server.ts`

This is where we actually render the REAL components:

```typescript
/**
 * Server entry point for SSR.
 * 
 * Renders the task-manager app to HTML using @vertz/ui-server.
 * This runs in Node.js/Bun during SSR with the server JSX runtime.
 */

import { renderToStream, streamToString } from '@vertz/ui-server';
import type { VNode } from '@vertz/ui-server';

// Import the REAL app component
// Vite's ssrLoadModule will transform this with jsx-runtime-server
import { App } from './app';

/**
 * Render the app to an HTML stream for the given URL.
 * 
 * @param url - The requested URL path
 * @returns ReadableStream of HTML chunks
 */
export async function render(url: string): Promise<ReadableStream<Uint8Array>> {
  // CRITICAL: We need to initialize the router with the server URL
  // This is a challenge — the App() currently expects window.location.pathname
  // 
  // Workaround: Pass url as a prop or use a global/context
  // For now, we'll need to refactor App to accept an initialUrl prop
  
  // Call the REAL App component
  // Because we're in SSR context, jsx-runtime-server is active,
  // so App() returns a VNode, not an HTMLElement
  const appVNode = App() as unknown as VNode;
  
  return renderToStream(appVNode);
}

/**
 * Render the full HTML document with the app content.
 * 
 * @param url - The requested URL path
 * @returns Promise<string> - Complete HTML document
 */
export async function renderToString(url: string): Promise<string> {
  const appStream = await render(url);
  const appHtml = await streamToString(appStream);

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Task Manager — @vertz/ui demo</title>
  </head>
  <body>
    <div id="app">${appHtml}</div>
    <script type="module" src="/src/entry-client.ts"></script>
  </body>
</html>`;
}
```

**Key challenges to address:**

### Challenge 1: The Router Depends on `window`

The current `router.ts` does:

```typescript
export const appRouter = createRouter(routes, window.location.pathname);
```

This breaks in SSR (no `window`).

**Solution:** Make the router initializable with a URL:

```typescript
// In entry-server.ts, we need to pass the URL somehow
// Option A: Refactor App to accept initialUrl prop
export function App(props?: { initialUrl?: string }): HTMLElement | VNode {
  const url = props?.initialUrl ?? (typeof window !== 'undefined' ? window.location.pathname : '/');
  // Initialize router with url...
}

// Option B: Use a context/global before calling App()
globalThis.__SSR_URL__ = url;
```

### Challenge 2: `effect()` Runs Synchronously

The App component uses `effect()` to render routes. On the server, effects run once synchronously. This should work, but the route matching needs to use the passed-in URL, not `window.location`.

### Challenge 3: Client-Side Features

Some features won't work server-side:

- `query()` — async data fetching
- Event handlers
- `onMount()` / `onCleanup()`
- `document.startViewTransition()`

These need to be **skipped or stubbed** in SSR mode.

**Solution:** Add environment detection:

```typescript
const isServer = typeof window === 'undefined';

if (!isServer && 'startViewTransition' in document) {
  // Use View Transitions API
}
```

---

## Step 3: Create Entry Client for Hydration

**File:** `src/entry-client.ts`

The client needs to **hydrate** the server HTML, not re-mount from scratch:

```typescript
/**
 * Client entry point for SSR hydration.
 * 
 * Attaches event listeners and reactive effects to server-rendered HTML.
 */

import { App } from './app';

console.log('Client hydration starting...');

const appRoot = document.getElementById('app');
if (!appRoot) {
  throw new Error('App root element not found');
}

// For now, we'll do a full re-mount (not true hydration)
// True hydration requires matching the server's VNode tree and attaching
// to existing DOM nodes instead of creating new ones

const app = App();

// Clear server HTML and mount client version
appRoot.innerHTML = '';
appRoot.appendChild(app);

console.log('Client hydration complete');
```

**Note:** This is "rehydration by replacement," not true hydration. True hydration would:

1. Walk the existing DOM tree
2. Match it against the component tree
3. Attach event listeners and effects to existing nodes
4. Not recreate any DOM

True hydration is complex and can be a Phase 2 enhancement.

---

## Step 4: Create Vite SSR Dev Server

**File:** `src/server.ts`

This is the dev server that uses Vite's SSR middleware:

```typescript
/**
 * Development server with Vite SSR middleware.
 * 
 * Uses Vite's ssrLoadModule to transform and execute entry-server.ts
 * with the server-side JSX runtime.
 */

import { createServer } from 'vite';

const port = 5173;

async function startServer() {
  // Create Vite dev server in middleware mode
  const vite = await createServer({
    server: {
      middlewareMode: true,
    },
    appType: 'custom',
  });

  // Simple HTTP server
  const { createServer: createHttpServer } = await import('http');
  const server = createHttpServer(async (req, res) => {
    const url = req.url || '/';
    
    try {
      // Serve index.html for all routes (SPA)
      // For SSR, we render on the server instead
      
      // Load the entry-server module with SSR transform
      // This is the magic: ssrLoadModule transforms imports to use
      // the server JSX runtime
      const { renderToString } = await vite.ssrLoadModule('/src/entry-server.ts');
      
      const html = await renderToString(url);
      
      // Transform the HTML template (injects HMR client, etc.)
      const transformedHtml = await vite.transformIndexHtml(url, html);
      
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(transformedHtml);
    } catch (err) {
      console.error('SSR error:', err);
      vite.ssrFixStacktrace(err as Error);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end((err as Error).stack);
    }
  });

  // Let Vite handle HMR and static assets
  server.on('request', (req, res) => {
    // Vite middleware handles its own requests
    // (/__vite_hmr, /@vite, etc.)
  });

  server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}

startServer().catch(console.error);
```

**How `ssrLoadModule` works:**

1. Vite reads `/src/entry-server.ts`
2. It sees imports like `import { App } from './app'`
3. It recursively loads `app.tsx` and transforms the JSX
4. **The key:** Vite uses the `jsxImportSource` from `tsconfig.json` to determine which runtime to use
5. For SSR, we configure it to use `jsx-runtime-server` instead of `jsx-runtime`

---

## Step 5: Configure Vite for SSR

**File:** `vite.config.ts`

Add SSR-specific configuration:

```typescript
import vertzPlugin from '@vertz/ui-compiler';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [vertzPlugin()],
  
  ssr: {
    // Externalize dependencies that don't need to be bundled for SSR
    // Keep @vertz packages in the bundle since they have JSX
    noExternal: ['@vertz/ui', '@vertz/primitives'],
  },
  
  resolve: {
    conditions: ['node', 'import'],
  },
});
```

---

## Step 6: Configure TypeScript for Dual Runtimes

**File:** `tsconfig.json`

We need to configure JSX for both client and server:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": ".",
    "types": ["bun-types"],
    "module": "ESNext",
    "target": "ES2022",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "strict": true
  },
  "include": ["src/**/*"]
}
```

The `jsxImportSource` is the current directory (`.`), which makes TypeScript look for:

- `./jsx-runtime` (maps to `src/jsx-runtime.ts` via package.json exports)
- `./jsx-dev-runtime` (maps to `src/jsx-runtime.ts`)

**For SSR context**, Vite will override this to use `jsx-runtime-server` via its transform pipeline.

---

## Step 7: Package.json Scripts

**File:** `package.json`

Add SSR scripts:

```json
{
  "scripts": {
    "dev": "vite",
    "dev:ssr": "bun src/server.ts",
    "build": "vite build",
    "build:ssr": "vite build --ssr src/entry-server.ts",
    "preview": "vite preview"
  },
  "dependencies": {
    "@vertz/ui": "workspace:*",
    "@vertz/ui-server": "workspace:*",
    "@vertz/primitives": "workspace:*"
  }
}
```

---

## Critical Implementation Details

### 1. How Vite SSR Module Loading Works

When you call `vite.ssrLoadModule('/src/entry-server.ts')`:

```typescript
// Vite does this internally:
const transformed = await transformWithEsbuild(code, filepath, {
  jsx: 'automatic',
  jsxImportSource: '.' // or whatever is in tsconfig
});

// Then evaluates in a module context with require/import intercepted
const module = { exports: {} };
const require = (id) => {
  // Recursively load and transform dependencies
  if (id.endsWith('.tsx') || id.endsWith('.jsx')) {
    // Transform with the SSR jsx runtime
  }
};

eval(transformed.code);
return module.exports;
```

### 2. Making Components Return VNodes in SSR

The challenge is that components are typed to return `HTMLElement`:

```typescript
export function TaskListPage(props): HTMLElement {
  return <div>...</div> as HTMLElement;
}
```

In SSR, the JSX `<div>` produces a VNode, but we're casting it to `HTMLElement`.

**Solutions:**

**Option A:** Type as a union

```typescript
export function TaskListPage(props): HTMLElement | VNode {
  return <div>...</div>;
}
```

**Option B:** Use type assertion in entry-server

```typescript
const appVNode = App() as unknown as VNode;
```

**Option C:** Create a wrapper type

```typescript
type RenderResult = HTMLElement | VNode;
export function App(): RenderResult {
  // ...
}
```

### 3. The `effect()` Problem

Vertz components use `effect()` for reactivity:

```typescript
effect(() => {
  const match = appRouter.current.value;
  // Update DOM based on route
});
```

On the server:

- Effects run **synchronously once**
- There's no DOM, but we're building VNodes
- Signal reads work, but there's no re-rendering

**For SSR to work:**

1. Effects must not assume a DOM exists
2. Signal reads should produce the correct initial value
3. No async effects (or they need to be awaited)

**Potential issues:**

- `effect()` that do DOM mutations won't work (e.g., `element.className = ...`)
- These need to be wrapped in `if (typeof window !== 'undefined')`

### 4. Router URL Initialization

The biggest refactor needed:

**Current code in `router.ts`:**

```typescript
export const appRouter = createRouter(routes, window.location.pathname);
```

**Needed for SSR:**

```typescript
const initialUrl = typeof window !== 'undefined' 
  ? window.location.pathname 
  : globalThis.__SSR_URL__ || '/';

export const appRouter = createRouter(routes, initialUrl);
```

**In `entry-server.ts`:**

```typescript
export async function render(url: string) {
  globalThis.__SSR_URL__ = url;
  const appVNode = App() as unknown as VNode;
  delete globalThis.__SSR_URL__;
  return renderToStream(appVNode);
}
```

---

## Testing Strategy

### Unit Tests for Server Runtime

**File:** `src/__tests__/jsx-runtime-server.test.ts`

```typescript
import { describe, expect, test } from 'bun:test';
import { jsx, Fragment } from '../jsx-runtime-server';

describe('jsx-runtime-server', () => {
  test('creates VNode for element', () => {
    const vnode = jsx('div', { class: 'foo', children: 'Hello' });
    
    expect(vnode).toEqual({
      tag: 'div',
      attrs: { class: 'foo' },
      children: ['Hello'],
    });
  });

  test('strips event handlers', () => {
    const vnode = jsx('button', { onClick: () => {}, children: 'Click' });
    
    expect(vnode.attrs).toEqual({});
  });

  test('calls component functions', () => {
    const Component = (props: any) => jsx('span', { children: props.text });
    const vnode = jsx(Component, { text: 'Hi' });
    
    expect(vnode).toEqual({
      tag: 'span',
      attrs: {},
      children: ['Hi'],
    });
  });

  test('handles Fragment', () => {
    const vnode = Fragment({ children: ['a', 'b'] });
    
    expect(vnode).toEqual({
      tag: 'fragment',
      attrs: {},
      children: ['a', 'b'],
    });
  });
});
```

### Integration Tests for SSR

**File:** `src/__tests__/ssr.test.ts`

```typescript
import { describe, expect, test } from 'bun:test';
import { renderToString } from '../entry-server';

describe('SSR integration', () => {
  test('renders app to HTML', async () => {
    const html = await renderToString('/');
    
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<div data-testid="app-root"');
    expect(html).toContain('Task Manager');
  });

  test('renders task list page', async () => {
    const html = await renderToString('/');
    
    expect(html).toContain('All Tasks');
  });

  test('renders settings page', async () => {
    const html = await renderToString('/settings');
    
    expect(html).toContain('Settings');
  });
});
```

---

## Phase 2 Enhancements

Once basic SSR works, these are follow-up improvements:

### 1. True Hydration

Instead of replacing the server HTML, **hydrate** it:

- Match server VNode tree to existing DOM
- Attach event listeners to existing elements
- Connect signals to existing DOM nodes

### 2. Loader Execution on Server

Run route loaders server-side:

```typescript
export async function render(url: string) {
  const match = matchRoute(routes, url);
  if (match) {
    // Execute loaders
    const loaderData = await executeLoaders(match.matched, match.params);
    
    // Pass data to components via context
    const appVNode = App({ loaderData });
    return renderToStream(appVNode);
  }
}
```

### 3. Critical CSS Extraction

Extract only the CSS needed for the initial render:

```typescript
import { inlineCriticalCss } from '@vertz/ui-server';

const html = await renderToString(url);
const withCss = inlineCriticalCss(html, cssRules);
```

### 4. Production SSR Build

Create a production server that serves pre-built SSR bundles:

```bash
bun run build:ssr      # Build server bundle
bun run build          # Build client bundle
bun run preview:ssr    # Serve with production builds
```

### 5. Streaming Suspense

Use `renderToStream` directly for streaming SSR with Suspense boundaries:

```typescript
export function render(url: string) {
  const appVNode = App();
  // Returns ReadableStream that can be piped to response
  return renderToStream(appVNode);
}
```

---

## Summary of Changes Needed

| File | Action | Description |
|------|--------|-------------|
| `src/jsx-runtime-server.ts` | **Create** | Server JSX runtime that produces VNodes |
| `src/entry-server.ts` | **Rewrite** | Import and call REAL components, not hardcoded VNodes |
| `src/entry-client.ts` | **Create** | Client hydration entry point |
| `src/server.ts` | **Create** | Vite SSR dev server using `ssrLoadModule` |
| `src/router.ts` | **Modify** | Make router work without `window` (use prop or global) |
| `src/app.tsx` | **Modify** | Accept `initialUrl` prop for SSR |
| `vite.config.ts` | **Modify** | Add `ssr` config section |
| `package.json` | **Modify** | Add SSR scripts |

---

## Key Takeaways

1. **Vite SSR works by module transformation:** `ssrLoadModule` loads modules with the server JSX runtime
2. **The JSX runtime controls the output type:** Client runtime → DOM, Server runtime → VNodes
3. **Components must be environment-aware:** Use `typeof window !== 'undefined'` checks
4. **Router initialization is the biggest challenge:** It currently depends on `window.location`
5. **Start simple:** Get basic SSR working first, then add hydration, loaders, etc.

---

**Next Steps for Ben:**

1. Create `jsx-runtime-server.ts` with VNode generation
2. Create `server.ts` with Vite SSR middleware
3. Refactor `router.ts` to accept initial URL
4. Rewrite `entry-server.ts` to call `App()` instead of hardcoding VNodes
5. Test with `bun src/server.ts` and verify HTML output
6. Create `entry-client.ts` for hydration
7. Add SSR integration tests

The foundation (`@vertz/ui-server`) already exists. This guide shows how to wire it up with Vite's SSR API and the real component tree.
