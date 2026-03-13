# OAuth Provider Metadata & Login Button Components

**Issue:** [#1206](https://github.com/vertz-dev/vertz/issues/1206)
**Status:** Reviewed

---

## Problem

Building a login page requires hardcoding OAuth redirect URLs and re-creating provider icons inline:

```tsx
// Hardcoded URL — the framework already knows this from provider config
window.location.href = '/api/auth/oauth/github';

// Inline SVG — every app re-creates this
<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
  <path d="M12 0C5.37 0 0 5.37..." />
</svg>
```

The server already has all provider metadata (id, name, auth URL). The client has `useAuth()` for session state. But there's no way to discover configured providers or render OAuth buttons without manual wiring.

---

## API Surface

### A. Server: `GET /api/auth/providers` endpoint

A new public (no auth required) endpoint that returns configured OAuth providers:

```ts
// GET /api/auth/providers
// Response:
[
  { id: 'github', name: 'GitHub', authUrl: '/api/auth/oauth/github' },
  { id: 'google', name: 'Google', authUrl: '/api/auth/oauth/google' },
]
```

The endpoint only exposes safe metadata: `id`, `name`, and the auth initiation URL. No client secrets, scopes, or internal configuration are leaked.

### B. Client: `useAuth().providers`

The `AuthProvider` fetches `/api/auth/providers` once on mount and exposes it as a signal:

```tsx
const auth = useAuth();

// auth.providers is a signal — auto-unwrapped in JSX by the compiler
<div>
  {auth.providers.map((p) => (
    <span>{p.name}</span>
  ))}
</div>

// Type
interface OAuthProviderInfo {
  id: string;
  name: string;
  authUrl: string;
}
```

The `providers` signal starts as `[]` (empty array). The fetch happens once on `AuthProvider` mount — it's not tied to auth status (providers are public info needed on the login page, before the user is authenticated).

**Fetch error handling:** If the fetch fails (network error, server error), `providers` silently stays `[]`. No error signal — provider discovery failure is non-fatal. The login page simply won't show OAuth buttons, which is the correct degradation (email/password still works).

### C. `OAuthButton` component

```tsx
import { OAuthButton } from '@vertz/ui/auth';

// Single provider button
<OAuthButton provider="github" />
// Renders: [GitHub icon] Continue with GitHub
// onClick: window.location.href = provider.authUrl

// Custom label
<OAuthButton provider="github" label="Sign in with GitHub" />

// Icon-only (compact login row)
<OAuthButton provider="github" iconOnly />
```

`OAuthButton` reads `useAuth().providers` to resolve the `authUrl` for the given provider. If the provider is not in the list (not configured), the button is not rendered (returns empty).

**Redirect behavior:** Uses `window.location.href` (full-page redirect), NOT SPA navigation. OAuth requires leaving the app entirely. This is the one place where imperative navigation is correct.

**i18n:** The default label is English (`"Continue with {Name}"`). For i18n, provide a translated `label` prop.

### D. `OAuthButtons` component — render all configured providers

```tsx
import { OAuthButtons } from '@vertz/ui/auth';

// Renders a button for every configured provider in a vertical stack
<OAuthButtons />
```

Iterates `useAuth().providers` and renders an `OAuthButton` for each in a vertical stack (column). If no providers are configured, renders nothing. For custom layout, use `useAuth().providers.map(...)` with your own container.

### E. `ProviderIcon` component

```tsx
import { ProviderIcon } from '@vertz/ui/auth';

<ProviderIcon provider="github" size={20} />
<ProviderIcon provider="google" size={24} />
```

Built-in SVG icons for: **GitHub, Google, Discord, Apple, Microsoft, Twitter/X**.

Returns a generic fallback icon (key/lock) for unknown providers. Icons are inline SVGs (no external requests, works in SSR).

---

## Manifesto Alignment

### One way to do things (Principle 2)
Every Vertz app that needs OAuth login renders it the same way: `<OAuthButtons />`. No hunting for auth URLs, no copy-pasting SVGs, no "which approach does this codebase use?"

### AI agents are first-class users (Principle 3)
An LLM building a login page writes `<OAuthButtons />` and it works. No URL construction, no icon lookup, no manual wiring. The API is obvious and correct on the first prompt.

### If it builds, it works (Principle 1)
The `provider` prop on `OAuthButton` is a string matching configured provider IDs. The component gracefully handles unknown providers (renders nothing) rather than crashing. The `authUrl` comes from the server — no URL construction on the client that could be wrong.

### Tradeoffs accepted
- **Icons are built-in, not customizable per-provider.** Users who want custom icons can use `ProviderIcon` as a reference and build their own button with `useAuth().providers`. We provide the common case, not infinite flexibility.
- **No theming system for OAuth buttons.** The components use the Vertz CSS utility system (`css()`/`variants()`) with sensible defaults. Custom styling uses the same `css()` system as all other Vertz components.

---

## Non-Goals

1. **Social login aggregation** — This is not a "Login with X" service. We expose metadata for providers the developer explicitly configured.
2. **Provider auto-discovery** — We don't probe OAuth endpoints to find available providers. The server knows exactly which providers are configured.
3. **Custom provider icon upload** — Built-in icons cover the 6 most common providers. Unknown providers get a generic fallback icon (key/lock SVG).
4. **Full login page component** — We provide building blocks (`OAuthButton`, `OAuthButtons`), not an opinionated full-page layout. The login page structure is the developer's choice.
5. **SSR embedding of providers** — The provider list is fetched client-side. SSR embedding (via `window.__VERTZ_PROVIDERS__`) is a potential future optimization but not needed for v1.

---

## Unknowns

1. **Should `providers` be embedded in the SSR session payload?**
   - Resolution: No. Providers are public data that doesn't change per-session. A single client-side fetch on mount is simple, cacheable, and avoids complicating the SSR hydration path. Can be optimized later if needed.

2. **Should the provider endpoint require CSRF validation?**
   - Resolution: No. The endpoint is read-only (GET) and returns only public information (provider names and URLs). No CSRF risk.

---

## POC Results

No POC needed — the server already has all OAuth provider data in a `Map<string, OAuthProvider>`, and the client auth system is well-established. The work is wiring existing data through a new endpoint and creating UI components.

---

## Type Flow Map

```
Server: config.providers (OAuthProvider[])
  → Map<string, OAuthProvider>
  → GET /api/auth/providers response: OAuthProviderInfo[]

Client: fetch /api/auth/providers
  → AuthContextValue.providers: Signal<OAuthProviderInfo[]>
  → useAuth().providers (auto-unwrapped in JSX)
  → OAuthButton reads providers to find authUrl
  → OAuthButtons maps over providers array

OAuthProviderInfo = { id: string; name: string; authUrl: string }
```

No generics involved — all types are concrete. The `OAuthProviderInfo` interface is the contract between server and client.

---

## E2E Acceptance Test

### Server endpoint

```typescript
describe('Feature: OAuth provider metadata endpoint', () => {
  describe('Given a server with GitHub and Google providers configured', () => {
    describe('When GET /api/auth/providers is called', () => {
      it('Then returns 200 with provider list containing id, name, and authUrl', () => {
        // Response: [
        //   { id: 'github', name: 'GitHub', authUrl: '/api/auth/oauth/github' },
        //   { id: 'google', name: 'Google', authUrl: '/api/auth/oauth/google' },
        // ]
      });
    });
  });

  describe('Given a server with no OAuth providers configured', () => {
    describe('When GET /api/auth/providers is called', () => {
      it('Then returns 200 with an empty array', () => {
        // Response: []
      });
    });
  });

  describe('Given the response payload', () => {
    it('Then does not include clientSecret, scopes, or other internal config', () => {
      // Assert response objects only have { id, name, authUrl }
      // Assert no clientSecret, scopes, trustEmail, etc. in response
    });
  });
});
```

### Client: useAuth().providers

```typescript
describe('Feature: useAuth().providers', () => {
  describe('Given AuthProvider is mounted with basePath="/api/auth"', () => {
    describe('When the providers endpoint returns GitHub and Google', () => {
      it('Then auth.providers contains the two providers', () => {});
      it('Then each provider has id, name, and authUrl', () => {});
    });
  });

  describe('Given the providers endpoint returns an empty array', () => {
    it('Then auth.providers is an empty array', () => {});
  });
});
```

### OAuthButton component

```typescript
describe('Feature: OAuthButton component', () => {
  describe('Given providers include github', () => {
    describe('When <OAuthButton provider="github" /> is rendered', () => {
      it('Then renders a button with text "Continue with GitHub"', () => {});
      it('Then renders the GitHub icon', () => {});
      it('Then clicking the button sets window.location.href to the authUrl', () => {});
    });
  });

  describe('Given providers do NOT include "gitlab"', () => {
    describe('When <OAuthButton provider="gitlab" /> is rendered', () => {
      it('Then renders nothing (empty)', () => {});
    });
  });

  describe('Given <OAuthButton provider="github" iconOnly />', () => {
    it('Then renders only the icon, no text label', () => {});
  });
});
```

### OAuthButtons component

```typescript
describe('Feature: OAuthButtons component', () => {
  describe('Given providers include github and google', () => {
    describe('When <OAuthButtons /> is rendered', () => {
      it('Then renders two OAuthButton elements', () => {});
    });
  });

  describe('Given no providers configured', () => {
    describe('When <OAuthButtons /> is rendered', () => {
      it('Then renders nothing', () => {});
    });
  });
});
```

### ProviderIcon component

```typescript
describe('Feature: ProviderIcon component', () => {
  describe('Given provider="github" and size={20}', () => {
    it('Then renders an SVG element with width=20 and height=20', () => {});
  });

  describe('Given an unknown provider="foobar"', () => {
    it('Then renders a generic fallback icon', () => {});
  });
});
```

---

## Implementation Plan

### Phase 1: Server endpoint + client integration

**Goal:** `GET /api/auth/providers` returns configured providers, `useAuth().providers` exposes them.

**Changes:**
- `packages/server/src/auth/index.ts` — Add `GET /providers` route handler
- `packages/ui/src/auth/auth-types.ts` — Add `OAuthProviderInfo` type
- `packages/ui/src/auth/auth-context.ts` — Add `providers` signal, fetch on mount (silent failure on error)
- `packages/ui/src/auth/public.ts` — Export `OAuthProviderInfo`
- `packages/ui-compiler/src/signal-api-registry.ts` — Add `'providers'` to `useAuth.signalProperties`

**Acceptance Criteria:**
```typescript
describe('Phase 1: Provider metadata', () => {
  describe('Given a server with github and google providers', () => {
    describe('When GET /api/auth/providers is called', () => {
      it('Then returns [{id:"github",name:"GitHub",authUrl:"/api/auth/oauth/github"},{id:"google",name:"Google",authUrl:"/api/auth/oauth/google"}]', () => {});
    });
  });

  describe('Given a server with no providers configured', () => {
    describe('When GET /api/auth/providers is called', () => {
      it('Then returns 200 with an empty array', () => {});
    });
  });

  describe('Given the response payload', () => {
    it('Then does not include clientSecret, scopes, or other internal config', () => {});
  });

  describe('Given AuthProvider is mounted', () => {
    describe('When providers endpoint responds', () => {
      it('Then useAuth().providers contains the provider list', () => {});
    });

    describe('When providers fetch fails', () => {
      it('Then auth.providers stays as empty array (silent failure)', () => {});
    });
  });

  describe('Given the signal API registry', () => {
    it('Then useAuth signalProperties includes "providers" for compiler auto-unwrap', () => {});
  });
});
```

### Phase 2: ProviderIcon + OAuthButton + OAuthButtons components

**Goal:** Renderable OAuth button components that use provider metadata.

**Changes:**
- `packages/ui/src/auth/provider-icons.ts` — SVG icon functions for GitHub, Google, Discord, Apple, Microsoft, Twitter/X
- `packages/ui/src/auth/oauth-button.ts` — `OAuthButton` component
- `packages/ui/src/auth/oauth-buttons.ts` — `OAuthButtons` component
- `packages/ui/src/auth/public.ts` — Export new components

**Acceptance Criteria:**
```typescript
describe('Phase 2: OAuth UI components', () => {
  describe('Given ProviderIcon with provider="github"', () => {
    it('Then renders an SVG with the GitHub icon', () => {});
  });

  describe('Given OAuthButton with provider="github" and providers available', () => {
    it('Then renders a button with "Continue with GitHub" text', () => {});
    it('Then clicking sets window.location.href to authUrl', () => {});
  });

  describe('Given OAuthButtons with 2 providers configured', () => {
    it('Then renders 2 buttons', () => {});
  });
});
```

**Dependencies:** Phase 1 (needs `useAuth().providers`)
