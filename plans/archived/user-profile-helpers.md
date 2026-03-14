# User Profile Display Helpers

> Issue: #1222 — `UserAvatar`, `UserName` components for `@vertz/ui/auth`
> Gap #6 from `plans/auth-ui-framework-gaps.md`

## Problem

Every authenticated app hand-writes defensive code for displaying user info:

```tsx
{auth.user?.avatarUrl && <img src={auth.user.avatarUrl} alt="" />}
<span>{auth.user?.name ?? auth.user?.email}</span>
```

This is trivial per-app but universal. The framework should provide these as composable building blocks.

## API Surface

Three layers — each usable independently, each composable with the others.

### Layer 1: Utility Functions

Pure functions, no context dependency. Import and use anywhere.

```ts
import { getUserDisplayName, getUserInitials } from '@vertz/ui/auth';

getUserDisplayName(user);            // 'Jane Doe'
getUserDisplayName(user, '—');       // custom fallback when no name/email
getUserDisplayName(null);            // 'Unknown'
getUserDisplayName(undefined, '—');  // '—'

getUserInitials(user);               // 'JD'
getUserInitials(null);               // '?'
```

**Signatures:**

```ts
function getUserDisplayName(user: User | null | undefined, fallback?: string): string;
// Chain: user.name (if typeof string && non-empty) → user.email → fallback (default: 'Unknown')

function getUserInitials(user: User | null | undefined): string;
// Chain: first + last word initials from name (max 2 chars) → first char of email → '?'
```

`user.name` and `user.avatarUrl` are accessed via the `User` index signature (`[key: string]: unknown`). The utilities perform safe `typeof` narrowing internally:

```ts
// Internal narrowing pattern — consumers never deal with `unknown`
const name = user.name;
if (typeof name === 'string' && name.length > 0) return name;
// Non-string truthy values (e.g., name: 42) fall through to email
```

### Layer 2: Avatar Primitive

Presentational component. No auth dependency. Explicit props.

```tsx
import { Avatar } from '@vertz/ui/auth';

// Image avatar
<Avatar src="/photo.jpg" alt="Jane Doe" />
<Avatar src="/photo.jpg" alt="Jane Doe" size="lg" />

// Fallback (no src, or image fails to load)
<Avatar size="md" fallback={() => <span>JD</span>} />

// No src, no fallback → default user icon
<Avatar size="sm" />
```

**Props:**

```ts
interface AvatarProps {
  src?: string;
  alt?: string;
  size?: 'sm' | 'md' | 'lg';
  fallback?: (() => unknown) | unknown;  // custom fallback content
  class?: string;                         // additional CSS class on container
}
```

**Behavior:**
- When `src` is provided: renders `<img>` inside a rounded container
- When `src` fails to load (`onerror`): reactively switches to fallback via `signal(false)` + `computed()`
- When no `src` or image error: renders `fallback` if provided, otherwise a default user silhouette SVG icon
- Size variants via `variants()`: sm (32px), md (40px), lg (56px)
- Optional `class` prop applied to the container element

**SSR behavior:** Renders `<img>` when `src` is present, or the fallback/icon when absent. The `onerror` reactive switch is client-side only — during SSR, broken images degrade to a static `<img>` tag until the client hydrates.

### Layer 3: Connected Components

Read from `useAuth()` automatically. Zero-config for the common case, customizable via props.

```tsx
import { UserAvatar, UserName } from '@vertz/ui/auth';

// Zero-config — reads from useAuth().user
<UserAvatar />
<UserName />

// Size variant
<UserAvatar size="lg" />

// Custom fallback text
<UserName fallback="—" />

// Override user source (e.g., team member list, not current user)
<UserAvatar user={teamMember} />
<UserName user={teamMember} />

// Custom fallback rendering (initials instead of icon)
<UserAvatar size="md" fallback={() => <span>{getUserInitials(auth.user)}</span>} />
```

**UserAvatar props:**

```ts
interface UserAvatarProps {
  size?: 'sm' | 'md' | 'lg';
  user?: User;                            // override — defaults to useAuth().user
  fallback?: (() => unknown) | unknown;   // custom fallback passed to Avatar
  class?: string;                         // additional CSS class
}
```

**UserName props:**

```ts
interface UserNameProps {
  fallback?: string;   // default: 'Unknown'
  user?: User;         // override — defaults to useAuth().user
  class?: string;      // additional CSS class on <span>
}
```

**Reactivity:** Both connected components return `computed()` signals (matching the `AuthGate`/`ProtectedRoute` pattern). When `auth.user` changes (login, logout, profile update), the rendered output updates reactively. The `user` prop override is a static snapshot — its reactivity depends on the caller's compiler transforms (getter-based props), which is standard Vertz behavior.

