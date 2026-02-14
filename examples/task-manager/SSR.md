# Server-Side Rendering (SSR) in Task Manager

This document explains how SSR is implemented in the task-manager demo using vertz's own stack.

## Architecture

The task-manager demo now supports both:
1. **Client-side SPA** (original behavior) - Run with `bun run dev`
2. **Server-side rendering** - Run with `bun run dev:ssr`

## Key Files

### Entry Points

- **`src/entry-server.ts`** - Server-side rendering entry point
  - Uses `@vertz/ui-server` to render VNode trees to HTML
  - Implements `render()` which returns a ReadableStream of HTML
  - Implements `renderToString()` which returns complete HTML documents

- **`src/entry-client.ts`** - Client-side hydration entry point
  - Loads the app on the client and replaces server-rendered content
  - In the future, this will properly hydrate the DOM instead of replacing it

- **`src/server.ts`** - HTTP server using `@vertz/core`
  - Creates an app using `createApp()` from `@vertz/core`
  - Handles all routes and serves SSR'd HTML
  - No external server dependencies (Express, Hono, etc.)

### JSX Runtimes

- **`src/jsx-runtime.ts`** - Client-side JSX runtime (original)
  - Creates DOM elements directly
  - Used for tests and client-side rendering

- **`src/jsx-runtime-server.ts`** - Server-side JSX runtime (new)
  - Creates VNode trees compatible with `@vertz/ui-server`
  - Filters out event handlers and non-serializable props
  - Used only during SSR

## How It Works

### Request Flow

1. Client requests a URL (e.g., `/` or `/settings`)
2. Server receives the request in `src/server.ts`
3. Server calls `renderToString(url.pathname)` from `entry-server.ts`
4. Entry server:
   - Matches the URL to a route
   - Renders the appropriate page component as VNodes
   - Uses `renderToStream()` from `@vertz/ui-server` to convert VNodes to HTML
   - Wraps the HTML in a complete document shell
5. Server returns the HTML with a `<script>` tag loading the client entry
6. Browser receives and displays the HTML immediately (SSR benefit!)
7. Browser loads `entry-client.ts` which hydrates the app with interactivity

### Current Limitations

This is a **minimal SSR implementation** to demonstrate the architecture:

1. **Simple routing** - Currently hardcoded page rendering based on URL path
   - TODO: Integrate with the full app router from `src/router.ts`
   
2. **No true hydration** - Client currently replaces server HTML instead of hydrating
   - TODO: Implement proper hydration using `@vertz/ui` hydration APIs

3. **No loader execution** - Route loaders don't run during SSR yet
   - TODO: Execute loaders on the server and serialize data for client

4. **No CSS extraction** - Styles aren't inlined or extracted for SSR
   - TODO: Use critical CSS extraction from `@vertz/ui-server`

5. **No Vite dev mode** - SSR server runs separately from Vite
   - TODO: Create Vite SSR middleware for unified dev experience

## Running SSR

### Development

```bash
# Start the SSR server
bun run dev:ssr

# Server runs at http://localhost:3000
# View source to see pre-rendered HTML
```

### Testing

```bash
# Run SSR integration tests
bun test src/tests/ssr.test.ts

# These tests verify:
# - Server returns HTML (not empty div)
# - HTML contains rendered content
# - Different routes render different pages
```

### Building

```bash
# Build client bundle
bun run build

# Build server bundle
bun run build:ssr

# TODO: Create production server that serves both
```

## Next Steps

To make this production-ready:

1. **Integrate router** - Use the full app router instead of hardcoded routing
2. **True hydration** - Attach event handlers to existing DOM instead of replacing
3. **Loader execution** - Run loaders on server, serialize data, deserialize on client
4. **CSS extraction** - Inline critical CSS, defer non-critical
5. **Vite integration** - Create SSR middleware for unified dev server
6. **Production build** - Bundle server code, optimize for deployment
7. **Streaming** - Take advantage of ReadableStream for progressive rendering
8. **Error boundaries** - Handle SSR errors gracefully

## Architecture Benefits

This implementation uses **only vertz's own stack**:

- ✅ `@vertz/core` for the HTTP server (no Express/Hono)
- ✅ `@vertz/ui-server` for SSR rendering
- ✅ `@vertz/ui` for client-side hydration (future)
- ✅ `@vertz/ui-compiler` for JSX transformation (future)

This proves that vertz is a complete, batteries-included framework.