**Behavior outside AuthProvider:**
- With `user` prop: works without `AuthProvider` (no context needed)
- Without `user` prop: throws a descriptive error ("UserAvatar must be used within AuthProvider, or pass a `user` prop")

**Render output:** `UserName` renders a `<span>` element with the display name as text content.

### Composition Examples

```tsx
// Profile card — mix connected + custom
<div class={styles.profile}>
  <UserAvatar size="lg" />
  <div>
    <UserName />
    <span>{auth.user?.email}</span>
  </div>
</div>

// Team member list — override user
{members.map(member => (
  <div key={member.id}>
    <UserAvatar user={member} size="sm" />
    <UserName user={member} />
  </div>
))}

// Fully custom — use Avatar primitive + utilities
const auth = useAuth();
<Avatar src={customAvatarUrl} size="lg" fallback={() => getUserInitials(auth.user)} />

// Just the utility — no components
const displayName = getUserDisplayName(someUser, 'Anonymous');
```

## Implementation Approach

All components use `.ts` files with DOM primitives (`__element`, `__append`, `__enterChildren`, `__exitChildren`) and `computed()` signal returns — matching the `AuthGate`, `ProtectedRoute`, and `OAuthButton` patterns. No `.tsx` files exist in `@vertz/ui` because the package is pre-built and doesn't go through the Vertz compiler plugin.

**Image error handling:** `Avatar` uses manual `signal(false)` for the `imgFailed` state and `computed()` to reactively swap content on error. The compiler-sugar `let` → `signal()` transform does not apply to framework code.

```ts
// Pseudocode — Avatar internals
const imgFailed = signal(false);
const content = computed(() => {
  if (src && !imgFailed.value) {
    const img = __element('img', { src, alt: alt ?? '' });
    __on(img, 'error', () => { imgFailed.value = true; });
    return img;
  }
  return fallback ? (typeof fallback === 'function' ? fallback() : fallback) : defaultUserIcon();
});
```

## Manifesto Alignment

| Principle | How this design aligns |
|-----------|----------------------|
| **One way to do things** | Three layers serve distinct purposes: utilities for data, Avatar for presentation, connected components for auth integration. No overlap — each layer has one job. |
| **If it builds, it works** | Props are fully typed. `User` index signature access is encapsulated behind safe utilities. `size` is a union type — invalid sizes are compile errors. |
| **AI agents are first-class** | An LLM can use `<UserAvatar />` correctly on the first prompt. The `user` prop override is the obvious composition point. |
| **Predictability over convenience** | No magic. `UserAvatar` is a thin wrapper over `Avatar` + `useAuth()`. The data flow is transparent. |

## Non-Goals

- **No `UserProfile` compound component** — combining avatar + name + email into a card layout is app-specific. Users compose from the primitives.
- **No lazy image loading** — `<img>` with `onerror` is sufficient. Intersection Observer or Radix-style loading states are overkill for avatars.
- **No initials-as-default** — the default fallback is an icon, not initials. Initials require app-specific styling choices (colors, fonts). `getUserInitials()` + the `fallback` prop lets users opt in.
- **No `User` type extension** — `name` and `avatarUrl` stay on the index signature. Adding them as optional fields on `User` is a separate concern.
- **No generic icon system** — the user icon is a self-contained inline SVG, like `provider-icons.ts`. A general icon library is not in scope.
- **`Avatar` placement** — `Avatar` lives in `@vertz/ui/auth` alongside its consumers. It has no auth dependency but is purpose-built for the auth use case. Pre-v1, it may move to a general components module if reuse warrants it.

## Unknowns

None identified. The components are thin wrappers over existing primitives (`useAuth`, `variants`, reactive signals, DOM primitives). No new concepts.

## POC Results

N/A — no unknowns to validate.

## Type Flow Map

```
User (auth-types.ts)
  ├── [key: string]: unknown  ──→  getUserDisplayName()  ──→  string
  │   (narrowed via typeof)   ──→  getUserInitials()     ──→  string (max 2 chars)
  │                           ──→  UserAvatar (extracts avatarUrl: typeof === 'string' ? string : undefined)
  │
  └── email: string           ──→  getUserDisplayName()  ──→  string (fallback)
                               ──→  getUserInitials()    ──→  string (first char)

AvatarProps.size: 'sm' | 'md' | 'lg'
  └── variants() definition   ──→  compile-time size validation

UserAvatarProps.user?: User
  └── UserAvatar reads useAuth().user if not provided (via computed())
  └── passes to Avatar as src={avatarUrl}, alt={displayName}

UserNameProps.user?: User
  └── UserName reads useAuth().user if not provided (via computed())
  └── renders getUserDisplayName(user, fallback) inside <span>
```

No dead generics — no generics in this design. All types are concrete.

## E2E Acceptance Test

```ts
describe('Feature: User profile display helpers', () => {
  // --- getUserDisplayName ---
  describe('Given a user with name "Jane Doe" and email "jane@example.com"', () => {
    describe('When calling getUserDisplayName(user)', () => {
      it('Then returns "Jane Doe"', () => {});
    });
  });

  describe('Given a user with no name and email "jane@example.com"', () => {
    describe('When calling getUserDisplayName(user)', () => {
      it('Then returns "jane@example.com"', () => {});
    });
  });

  describe('Given a user with name: 42 (non-string) and email "jane@example.com"', () => {
    describe('When calling getUserDisplayName(user)', () => {
      it('Then falls through to email, returns "jane@example.com"', () => {});
    });
  });

  describe('Given null user', () => {
    describe('When calling getUserDisplayName(null, "—")', () => {
      it('Then returns "—"', () => {});
    });
  });

  // --- getUserInitials ---
  describe('Given a user with name "Jane Doe"', () => {
    describe('When calling getUserInitials(user)', () => {
      it('Then returns "JD"', () => {});
    });
  });

  describe('Given a user with name "Mary Jane Watson"', () => {
    describe('When calling getUserInitials(user)', () => {
      it('Then returns "MW" (first + last, max 2 chars)', () => {});
    });
  });

  describe('Given a user with no name and email "jane@example.com"', () => {
    describe('When calling getUserInitials(user)', () => {
      it('Then returns "J"', () => {});
    });
  });

  // --- Avatar ---
  describe('Given Avatar with src="/photo.jpg"', () => {
    describe('When rendered', () => {
      it('Then renders an <img> element with src="/photo.jpg"', () => {});
      it('Then wraps the img in a rounded container', () => {});
    });
  });

  describe('Given Avatar with src that fails to load (onerror fires)', () => {
    describe('When the img fires onerror', () => {
      it('Then switches to fallback content (default icon)', () => {});
    });
  });

  describe('Given Avatar with no src', () => {
    describe('When rendered', () => {
      it('Then renders the default user icon SVG', () => {});
    });
  });

  describe('Given Avatar with no src but with fallback', () => {
    describe('When rendered', () => {
      it('Then renders fallback as the content', () => {});
    });
  });

  describe('Given Avatar with size="lg"', () => {
    describe('When rendered', () => {
      it('Then applies the lg variant class', () => {});
    });
  });

  // --- UserAvatar ---
  describe('Given AuthProvider with user { avatarUrl: "/photo.jpg", name: "Jane" }', () => {
    describe('When rendering <UserAvatar />', () => {
      it('Then renders an <img> with src="/photo.jpg"', () => {});
    });
  });

  describe('Given AuthProvider with user { name: "Jane" } (no avatarUrl)', () => {
    describe('When rendering <UserAvatar />', () => {
      it('Then renders the default user icon fallback', () => {});
    });
  });

  describe('Given <UserAvatar user={otherUser} />', () => {
    describe('When rendered', () => {
      it('Then uses otherUser instead of auth context user', () => {});
    });
  });

  describe('Given <UserAvatar /> outside AuthProvider with no user prop', () => {
    describe('When rendered', () => {
      it('Then throws descriptive error', () => {});
    });
  });

  // --- UserName ---
  describe('Given AuthProvider with user { name: "Jane Doe" }', () => {
    describe('When rendering <UserName />', () => {
      it('Then renders a <span> with text "Jane Doe"', () => {});
    });
  });

  describe('Given AuthProvider with user { email: "jane@example.com" } (no name)', () => {
    describe('When rendering <UserName />', () => {
      it('Then renders "jane@example.com"', () => {});
    });
  });

  describe('Given <UserName fallback="—" /> with user { } (no name, no email)', () => {
    describe('When rendered', () => {
      it('Then renders "—"', () => {});
    });
  });

  describe('Given <UserName user={otherUser} /> outside AuthProvider', () => {
    describe('When rendered', () => {
      it('Then works without AuthProvider, using provided user', () => {});
    });
  });
});
```

## Implementation Plan

### Phase 1: Utility Functions + Avatar Primitive

**Scope:** Pure functions and presentational component — no auth dependency.

**Files:**
- `packages/ui/src/auth/user-display.ts` — `getUserDisplayName()`, `getUserInitials()`
- `packages/ui/src/auth/user-icon.ts` — default user silhouette SVG (inline, like `provider-icons.ts`)
- `packages/ui/src/auth/avatar.ts` — `Avatar` component with DOM primitives, `signal()`, `computed()`, `variants()`
- `packages/ui/src/auth/__tests__/user-display.test.ts` — utility function tests
- `packages/ui/src/auth/__tests__/avatar.test.ts` — Avatar component tests

**Acceptance criteria:**

```ts
describe('Feature: getUserDisplayName', () => {
  describe('Given user with name "Jane Doe"', () => {
    it('returns "Jane Doe"', () => {});
  });
  describe('Given user with no name, email "jane@example.com"', () => {
    it('returns "jane@example.com"', () => {});
  });
  describe('Given user with no name and no email', () => {
    it('returns "Unknown" by default', () => {});
  });
  describe('Given null user with custom fallback "—"', () => {
    it('returns "—"', () => {});
  });
  describe('Given user with name: 42 (non-string truthy value)', () => {
    it('falls through to email', () => {});
  });
});

describe('Feature: getUserInitials', () => {
  describe('Given user with name "Jane Doe"', () => {
    it('returns "JD"', () => {});
  });
  describe('Given user with single name "Jane"', () => {
    it('returns "J"', () => {});
  });
  describe('Given user with name "Mary Jane Watson"', () => {
    it('returns "MW" (first + last, max 2 chars)', () => {});
  });
  describe('Given user with no name, email "jane@example.com"', () => {
    it('returns "J"', () => {});
  });
  describe('Given null user', () => {
    it('returns "?"', () => {});
  });
});

describe('Feature: Avatar', () => {
  describe('Given src="/photo.jpg"', () => {
    it('renders an <img> element inside a container div', () => {});
    it('sets alt attribute from props', () => {});
  });
  describe('Given src that triggers onerror', () => {
    it('switches to fallback content on image load error', () => {});
  });
  describe('Given no src and no fallback', () => {
    it('renders the default user icon SVG', () => {});
  });
  describe('Given no src with fallback', () => {
    it('renders fallback content', () => {});
  });
  describe('Given size="sm"', () => {
    it('applies sm variant class', () => {});
  });
  describe('Given size="lg"', () => {
    it('applies lg variant class', () => {});
  });
  describe('Given class="custom"', () => {
    it('applies custom class to container', () => {});
  });
});
```

### Phase 2: Connected Components + Public Exports

**Scope:** Auth-connected wrappers and public API surface.

**Files:**
- `packages/ui/src/auth/user-avatar.ts` — `UserAvatar` component (DOM primitives + `computed()`)
- `packages/ui/src/auth/user-name.ts` — `UserName` component (DOM primitives + `computed()`)
- `packages/ui/src/auth/__tests__/user-avatar.test.ts` — UserAvatar tests
- `packages/ui/src/auth/__tests__/user-name.test.ts` — UserName tests
- `packages/ui/src/auth/public.ts` — add exports
- `.changeset/*.md` — changeset

**Testing strategy:** Tests use `AuthContext.Provider` with a mock context value (signal-backed, matching the `auth-gate.test.ts` pattern). Components are rendered by calling them directly as functions (matching the `OAuthButton` test pattern).

**Acceptance criteria:**

```ts
describe('Feature: UserAvatar', () => {
  describe('Given auth user with avatarUrl "/photo.jpg"', () => {
    it('renders Avatar with src="/photo.jpg"', () => {});
  });
  describe('Given auth user with name but no avatarUrl', () => {
    it('renders Avatar fallback (default icon)', () => {});
  });
  describe('Given user prop override', () => {
    it('uses provided user instead of auth context', () => {});
  });
  describe('Given size="lg"', () => {
    it('passes size to Avatar', () => {});
  });
  describe('Given fallback', () => {
    it('passes fallback to Avatar', () => {});
  });
  describe('Given no AuthProvider and no user prop', () => {
    it('throws descriptive error', () => {});
  });
  describe('Given class="custom"', () => {
    it('passes class to Avatar', () => {});
  });
});

describe('Feature: UserName', () => {
  describe('Given auth user with name "Jane Doe"', () => {
    it('renders <span> with text "Jane Doe"', () => {});
  });
  describe('Given auth user with email only', () => {
    it('renders email as fallback', () => {});
  });
  describe('Given user prop override', () => {
    it('uses provided user instead of auth context', () => {});
  });
  describe('Given fallback="—"', () => {
    it('uses custom fallback when no name or email', () => {});
  });
  describe('Given no AuthProvider and no user prop', () => {
    it('throws descriptive error', () => {});
  });
  describe('Given class="custom"', () => {
    it('applies custom class to span', () => {});
  });
});
```

**Dependencies:** Phase 1 must complete first (Avatar, utilities).
