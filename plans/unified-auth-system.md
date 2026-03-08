# Unified Authentication & Authorization System

> **Status:** Draft for CTO Review
> **Authors:** Vinicius (CTO), Ben (Core)
> **Date:** 2026-03-07
> **Supersedes:** `auth-module-spec.md`, `auth-phase2-spec.md`, `access-system.md`, `access-system-client.md`
> **Related:** Entity-Driven Architecture, Vertz Manifesto, VISION.md

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Architecture Overview](#2-architecture-overview)
3. [Authentication](#3-authentication)
4. [Session Management](#4-session-management)
5. [SSR Authentication](#5-ssr-authentication)
6. [RBAC & Access Control](#6-rbac--access-control)
7. [Access Set Bootstrap](#7-access-set-bootstrap)
8. [Client-Side Access API](#8-client-side-access-api)
9. [Plans & Billing Integration](#9-plans--billing-integration)
10. [Reactive Invalidation](#10-reactive-invalidation)
11. [Security Hardening](#11-security-hardening)
12. [Compiler Responsibilities](#12-compiler-responsibilities)
13. [Error Codes & HTTP Responses](#13-error-codes--http-responses)
14. [Performance Analysis](#14-performance-analysis)
15. [Type Flow Map](#15-type-flow-map)
16. [Manifesto Alignment](#16-manifesto-alignment)
17. [Non-Goals](#17-non-goals)
18. [Unknowns](#18-unknowns)
19. [E2E Acceptance Tests](#19-e2e-acceptance-tests)
20. [Implementation Phases](#20-implementation-phases)

---

## 1. Problem Statement

Authentication and authorization in modern full-stack apps require coordinating at least six independent concerns: identity verification, session management, RBAC, feature flags, billing/plans, and usage limits. Existing tools solve these piecemeal -- Clerk handles identity but not authorization, LaunchDarkly handles flags but not billing, Zanzibar handles relationships but not plans. Developers stitch together 3-5 services, each with its own data store, caching strategy, and invalidation mechanism.

Vertz eliminates this fragmentation because it owns the full stack -- database, server, compiler, client runtime, and SSR. This document specifies the complete auth system: from password hashing to client-side `can()` checks, from JWT claims to RLS policy generation.

### What Already Exists (Phase 1)

The following is implemented in `@vertz/server`:

- `createAuth()` with JWT sessions (stateless, HS256/ES256)
- Email/password with bcrypt (cost 12)
- CSRF protection (Origin + `X-VTZ-Request` header, always enabled)
- In-memory rate limiting per endpoint
- `createAccess()` with flat RBAC, `ctx.can()`, `ctx.authorize()`
- Auth routes: `/api/auth/{signup,signin,signout,session,refresh}`
- Secure cookie defaults (HttpOnly, Secure, SameSite=Lax)
- 7-day session TTL, custom JWT claims
- In-memory user/session store (placeholder)

This document unifies Phase 1 with the remaining phases into one coherent specification.

---

## 2. Architecture Overview

### Dual-Token Session Model

Adapted from Clerk's architecture, but both cookies are HttpOnly (Vertz owns the server -- no need for JS-accessible tokens):

```
                     ┌─────────────────────────────┐
                     │         Browser              │
                     │                               │
                     │  vertz.sid (HttpOnly, 60s)    │  Short-lived JWT
                     │  vertz.ref (HttpOnly, 7d)     │  Long-lived opaque refresh token
                     └──────────────┬────────────────┘
                                    │
                ┌───────────────────┼───────────────────┐
                │                   │                   │
           Page Request        API Request          Refresh
           (SSR + JWT)         (JWT only)        (refresh cookie)
                │                   │                   │
        ┌───────▼───────┐   ┌──────▼──────┐    ┌───────▼───────┐
        │ SSR Middleware │   │ API Middleware│    │ /api/auth/    │
        │  Validate JWT  │   │  Validate JWT │    │   refresh     │
        │  If expired:   │   │  If expired:  │    │               │
        │  DB fallback   │   │  Return 401   │    │  Validate     │
        │  (no redirect) │   │               │    │  refresh token│
        └───────┬───────┘   └──────┬──────┘    │  against DB   │
                │                   │           │  Issue new JWT │
                ▼                   ▼           │  Rotate refresh│
         Render with            Return          └───────────────┘
         access set             response
```

### Five-Layer Access Resolution

All access checks flow through one API (`ctx.can()` on server, `can()` on client) resolving five layers in order:

```
┌─────────────────────────────────────────────────────┐
│ Layer 1: Feature Flags (O(1) in-memory)             │
│   → If flag disabled, DENY. Short-circuit.          │
├─────────────────────────────────────────────────────┤
│ Layer 2: RBAC (O(1) from precomputed access set)    │
│   → Role → entitlement mapping. Handles 90%.        │
├─────────────────────────────────────────────────────┤
│ Layer 3: Hierarchy (1 indexed query via closure tbl) │
│   → "Does user have path to this resource?"          │
├─────────────────────────────────────────────────────┤
│ Layer 4: Plan (O(1) from session cache)             │
│   → Org plan must include entitlement.              │
├─────────────────────────────────────────────────────┤
│ Layer 5: Wallet (1 query, not cacheable)            │
│   → Usage limit check. Rarest, most expensive.      │
└─────────────────────────────────────────────────────┘
```

Each layer short-circuits on denial. Resolution order is cheapest-first.

---

## 3. Authentication

### 3.1 Email/Password (Implemented)

Already built in `@vertz/server`. Reference implementation:

```ts
import { createAuth } from '@vertz/server';

const auth = createAuth({
  session: { strategy: 'jwt', ttl: '7d' },
  emailPassword: {
    enabled: true,
    password: { minLength: 8 },
    rateLimit: { window: '15m', maxAttempts: 5 },
  },
});
```

- Passwords hashed with bcrypt, cost 12
- Email normalized to lowercase before lookup
- Rate limiting: 5 sign-in attempts per 15min, 3 sign-up per hour
- **Timing-safe unknown email handling:** When a sign-in attempt uses an email that does not exist in the database, the server performs a dummy `bcrypt.compare()` against a pre-computed hash before returning `INVALID_CREDENTIALS`. This equalizes response times between "email not found" (< 1ms without dummy) and "wrong password" (~250ms with bcrypt), preventing timing-based user enumeration.

### 3.2 OAuth Providers

OAuth uses a plugin pattern. Each provider is a factory function:

```ts
import { createAuth, google, github, discord } from '@vertz/server';

const auth = createAuth({
  session: { strategy: 'jwt', ttl: '60s', refreshTtl: '7d' },
  emailPassword: { enabled: true },
  providers: [
    google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    github({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    }),
    discord({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
    }),
  ],
});
```

#### Provider Interface

```ts
interface OAuthProvider {
  id: string;                        // 'google', 'github', 'discord'
  name: string;                      // Display name
  scopes: string[];                  // OAuth scopes requested
  trustEmail: boolean;               // Whether to auto-link by email (see Account Linking)
  getAuthorizationUrl(state: string, codeVerifier: string, nonce?: string): string;
  exchangeCode(code: string, codeVerifier: string): Promise<OAuthTokens>;
  getUserInfo(accessToken: string): Promise<OAuthUserInfo>;
}

interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  idToken?: string;                  // For OIDC providers (Google)
}

interface OAuthUserInfo {
  providerId: string;                // Provider-specific user ID
  email: string;
  emailVerified: boolean;
  name?: string;
  avatarUrl?: string;
}
```

#### OAuth Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/auth/oauth/:provider` | GET | Redirect to provider authorization URL |
| `/api/auth/oauth/:provider/callback` | GET | Handle provider callback, create/link account |

#### OAuth Flow

```
1. GET /api/auth/oauth/google
   → Generate state (CSRF) + PKCE code_verifier + code_challenge
   → For OIDC providers: generate cryptographic nonce
   → Store state + code_verifier + nonce in encrypted HttpOnly cookie (AES-256-GCM, 5min TTL)
   → Redirect to Google's authorization URL (with nonce in request)

2. Google redirects to /api/auth/oauth/google/callback?code=XXX&state=YYY
   → Validate state against cookie (must fail closed: no cookie = reject)
   → Exchange code + code_verifier for tokens (PKCE)
   → For OIDC providers: validate nonce claim in ID token against cookie
   → Fetch user info from Google
   → Lookup oauth_accounts table:
     a. Existing link → sign in as linked user
     b. No link but email matches verified user → auto-link, sign in
     c. No link, no email match → create new user + link
   → Issue session (JWT + refresh token)
   → Redirect to app (configurable post-auth URL, default '/')
```

#### Account Linking

Users can have multiple OAuth providers linked to one account. The `oauth_accounts` table tracks links:

```sql
CREATE TABLE oauth_accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL,           -- 'google', 'github', 'discord'
  provider_id   TEXT NOT NULL,           -- Provider-specific user ID
  email         TEXT,                    -- Email from provider (may differ from user email)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider, provider_id)
);

CREATE INDEX idx_oauth_user ON oauth_accounts(user_id);
```

**Linking rules:**
- **Auto-link only from trusted providers:** If `provider.trustEmail` is `true` AND the OAuth email matches an existing verified user email, auto-link on first OAuth sign-in. Google (OIDC with verified email in ID token) has `trustEmail: true` by default. GitHub and Discord have `trustEmail: false` by default -- they do not guarantee email ownership at the protocol level.
- **Untrusted providers require manual linking:** If `provider.trustEmail` is `false`, the OAuth sign-in creates a new account even if the email matches. The user must log in to the existing account and manually link the OAuth provider via a "Link Account" flow. This prevents account takeover via providers with unreliable email verification.
- If the user already has a password, OAuth becomes an additional sign-in method
- If the user only has OAuth, they can add a password later via `/api/auth/set-password`
- Unlinking the last auth method is blocked (user must always have at least one)

#### Provider-Specific Configuration

| Provider | Default Scopes | Userinfo Source | `trustEmail` |
|----------|---------------|-----------------|--------------|
| Google | `openid`, `email`, `profile` | OIDC ID token (decoded, nonce-validated) | `true` |
| GitHub | `read:user`, `user:email` | `/user` + `/user/emails` endpoints | `false` |
| Discord | `identify`, `email` | `/users/@me` endpoint | `false` |

### 3.3 MFA/TOTP

MFA adds a second factor after primary credentials are verified:

```ts
const auth = createAuth({
  // ...
  mfa: {
    totp: { enabled: true, issuer: 'MyApp' },
    backupCodes: { enabled: true, count: 10 },
  },
});
```

#### MFA Database Schema

```sql
CREATE TABLE user_mfa (
  user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  totp_secret     TEXT,                    -- Encrypted TOTP secret (AES-256-GCM)
  totp_enabled    BOOLEAN NOT NULL DEFAULT false,
  backup_codes    TEXT[],                  -- Hashed backup codes (bcrypt)
  enabled_at      TIMESTAMPTZ,
  last_verified   TIMESTAMPTZ
);
```

#### MFA Routes

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/auth/mfa/setup` | POST | Session | Generate TOTP secret, return `otpauth://` URI |
| `/api/auth/mfa/verify-setup` | POST | Session | Verify first TOTP code, enable MFA |
| `/api/auth/mfa/challenge` | POST | MFA token | Submit TOTP/backup code during sign-in |
| `/api/auth/mfa/disable` | POST | Session + re-auth + TOTP | Disable MFA (requires current password AND valid TOTP/backup code) |
| `/api/auth/mfa/backup-codes` | POST | Session + re-auth | Regenerate backup codes |

#### MFA Sign-In Flow

```ts
// Step 1: Primary credentials
POST /api/auth/signin { email, password }
// Response when MFA enabled:
{
  requiresMfa: true,
  mfaToken: "eyJ...",              // Short-lived JWT (5 min), contains userId only
  methods: ["totp", "backup_code"]  // Available MFA methods
}

// Step 2: MFA challenge
POST /api/auth/mfa/challenge { mfaToken: "eyJ...", code: "123456" }
// Response on success:
{
  user: { ... },
  // Set-Cookie: vertz.sid=...; vertz.ref=...
}
```

**MFA token:** A separate JWT (`alg: HS256`, `exp: 5 minutes`, claim: `{ sub: userId, purpose: 'mfa' }`). Cannot be used for API access -- only accepted by `/api/auth/mfa/challenge`.

**Backup codes:** 10 codes, each 8 alphanumeric characters, displayed once during setup. Stored as bcrypt hashes. Each code is single-use (deleted after successful verification). Regeneration invalidates all existing codes. **Timing-safe iteration:** Validation always compares against all 10 hashes (never short-circuits on match) to prevent timing attacks that could reveal how many valid codes remain.

**TOTP encryption key:** The TOTP secret is encrypted at rest with AES-256-GCM. The encryption key is separate from the JWT secret and stored as an environment variable (`VERTZ_TOTP_KEY`). The ciphertext column stores `nonce:ciphertext:tag` (base64). Key rotation: re-encrypt all TOTP secrets with the new key, keeping the old key for decryption during the transition window.

**TOTP implementation:** Uses RFC 6238 (30-second time window, SHA-1, 6 digits). Accepts current window +/- 1 to account for clock drift.

### 3.4 Email Verification

Email verification is opt-in per deployment:

```ts
const auth = createAuth({
  // ...
  emailVerification: {
    enabled: true,
    tokenTtl: '24h',
    onSend: async (user, token) => {
      // Developer provides email sending logic
      await sendEmail(user.email, `Verify: ${appUrl}/verify?token=${token}`);
    },
  },
});
```

#### Verification Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/auth/verify-email` | POST | Submit verification token |
| `/api/auth/resend-verification` | POST | Resend verification email (rate limited: 3/hour) |

**Verification token:** Cryptographically random 32-byte hex string, stored hashed (SHA-256) in `email_verifications` table. TTL configurable, default 24 hours.

```sql
CREATE TABLE email_verifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,                 -- SHA-256 of token
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Unverified users:** Can sign in but have `emailVerified: false` in their session. Developers can use `ctx.user.emailVerified` in access rules to gate features.

### 3.5 Password Reset

```ts
const auth = createAuth({
  // ...
  passwordReset: {
    enabled: true,
    tokenTtl: '1h',
    onSend: async (user, token) => {
      await sendEmail(user.email, `Reset: ${appUrl}/reset?token=${token}`);
    },
  },
});
```

#### Password Reset Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/auth/forgot-password` | POST | Request password reset (sends email) |
| `/api/auth/reset-password` | POST | Submit new password with reset token |

**Reset flow:**

```
1. POST /api/auth/forgot-password { email }
   → Always returns 200 (no email enumeration)
   → If user exists: generate token, call onSend
   → If user doesn't exist: no-op

2. POST /api/auth/reset-password { token, password }
   → Validate token (SHA-256 hash lookup, check expiry)
   → Validate new password against requirements
   → Update password hash
   → Delete all password reset tokens for user
   → Optionally: revoke all sessions (configurable, default: true)
   → Return 200
```

**Reset token:** Same structure as verification token (32-byte random hex, SHA-256 hashed in DB, TTL 1 hour).

```sql
CREATE TABLE password_resets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 4. Session Management

### 4.1 Dual-Token Model

**Session cookie (`vertz.sid`):**
- Short-lived JWT, 60-second expiry
- HttpOnly, Secure, SameSite=Lax, Path=/
- Contains user identity + claims + access set
- Verified locally on every request (no DB hit for 90% of requests)
- Issued by: sign-in, sign-up, OAuth callback, token refresh

**Refresh cookie (`vertz.ref`):**
- Long-lived opaque token, 7-day expiry (configurable via `refreshTtl`)
- HttpOnly, Secure, SameSite=Lax, Path=/api/auth/refresh
- Stored hashed (SHA-256) in `sessions` table
- Server-side revocable
- Rotated on every use (old token invalidated)

**Why 60 seconds:** Limits blast radius of JWT theft. A stolen JWT is valid for at most 60 more seconds. Combined with refresh token rotation, replay attacks require using the stolen refresh token before the legitimate client does -- triggering rotation detection.

### 4.2 JWT Claims Structure

```ts
interface SessionJWT {
  // Standard claims
  sub: string;              // User ID (UUID)
  iat: number;              // Issued at (Unix timestamp)
  exp: number;              // Expires at (iat + 60s)
  jti: string;              // JWT ID (UUID, for audit)

  // Vertz claims
  sid: string;              // Session ID (maps to sessions table)
  email: string;
  emailVerified: boolean;
  role: string;             // User's global role (from users table)
  tenantId?: string;        // Organization/tenant ID

  // Access set (embedded, ~5KB max)
  acl: {
    ent: Record<string, boolean>;                              // Entitlement → allowed
    flags: Record<string, boolean>;                            // Feature flags
    plan?: { id: string; limits: Record<string, LimitInfo> };  // Plan + consumption
  };

  // Step-up auth
  fva?: number;             // Factor verification age (seconds since last MFA)

  // Custom claims (from config.claims function)
  [key: string]: unknown;
}

interface LimitInfo {
  max: number;
  consumed: number;
  remaining: number;
}
```

**Size budget:** JWT payload must stay under 5KB to avoid cookie size issues. The `acl` field is the largest component. For an app with 50 entitlements, 10 flags, and 5 plan limits: ~2KB. Comfortable margin.

### 4.3 Session Database Schema

```sql
CREATE TABLE sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_hash    TEXT NOT NULL UNIQUE,     -- SHA-256 of refresh token
  expires_at      TIMESTAMPTZ NOT NULL,     -- Refresh token expiry (default 7 days, configurable)
  revoked_at      TIMESTAMPTZ,             -- NULL = active, non-NULL = revoked
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address      INET,
  user_agent      TEXT,
  device_name     TEXT                     -- Derived from UA for display
);

CREATE INDEX idx_sessions_user ON sessions(user_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_sessions_refresh ON sessions(refresh_hash) WHERE revoked_at IS NULL;
```

### 4.4 Token Refresh Flow

```
Client: POST /api/auth/refresh
  Cookie: vertz.ref=<old_refresh_token>

Server:
  1. Extract refresh token from vertz.ref cookie
  2. Hash token (SHA-256)
  3. Lookup in sessions table WHERE refresh_hash = hash AND revoked_at IS NULL
  4. If not found → 401, clear both cookies
  5. If found but expired → 401, clear both cookies, mark revoked
  6. If found but user deleted → 401, clear both cookies, mark revoked
  7. Load user from DB (fresh data, not from old JWT)
  8. Compute fresh access set (roles, entitlements, flags, plan, wallet)
  9. Generate new refresh token (random 32 bytes, base64url)
  10. Update session row: new refresh_hash, new last_active_at
  11. Generate new 60-second JWT with fresh claims + access set
  12. Set both cookies in response

Response:
  Set-Cookie: vertz.sid=<new_jwt>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=60
  Set-Cookie: vertz.ref=<new_refresh>; HttpOnly; Secure; SameSite=Lax; Path=/api/auth/refresh; Max-Age=604800
  Body: { user: { id, email, role, ... } }
```

**Refresh token rotation with grace period:** Every successful refresh generates a new refresh token and invalidates the old one — but the old token remains valid for a **10-second grace window**. This handles the multi-tab race condition: two tabs firing their refresh timer simultaneously both send the same token; the first succeeds and rotates, the second arrives within the grace window and also succeeds (receiving its own new token). After 10 seconds, the old token is hard-invalidated.

Without the grace period, multi-tab users would be frequently logged out — Tab A rotates T1→T2, Tab B's request with T1 gets 401. This is a common scenario, not an edge case.

If an attacker steals a refresh token and uses it after the grace window, the legitimate client's next refresh fails (old token expired). This signals a compromise. The server does NOT auto-revoke on rotation failure — it returns 401, forcing re-authentication. Auto-revoking all sessions on rotation failure is a denial-of-service vector (attacker steals one token, triggers mass logout).

**Refresh token revocation check:** The refresh endpoint's UPDATE query must include `WHERE revoked_at IS NULL` to ensure revoked sessions cannot be refreshed, even if the revocation happened between the SELECT and UPDATE in a concurrent request.

**Client-side refresh:** The client SDK runs a background timer every 50 seconds to refresh the JWT before it expires. If the user has the tab backgrounded and the JWT expires, the next API call returns 401, triggering an immediate refresh attempt.

### 4.5 Session Lifecycle

```ts
// Server-side session API (on AuthInstance)
interface SessionApi {
  /** Revoke a specific session (e.g., user logs out from device management) */
  revokeSession(sessionId: string): Promise<Result<void>>;

  /** Revoke all sessions for a user (e.g., password change, account compromise) */
  revokeAllSessions(userId: string): Promise<Result<void>>;

  /** List active sessions for a user (for device management UI) */
  listSessions(userId: string): Promise<Result<SessionInfo[]>>;
}

interface SessionInfo {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  deviceName: string | null;
  lastActiveAt: Date;
  createdAt: Date;
  isCurrent: boolean;            // True if this is the requesting session
}
```

**Session revocation timing:** When a session is revoked, its refresh token is immediately invalidated. The last-issued JWT remains valid for at most 60 seconds (the JWT TTL). This is acceptable -- 60 seconds is the maximum blast radius.

**Automatic revocation triggers:**
- Password change: revoke all sessions except current (configurable)
- Password reset: revoke all sessions
- Account deletion: cascade delete via FK
- MFA disable: revoke all sessions except current

### 4.6 Session Routes

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/auth/sessions` | GET | Session | List active sessions for current user |
| `/api/auth/sessions/:id` | DELETE | Session | Revoke a specific session |
| `/api/auth/sessions` | DELETE | Session | Revoke all other sessions |

### 4.7 Step-Up Authentication

The `fva` (factor verification age) claim in the JWT tracks how long ago the user last completed MFA. High-security operations can require recent MFA:

```ts
// Server-side: require MFA within last 10 minutes for billing changes
const billing = entity('billing', {
  access: {
    update: rules.all(
      rules.role('owner', 'admin'),
      rules.fva(600),                // fva < 600 seconds (10 minutes)
    ),
  },
});
```

**`fva` check formula:** `effectiveFva = (now - jwt.iat) + jwt.fva`. If `effectiveFva > maxAge`, the step-up is stale. The `fva` value in the JWT is static (set at issuance), so the elapsed time since JWT issuance must be added to get the actual factor verification age.

When `fva` is stale:
1. Server returns `403` with `{ code: 'STEP_UP_REQUIRED', maxAge: 600 }`
2. Client shows MFA prompt
3. User completes MFA via `POST /api/auth/mfa/step-up` (same as challenge, but for already-authenticated users)
4. Server issues new JWT with `fva: 0`
5. Client retries the original request

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/auth/mfa/step-up` | POST | Session | Verify MFA for step-up, refresh JWT with fva=0 |

### 4.8 Cookie Configuration

```ts
const auth = createAuth({
  session: {
    ttl: '60s',                        // JWT lifetime (default, recommended)
    refreshTtl: '7d',                  // Refresh token lifetime (configurable)
    cookie: {
      name: 'vertz.sid',              // JWT cookie name
      refreshName: 'vertz.ref',       // Refresh cookie name
      secure: true,                   // Required in production
      sameSite: 'lax',                // Default
      domain: undefined,              // Current domain only
    },
  },
});
```

**Cookie security invariants (enforced, not configurable):**
- `HttpOnly: true` — always, for both cookies
- `Secure: true` — required in production, relaxed in development with warning
- `SameSite: none` requires `Secure: true` — validated at startup
- Refresh cookie `Path: /api/auth/refresh` — never sent on other requests
- **Domain warning:** Setting `cookie.domain` to a wildcard (e.g., `.example.com`) exposes session cookies to all subdomains and is a security risk. The framework validates at startup and warns if `domain` is set to a wildcard. Without explicit `Domain`, cookies default to the exact hostname (no subdomain sharing).

---

## 5. SSR Authentication

### 5.1 SSR Middleware

The SSR middleware validates the session JWT on every page request. Unlike API middleware, SSR middleware has a DB fallback for expired JWTs:

```ts
async function ssrAuthMiddleware(request: Request): Promise<AuthContext> {
  const jwt = extractCookie(request, 'vertz.sid');

  if (jwt) {
    const payload = verifyJWT(jwt);
    if (payload) {
      // JWT valid → use embedded access set (no DB hit)
      return {
        user: payloadToUser(payload),
        accessSet: payload.acl,
        session: { id: payload.sid },
      };
    }
  }

  // JWT missing or expired → fallback to refresh token (DB lookup)
  const refreshToken = extractCookie(request, 'vertz.ref');
  if (!refreshToken) return ANONYMOUS_CONTEXT;

  const session = await lookupSession(refreshToken);
  if (!session || session.revokedAt) return ANONYMOUS_CONTEXT;

  // Session valid → compute fresh access set, issue new JWT, rotate refresh token
  const user = await loadUser(session.userId);
  const accessSet = await computeAccessSet(user);
  const newJwt = issueJWT(user, session.id, accessSet);
  const newRefreshToken = generateRefreshToken();
  await rotateRefreshToken(session.id, newRefreshToken);

  // Return context with Set-Cookie headers for both cookies
  return {
    user,
    accessSet,
    session: { id: session.id },
    setCookieHeaders: [
      buildSessionCookie(newJwt),
      buildRefreshCookie(newRefreshToken),
    ],
  };
}
```

**No redirect:** Unlike Clerk's handshake flow, Vertz never redirects to resolve authentication during SSR. The DB fallback is a direct lookup — Vertz owns the session store. This eliminates the redirect-based auth resolution that causes flash-of-content issues.

**Refresh token rotation on SSR fallback:** The SSR middleware rotates the refresh token (issues new token, invalidates old) to prevent an attacker who steals a refresh token from silently obtaining new JWTs via SSR pages without triggering rotation detection. Both `vertz.sid` and `vertz.ref` cookies are set in the SSR response.

### 5.2 Access Set in SSR

During SSR, the access set is available synchronously from the JWT payload (or the DB fallback). `can()` calls during SSR are synchronous reads from this pre-computed set:

```ts
// SSR render context — request-scoped via SyncLocalStorage (not globalThis)
// Using SyncLocalStorage ensures concurrent SSR requests never leak access sets
// between users. See separate PR for SyncLocalStorage implementation.
requestScope.set('accessSet', accessSet);

// can() during SSR reads from request-scoped storage
function can(entitlement: Entitlement): AccessCheck {
  const set = requestScope.get('accessSet');
  return set?.entitlements[entitlement] ?? { allowed: false, reason: 'not_authenticated' };
}
```

**Important:** The access set MUST be stored in request-scoped context, NOT on `globalThis`. With concurrent SSR requests, `globalThis` would allow Request A to read Request B's access set — a cross-user permission leakage vulnerability. The request-scoped storage (SyncLocalStorage) is being implemented in a separate PR.

### 5.3 No Hydration Mismatch

The access set is computed once and used in both SSR and client hydration:

```html
<!-- Injected by SSR alongside query data -->
<script>
  window.__VERTZ_ACCESS_SET__ = {"ent":{"project:view":true,"project:export":false},...};
</script>
```

The client hydrates from `window.__VERTZ_ACCESS_SET__`. Same data, same render output, no mismatch.

**XSS prevention:** The `__VERTZ_ACCESS_SET__` serialization uses `JSON.stringify()` on the `AccessSet` type only (never the raw JWT payload with custom claims). The output is HTML-escaped: `</` → `<\/`, `<!--` → `<\!--`. This prevents script injection via entitlement names or denial reason strings.

---

## 6. RBAC & Access Control

### 6.1 `defineAccess()` Configuration

```ts
import { defineAccess } from '@vertz/server';

const access = defineAccess({
  hierarchy: [Organization, Team, Project, Task],

  roles: {
    Organization: ['owner', 'admin', 'member'],
    Team: ['lead', 'editor', 'viewer'],
    Project: ['manager', 'contributor', 'viewer'],
    Task: ['assignee', 'viewer'],
  },

  inheritance: {
    Organization: {
      owner: 'lead',        // org.owner → team.lead
      admin: 'editor',      // org.admin → team.editor
      member: 'viewer',     // org.member → team.viewer
    },
    Team: {
      lead: 'manager',      // team.lead → project.manager
      editor: 'contributor',
      viewer: 'viewer',
    },
    Project: {
      manager: 'assignee',  // project.manager → task.assignee
      contributor: 'assignee',
      viewer: 'viewer',
    },
  },

  entitlements: {
    'project:view':   { roles: ['viewer', 'contributor', 'manager'] },
    'project:edit':   { roles: ['contributor', 'manager'] },
    'project:create': { roles: ['manager', 'lead', 'admin', 'owner'] },
    'project:delete': { roles: ['manager'] },
    'project:export': { roles: ['manager'], plans: ['enterprise'], flags: ['export-v2'] },
    'task:view':      { roles: ['viewer', 'assignee'] },
    'task:edit':      { roles: ['assignee'] },
    'task:complete':  { roles: ['assignee'] },
    'team:invite':    { roles: ['lead', 'admin', 'owner'] },
    'org:billing':    { roles: ['owner', 'admin'] },
    'org:audit-log':  { roles: ['owner', 'admin'], plans: ['enterprise'] },
  },

  plans: {
    free: {
      entitlements: ['project:create', 'project:view', 'project:edit'],
      limits: { 'project:create': { per: 'month', max: 5 } },
    },
    pro: {
      entitlements: ['project:create', 'project:view', 'project:edit', 'project:export'],
      limits: { 'project:create': { per: 'month', max: 100 } },
    },
    enterprise: {
      entitlements: [
        'project:create', 'project:view', 'project:edit', 'project:export',
        'org:audit-log', 'org:sso',
      ],
      limits: { 'project:create': { per: 'month', max: Infinity } },
    },
  },

  flags: {
    'export-v2': { description: 'Export V2 with CSV/JSON support' },
  },
});
```

### 6.2 Entity Access Rules with `rules.*`

Access rules are declared on entities using composable `rules.*` builders. `rules.where()` uses the same query syntax as the DB layer:

```ts
import { entity, rules } from '@vertz/server';

// Reusable rules -- just constants
const isOwner = rules.where({ createdBy: rules.user.id });
const isAssignee = rules.where({ assignedTo: rules.user.id });
const isNotArchived = rules.where({ archived: false });

const Project = entity('projects', {
  model: projectModel,
  access: {
    list:   rules.all(rules.role('viewer', 'contributor', 'manager'), isNotArchived),
    get:    rules.role('viewer', 'contributor', 'manager'),
    create: rules.role('manager', 'lead', 'admin', 'owner'),
    update: rules.any(rules.role('contributor', 'manager'), isOwner),
    delete: rules.any(rules.role('manager'), isOwner),
    export: rules.all(
      rules.role('manager'),
      rules.plan('enterprise'),
      rules.flag('export-v2'),
    ),
  },
});
```

### 6.3 Rules Builders

```ts
rules.role('editor', 'admin')        // User has at least one role (OR)
rules.plan('pro', 'enterprise')      // Org is on at least one plan (OR)
rules.flag('export-v2')              // Feature flag is enabled
rules.where({ field: value })        // Row-level condition (DB query syntax)
rules.where({ createdBy: rules.user.id })  // Dynamic: matches current user
rules.where({ team: { status: 'active' } })  // Relational traversal
rules.all(rule1, rule2)              // All must pass (AND)
rules.any(rule1, rule2)              // At least one must pass (OR)
rules.authenticated()                // User is logged in (no specific role)
rules.fva(maxAge)                    // MFA verified within maxAge seconds
```

**`rules.user` markers:** `rules.user.id`, `rules.user.tenantId` are declarative markers resolved at evaluation time. Because they are declarative (not runtime values), the framework can:
1. Generate RLS policies from them
2. Apply as query filters for list operations
3. Evaluate in-memory for `__access` metadata

### 6.4 `ctx.can()` Server API

**Automatic enforcement:** Entity-level access rules declared in `access: {}` are automatically enforced by the framework on all CRUD operations. The client-side `can()` is advisory — it controls UI visibility, not authorization. The server ALWAYS re-validates before executing mutations. A developer who skips `ctx.authorize()` in a custom handler has a privilege escalation bug — the framework-generated entity routes do not have this gap.

```ts
interface AccessContext {
  /** Check if user can perform action. Returns boolean. Short-circuits on first denial (cheapest-first). */
  can(entitlement: Entitlement): Promise<boolean>;
  can(entitlement: Entitlement, resource: Resource): Promise<boolean>;

  /** Check with structured response. Evaluates ALL layers (no short-circuit) to return the most actionable denial reason. */
  check(entitlement: Entitlement, resource?: Resource): Promise<AccessCheckData>;

  /** Throws AuthorizationError if denied. */
  authorize(entitlement: Entitlement, resource?: Resource): Promise<void>;

  /** Atomic check + wallet increment for limited entitlements. */
  canAndConsume(entitlement: Entitlement, resource?: Resource, amount?: number): Promise<boolean>;

  /** Atomic rollback of a previous canAndConsume(). Use when the operation fails after consumption. */
  unconsume(entitlement: Entitlement, resource?: Resource, amount?: number): Promise<void>;

  /** Bulk check -- returns map of entitlement+resourceId → boolean. Batches hierarchy queries into a single DB query. Max 100 checks per call. */
  canAll(checks: Array<{ entitlement: Entitlement; resource?: Resource }>): Promise<Map<string, boolean>>;
}

interface AccessCheckData {
  allowed: boolean;
  /** All denial reasons (every failing layer), ordered by actionability: plan > role > flag > hierarchy > wallet. */
  reasons: DenialReason[];
  /** Primary reason (first in reasons array) — the most actionable for UI display. */
  reason?: DenialReason;
  meta?: DenialMeta;
}

type DenialReason =
  | 'role_required'
  | 'plan_required'
  | 'flag_disabled'
  | 'limit_reached'
  | 'not_authenticated'
  | 'hierarchy_denied'
  | 'step_up_required';

interface DenialMeta {
  requiredPlans?: string[];
  requiredRoles?: string[];
  limit?: LimitInfo;
  fvaMaxAge?: number;
}
```

### 6.5 Resolution Algorithm

**`can()` — short-circuits (cheapest-first, for performance):**

```ts
async function can(ctx: Context, entitlement: Entitlement, resource?: Resource): Promise<boolean> {
  // 1. Feature flag check (O(1), in-memory)
  const entDef = getEntitlementDef(entitlement);
  if (entDef.flags?.length) {
    for (const flag of entDef.flags) {
      if (!featureFlags.isEnabled(flag, ctx.tenantId)) return false;
    }
  }

  // 2. RBAC check (O(1), from precomputed access set)
  if (entDef.roles.length > 0) {
    const effectiveRole = resource
      ? resolveEffectiveRole(ctx.user, resource)
      : ctx.user.role;
    if (!effectiveRole || !entDef.roles.includes(effectiveRole)) return false;
  }

  // 3. Hierarchy check (1 indexed query, resource-scoped only)
  if (resource) {
    const hasPath = await checkHierarchyPath(ctx.user.id, resource);
    if (!hasPath) return false;
  }

  // 4. Plan check (O(1), from session cache)
  if (entDef.plans?.length) {
    const orgPlan = ctx.tenant.plan;
    if (!entDef.plans.includes(orgPlan)) return false;
  }

  // 5. Wallet check (1 query, dynamic)
  const limit = getLimit(ctx.tenant.plan, entitlement);
  if (limit !== Infinity) {
    const wallet = await checkWallet(ctx.tenant.id, entitlement);
    if (wallet.consumed >= limit) return false;
  }

  return true;
}
```

**`check()` — evaluates ALL layers (for actionable denial reasons):**

Unlike `can()`, `check()` does not short-circuit. It evaluates every layer and collects all denial reasons. The reasons are ordered by actionability (the most useful reason for UI display comes first):

1. `plan_required` — most actionable (user can upgrade)
2. `role_required` — actionable (user can request access from admin)
3. `limit_reached` — actionable (user can wait for period reset or upgrade)
4. `flag_disabled` — informational (feature not yet available)
5. `hierarchy_denied` — informational (no path to resource)
6. `step_up_required` — actionable (user can complete MFA)

This prevents the "misleading denial reason" problem where a feature-flag short-circuit hides the more actionable `plan_required` reason from the UI. The `reason` field returns the primary (most actionable) reason; `reasons` returns all failing layers.

**Note on `can()` and wallet:** `can()` performs a read-only wallet check at Layer 5. This is non-atomic — between `can()` returning `true` and the developer acting on it, another request could exhaust the limit. For limited entitlements, always use `canAndConsume()` for the actual operation. `can()` is appropriate for UI display ("show the create button") but not for gating the actual creation.

### 6.6 Resource Hierarchy (Closure Table)

Resources form trees: Org -> Team -> Project -> Task. The closure table precomputes all ancestor/descendant paths:

```sql
CREATE TABLE resource_closure (
  ancestor_type   TEXT NOT NULL,
  ancestor_id     UUID NOT NULL,
  descendant_type TEXT NOT NULL,
  descendant_id   UUID NOT NULL,
  depth           INT NOT NULL,
  PRIMARY KEY (ancestor_type, ancestor_id, descendant_type, descendant_id)
);

CREATE INDEX idx_closure_descendant ON resource_closure(descendant_type, descendant_id);
CREATE INDEX idx_closure_ancestor ON resource_closure(ancestor_type, ancestor_id);
```

**Hierarchy depth cap:** 4 levels. Beyond 4, flatten the hierarchy or use Zanzibar-style tuples.

**Self-references:** Every resource has a depth-0 self-reference row `(type, id, type, id, 0)`. This simplifies queries — a resource is always its own ancestor.

**Automatic maintenance:** Entity create/delete hooks (compiler-generated) maintain the closure table. On entity creation, hooks insert the self-reference row plus all ancestor paths. On entity deletion, hooks remove all closure rows where the entity is an ancestor or descendant. Developers never write closure table code.

**Scaling note:** For an org with 1,000 teams, 10,000 projects, and 100,000 tasks, the closure table contains ~430K rows. This is well within Postgres capabilities. Entity creation adds 2-4 closure rows (O(hierarchy depth)). Entity reparent is the expensive operation (DELETE old paths + INSERT new paths for the entity and all its descendants) — for a project with 100 tasks, expect 15-50ms under load.

### 6.7 Role Inheritance

When a user has a role on a parent resource, the `inheritance` config maps it to a role on child resources:

```
User has admin on Org A
  → inheritance.Organization.admin = 'editor'
  → User gets editor on Team B (child of Org A)
  → inheritance.Team.editor = 'contributor'
  → User gets contributor on Project C (child of Team B)
```

**Effective role resolution — additive model:** The effective role for a resource is the **most permissive** role across the union of all direct assignments and all inherited roles. Roles only add permissions, never restrict.

Example: User has `admin` on Org A (inherits `editor` on Team B) and a direct `viewer` assignment on Team B. The effective role on Team B is `editor` (more permissive), not `viewer`. The direct assignment does not override the inherited role — both contribute to the effective permissions.

**To restrict access**, remove the parent role or use `rules.where()` conditions on the entity. Direct role assignments cannot be used to restrict below inherited permissions. This is the standard model used by Google IAM, AWS IAM, and Zanzibar-based systems.

### 6.8 Role Assignment Database Schema

```sql
CREATE TABLE role_assignments (
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL,
  resource_id   UUID NOT NULL,
  role          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, resource_type, resource_id, role)
);

CREATE INDEX idx_roles_resource ON role_assignments(resource_type, resource_id);
```

### 6.9 RLS Policy Generation

`rules.where()` declarations are compiled to Postgres Row-Level Security policies as defense-in-depth:

```sql
-- From: rules.where({ createdBy: rules.user.id })
CREATE POLICY projects_owner_access ON projects FOR ALL
  USING (created_by = current_setting('app.user_id')::UUID);

-- From: rules.where({ archived: false })
CREATE POLICY projects_not_archived ON projects FOR SELECT
  USING (archived = false);

-- From: rules.where({ team: { status: 'active' } })
CREATE POLICY tasks_active_team ON tasks FOR SELECT
  USING (team_id IN (SELECT id FROM teams WHERE status = 'active'));
```

The compiler warns when access rules contain logic that cannot be translated to SQL (e.g., async external calls). In those cases, the app-layer check is authoritative and no RLS policy is generated for that rule.

---

## 7. Access Set Bootstrap (Server to Client)

### 7.1 Data Shape

```ts
interface AccessSet {
  /** Global entitlements with denial info */
  entitlements: Record<Entitlement, AccessCheckData>;

  /** Active feature flags for this tenant */
  flags: Record<string, boolean>;

  /** Org plan info */
  plan: {
    id: string;
    limits: Record<Entitlement, LimitInfo>;
  };

  /** Cache version -- incremented on access changes */
  computedAt: number;
}
```

**What is included:** Only **global entitlements** — resolved from RBAC (role), plan, and feature flag layers. These are the layers that can be evaluated without knowing the specific resource. Per-resource checks (hierarchy, `rules.where()` conditions like ownership) are NOT included in the global access set — those come from `__access` metadata on entity responses.

**Relationship between global access set and entity `__access`:** When `can()` is called with an entity argument, the entity's `__access` is authoritative. It includes the full 5-layer resolution for that specific resource. When `can()` is called without an entity (global check), the global access set is used. The two are independent — the global set does not override entity `__access` or vice versa.

**Size:** ~5KB for a typical app (50 entitlements, 10 flags, 5 limits). Embedded in the JWT `acl` claim.

**Overflow strategy for large apps (100+ entitlements):** If the access set exceeds the JWT size budget (~3.5KB for the `acl` claim, keeping total JWT under the 4KB cookie limit), the server falls back to a **hydration model**: the JWT `acl` claim contains only a reference hash, and the full access set is hydrated into client memory via the SSR `<script>` tag (no cookie size limit) and kept updated via WebSocket events and the 50-second refresh cycle. This is transparent to the client — `can()` reads from the in-memory access set signal regardless of how it was populated.

### 7.2 Bootstrap Flow

```
1. User authenticates → server creates session
2. Server computes AccessSet:
   a. Batch query: role_assignments JOIN resource_closure → effective roles
   b. Map roles → entitlements via defineAccess() config
   c. Plan lookup → org plan + limits
   d. Feature flags → tenant flags
   e. Wallet query → consumption for limited entitlements
3. AccessSet embedded in JWT as `acl` claim
4. SSR: AccessSet serialized to HTML as __VERTZ_ACCESS_SET__
5. Client hydrates: can() reads from window.__VERTZ_ACCESS_SET__
6. Post-hydration: WebSocket connects for invalidation events
7. Every 50s: JWT refresh brings fresh access set
```

### 7.3 SSR Serialization

```html
<script>
  window.__VERTZ_ACCESS_SET__ = {
    "entitlements": {
      "project:view": { "allowed": true },
      "project:export": {
        "allowed": false,
        "reason": "plan_required",
        "meta": { "requiredPlans": ["enterprise"] }
      }
    },
    "flags": { "export-v2": true },
    "plan": {
      "id": "pro",
      "limits": {
        "project:create": { "max": 100, "consumed": 42, "remaining": 58 }
      }
    },
    "computedAt": 1709827200000
  };
</script>
```

---

## 8. Client-Side Access API

### 8.1 `can()` -- Top-Level Function

Following Vertz conventions (`query()`, `form()` -- top-level, no wrapper), the client access check is `can()` from `@vertz/ui/auth`:

```tsx
import { can } from '@vertz/ui/auth';
import { query } from '@vertz/ui';
import { projectApi } from '../sdk';

export function ProjectActions({ projectId }: { projectId: string }) {
  const project = query(projectApi.get(projectId));

  // Global check -- from session access set (instant, O(1))
  const canCreate = can('project:create');

  // Resource-scoped -- from entity __access metadata (instant, O(1))
  const canExport = can('project:export', project.data);

  return (
    <div>
      {canCreate.allowed && <button>New Project</button>}

      <button disabled={!canExport.allowed}>Export</button>

      {!canExport.allowed && canExport.reason === 'plan_required' && (
        <UpgradePrompt plans={canExport.meta?.requiredPlans} />
      )}

      {!canExport.allowed && canExport.reason === 'role_required' && (
        <span>Contact your admin for export access</span>
      )}

      {!canExport.allowed && canExport.reason === 'flag_disabled' && (
        <span>Coming soon</span>
      )}
    </div>
  );
}
```

### 8.2 Return Type

```ts
interface AccessCheck {
  /** Whether the user is allowed to perform the action. */
  readonly allowed: boolean;
  /** All denial reasons, ordered by actionability (most actionable first). */
  readonly reasons: DenialReason[];
  /** Primary denial reason (first in reasons array). undefined when allowed or loading. */
  readonly reason: DenialReason | undefined;
  /** Denial metadata (required plans, roles, limits). */
  readonly meta: DenialMeta | undefined;
  /** True while the entity data is still loading (resource-scoped checks only). */
  readonly loading: boolean;
}
```

Properties are **getters** backed by internal signals — not raw signals. The developer never uses `.value`. `canExport.allowed` returns `boolean` everywhere — in JSX, in event handlers, in `watch()` callbacks. This is consistent with the framework's principle that developers never interact with signal internals.

The compiler treats `can()` as a `reactive-source` (registered in the reactivity manifest). Any `const` that depends on an `AccessCheck` property becomes `computed` automatically. The getters read from internal signals, so reactivity flows correctly without `.value`.

### 8.3 Resolution

- **Global entitlement** (no entity argument): reads from `AccessContext` signal (populated from `__VERTZ_ACCESS_SET__` or latest JWT refresh).
- **Resource-scoped** (with entity argument): reads from `entity.__access[entitlement]`. If `__access` is not present (entity still loading), returns `{ allowed: false, loading: true, reason: undefined }`.

**Missing provider behavior:** If `can()` is called outside `AccessContext.Provider`, it returns `{ allowed: false, reason: 'not_authenticated', loading: false }` (fail-secure). In development mode, a `console.warn` is emitted to help catch "forgot to add provider" bugs.

### 8.3.1 `AuthGate` — Session Loading Guard

`AuthGate` prevents its children from rendering until the session and access set are fully loaded. This eliminates loading state handling in components that are guaranteed to be behind the gate:

```tsx
import { AuthGate } from '@vertz/ui/auth';

export function App() {
  return (
    <AccessContext.Provider value={accessSet}>
      <AuthGate fallback={<LoadingScreen />}>
        {/* Children only render when session is loaded */}
        {/* can() calls here will never have loading: true */}
        <RouterContext.Provider value={router}>
          <RouterView router={router} />
        </RouterContext.Provider>
      </AuthGate>
    </AccessContext.Provider>
  );
}
```

**Two patterns, explicit choice:**

1. **Behind `AuthGate`** — session is guaranteed loaded. `can().loading` is always `false`. No loading state handling needed. Use for authenticated-only routes and components.

2. **Outside `AuthGate`** — session may still be loading. Developer must handle `can().loading`. Use for public pages that show different UI for authenticated vs anonymous users.

```tsx
// Pattern 1: Behind AuthGate — no loading state needed
function ProjectActions({ projectId }: { projectId: string }) {
  const canCreate = can('project:create');
  // canCreate.loading is always false here
  return canCreate.allowed ? <button>New</button> : null;
}

// Pattern 2: Outside AuthGate — handle loading
function NavBar() {
  const canAdmin = can('org:billing');
  return (
    <nav>
      {canAdmin.loading && <Skeleton />}
      {!canAdmin.loading && canAdmin.allowed && <a href="/admin">Admin</a>}
    </nav>
  );
}
```

**Open question:** Whether a compile-time or static-analysis mechanism can verify that a component using `can()` without loading checks is indeed behind an `AuthGate`. This would prevent runtime errors from components that assume the session is loaded but are rendered outside a gate. Deferred to implementation — if no good static solution exists, the `loading` property and runtime behavior are sufficient.

### 8.4 Memoization

`can()` memoizes by `entitlement + entity?.id`. Same arguments return the same `AccessCheck` object. This prevents creating duplicate reactive subscriptions — a page with 50 task cards checking `can('task:edit', task)` creates 50 `AccessCheck` objects (one per task.id), not 50 per render.

**Reactivity after entity revalidation:** The memoized `AccessCheck` object holds a reactive dependency on the entity's `__access` data (via internal `computed()`). When the entity query revalidates (e.g., after a mutation or WebSocket event), the new `__access` data flows through the getter, and the `AccessCheck` properties update automatically. The memoization is by signal identity — same entity signal, updated value — so the `AccessCheck` stays current without the developer calling `can()` again.

### 8.5 Entity-Level `__access` Metadata

Entity responses include `__access` showing what the current user can do with that specific entity:

```ts
// GET /api/projects/p1
{
  id: 'p1',
  title: 'Marketing Site',
  createdBy: 'u1',
  __access: {
    'project:edit':   { allowed: true },
    'project:delete': { allowed: true },
    'project:export': { allowed: false, reasons: ['plan_required', 'flag_disabled'], reason: 'plan_required', meta: { requiredPlans: ['enterprise'] } },
  },
}
```

**What is included:** Only resource-scoped entitlements (those with `rules.where()` conditions, hierarchy checks, or ownership logic). Global entitlements come from the session access set.

**Performance:** For a list of N entities, `__access` is computed with 1 batch hierarchy query + O(N) in-memory field comparisons. No N+1.

**Opt-out:**

```ts
const Project = entity('projects', {
  model: projectModel,
  access: {
    // ...rules...
    __metadata: false,   // Disable __access on responses
  },
});
```

### 8.6 `AccessContext.Provider`

The app shell wraps the application in `AccessContext.Provider`:

```tsx
import { AccessContext } from '@vertz/ui/auth';

export function App() {
  return (
    <AccessContext.Provider value={accessSet}>
      <RouterContext.Provider value={router}>
        {/* ... */}
      </RouterContext.Provider>
    </AccessContext.Provider>
  );
}
```

For SSR apps using `createBunDevServer`, the framework automatically wraps the SSR render in `AccessContext.Provider` with the access set from the request's auth context. Developers using custom SSR setups must add the provider manually as shown above.

### 8.7 Compiler Integration

`can` is registered in `@vertz/ui/auth`'s reactivity manifest:

```json
{
  "exports": {
    "can": {
      "kind": "function",
      "reactivity": { "type": "reactive-source" }
    }
  },
  "filePath": "@vertz/ui/auth",
  "version": 1
}
```

Zero compiler changes required — uses existing `REACTIVE_SOURCE_APIS` infrastructure via the cross-file manifest system. The `reactive-source` type means `can()` returns a getter-backed object (not raw signals). Any `const` depending on an `AccessCheck` property becomes `computed`. No `.value` insertion needed — the getters handle reactivity internally.

---

## 9. Plans & Billing Integration

### 9.1 Plan Definition

Plans are defined in `defineAccess()` (see section 6.1). A plan specifies which entitlements are available and their usage limits.

### 9.2 Plan Assignment

Plans are assigned at the organization level:

```sql
CREATE TABLE org_plans (
  org_id      UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id     TEXT NOT NULL,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ,
  overrides   JSONB DEFAULT '{}',       -- Per-customer limit overrides (Gleam-style)
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Per-customer overrides:** Individual orgs can have limit overrides without changing their plan:

```ts
await setCustomerOverride(orgId, {
  'project:create': { per: 'month', max: 200 },  // Override pro's 100 limit
});
```

Resolution: `max(customer override, plan limit)`. Overrides can only **increase** limits, never restrict below the plan default. This prevents the scenario where an override set for a lower plan accidentally restricts a higher plan after upgrade.

**Override lifecycle on plan change:** Overrides are scoped to the org, not the plan. When a plan changes, overrides persist but can never reduce permissions below the new plan's defaults (because of the `max()` resolution). If an admin wants to clear overrides after a plan change, they call `clearCustomerOverrides(orgId)`.

### 9.2.1 Plan Expiration

When `org_plans.expires_at` passes:

1. **Fallback:** The org's effective plan becomes `free` (the lowest tier). All plan-gated entitlements are re-evaluated against the free plan.
2. **Grace period (optional):** `defineAccess()` accepts a `planGracePeriod` (default: `0`). During the grace period, the plan remains active but a `plan_expiring: true` flag is set in the access set for UI warnings.
3. **Notification:** `access:plan_expiring` WebSocket event sent when `expires_at - gracePeriod` is reached. `access:plan_expired` sent when `expires_at` passes.
4. **Resolution:** The plan lookup query includes `WHERE expires_at IS NULL OR expires_at > NOW() - grace_interval`. After the grace period, the effective plan is `free`.
5. **Existing resources are not affected.** A downgrade (including expiration) does not delete or archive resources. See section 9.5.1.

### 9.3 Consumption Wallet

The wallet tracks how much of each limited entitlement an org has consumed in the current billing period.

**Limits are creation-velocity limits (per billing period), not resource-count limits.** Existing resources are never affected by plan downgrades or period resets. An org that created 200 projects on enterprise and downgrades to free keeps all 200 projects — the limit only gates new creations. To enforce resource-count limits, use `rules.where()` conditions that count existing resources.

**Billing period:** Anchored to `org_plans.started_at`. A "month" period runs from `started_at` to `started_at + 1 month` (using PostgreSQL `interval '1 month'`). Subsequent periods chain from the previous period's end.

```sql
CREATE TABLE consumption_wallet (
  org_id        UUID NOT NULL,
  entitlement   TEXT NOT NULL,
  period_start  TIMESTAMPTZ NOT NULL,
  period_end    TIMESTAMPTZ NOT NULL,
  consumed      BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, entitlement, period_start)
);

CREATE INDEX idx_wallet_active ON consumption_wallet(org_id, entitlement, period_end)
  WHERE period_end > NOW();
```

### 9.4 `canAndConsume()` -- Atomic Check + Increment

```ts
// Non-atomic (race condition)
if (await ctx.can('project:create')) {
  await incrementWallet(orgId, 'project:create');
  await createProject(data);
}

// Atomic (correct)
if (await ctx.canAndConsume('project:create')) {
  await createProject(data);
}
```

`canAndConsume()` runs the full `can()` resolution and, if all layers pass, atomically increments the wallet using a two-step operation:

**Step 1 — Lazy initialization (ensure wallet row exists):**

```sql
INSERT INTO consumption_wallet (org_id, entitlement, period_start, period_end, consumed)
VALUES ($1, $2, $3, $4, 0)
ON CONFLICT (org_id, entitlement, period_start) DO NOTHING;
```

This handles new orgs and period boundary transitions. Without this step, the UPDATE below would match 0 rows for a brand-new org (indistinguishable from "limit reached"), silently blocking all limited operations.

**Step 2 — Atomic check + increment:**

```sql
UPDATE consumption_wallet
SET consumed = consumed + $5           -- $5 = amount (default 1)
WHERE org_id = $1
  AND entitlement = $2
  AND period_end > NOW()
  AND consumed + $5 <= $3              -- $3 = limit from plan (respects max(override, plan))
RETURNING consumed
```

If the UPDATE affects 0 rows (limit reached between check and increment), returns `false`.

Both steps run in a single transaction.

### 9.4.1 `unconsume()` — Rollback After Operation Failure

If the operation following `canAndConsume()` fails (validation error, DB constraint violation), the wallet must be decremented to prevent permanent consumption drift:

```ts
// Correct pattern
const consumed = await ctx.canAndConsume('project:create');
if (consumed) {
  try {
    await createProject(data);
  } catch (e) {
    await ctx.unconsume('project:create');
    throw e;
  }
}
```

For framework-generated entity routes, `canAndConsume()` and the entity creation run in the same database transaction, so a creation failure automatically rolls back the wallet increment. `unconsume()` is only needed in custom handlers where transactional wrapping is not automatic.

### 9.5 Client-Side Plan Visibility

Plan info is part of the access set (embedded in JWT, available on client):

```ts
const canExport = can('project:export');

if (!canExport.allowed && canExport.reason === 'plan_required') {
  // Show upgrade prompt with the required plans
  const requiredPlans = canExport.meta?.requiredPlans; // ['enterprise']
}

// Show usage limits
const canCreate = can('project:create');
if (canCreate.meta?.limit) {
  const { max, consumed, remaining } = canCreate.meta.limit;
  // "42/100 projects created this month"
}
```

**Consumption counts are point-in-time snapshots.** Different users in the same org may see slightly different remaining counts because their JWTs were refreshed at different times. The server-side `canAndConsume()` is always authoritative.

**Real-time consumption updates:** Every successful `canAndConsume()` call broadcasts an `access:limit_updated` WebSocket event to all active sessions in the same org. This keeps consumption counts reasonably current across all connected clients (O(sessions per org) fan-out).

```ts
// The server automatically broadcasts after canAndConsume():
// { type: 'access:limit_updated', entitlement: 'project:create', consumed: 43, remaining: 57 }
```

---

## 10. Reactive Invalidation

### 10.1 WebSocket Events

| Event | Trigger | Client Response |
|-------|---------|-----------------|
| `access:flag_toggled` | Feature flag toggled | Update flags in access set signal (inline, no network) |
| `access:limit_updated` | Wallet consumption changed | Update plan.limits (inline payload, no network) |
| `access:role_changed` | Role assignment created/deleted | Jittered refetch of access set (0-2s delay) |
| `access:plan_changed` | Org plan upgraded/downgraded | Jittered refetch of access set (0-2s delay) |

**Flag and limit updates** carry the new value inline in the WebSocket message -- no server roundtrip needed:

```ts
// WebSocket message for flag toggle
{ type: 'access:flag_toggled', flag: 'export-v2', enabled: true }

// WebSocket message for limit update
{ type: 'access:limit_updated', entitlement: 'project:create', consumed: 43, remaining: 57 }
```

**Role and plan changes** trigger a jittered refetch. The jitter scales with the number of affected users: `random(0, min(30, affectedUsers / 100))` seconds, capped at 30 seconds. This prevents thundering herd when an admin changes a plan affecting thousands of users. Events are targeted by userId — only affected users refetch.

### 10.1.1 WebSocket Authentication

The WebSocket connection for access invalidation events is authenticated:

1. **Upgrade handshake:** The client includes the `vertz.sid` cookie in the WebSocket upgrade request. The server validates the JWT before accepting the connection.
2. **User scoping:** Each WebSocket connection is associated with the authenticated user's ID. Events are only sent to connections belonging to the affected user(s). An unauthenticated connection cannot receive other users' events.
3. **Session revocation:** When a session is revoked, the server closes the associated WebSocket connection.
4. **JWT expiry:** If the JWT expires during a WebSocket session, the connection remains open (it was authenticated at upgrade time). The next JWT refresh brings fresh credentials.

### 10.1.2 Reconnection Strategy

When the WebSocket connection drops (network change, laptop sleep, mobile background):

1. **Auto-reconnect with exponential backoff:** 1s, 2s, 4s, 8s, 16s, capped at 30s. Jitter applied to each interval.
2. **Immediate access set refresh on reconnect:** The client may have missed events while disconnected. On successful reconnection, the client immediately requests a fresh access set (does not wait for the 50-second timer).
3. **Maximum stale window:** Between disconnection and the next JWT refresh (50-second timer), the client operates with potentially stale permissions. This is acceptable — the 50-second refresh cycle bounds the staleness regardless of WebSocket state.
4. **No polling fallback:** If WebSockets are blocked (corporate firewalls), the client relies entirely on the 50-second JWT refresh cycle for access updates. This is documented as a known limitation.

### 10.2 Reactive Cascade

The access set is stored in signals. When it updates:
1. All `can()` checks that depend on changed entitlements automatically re-evaluate
2. UI reactively updates (buttons enable/disable, prompts appear/disappear)
3. For entity-level `__access`, role/plan changes trigger `revalidate()` on affected queries (SWR pattern)

---

## 11. Security Hardening

### 11.1 CSRF Protection (Implemented)

Already built. Cannot be disabled (Zeroth Law). Dual validation:

1. **Origin header validation:** Request `Origin` (or `Referer` fallback) must match the server origin. Blocks cross-origin form submissions.
2. **Custom header:** `X-VTZ-Request: 1` required on all state-changing requests (POST/PUT/DELETE/PATCH). `fetch()` adds this automatically; cross-origin `<form>` submissions cannot.

### 11.2 Rate Limiting

| Endpoint | Window | Max Attempts | Key |
|----------|--------|-------------|-----|
| `/api/auth/signin` | 15 min | 5 | `signin:{email}` |
| `/api/auth/signup` | 1 hour | 3 | `signup:{email}` |
| `/api/auth/refresh` | 1 min | 10 | `refresh:{ip}` |
| `/api/auth/forgot-password` | 1 hour | 3 | `reset:{email}` |
| `/api/auth/mfa/challenge` | 15 min | 5 | `mfa:{userId}` |
| `/api/auth/mfa/step-up` | 15 min | 5 | `stepup:{userId}` |
| `/api/auth/resend-verification` | 1 hour | 3 | `verify:{userId}` |
| `/api/auth/oauth/:provider` | 5 min | 10 | `oauth:{ip}` |
| `/api/auth/signup` (per IP) | 1 hour | 10 | `signup-ip:{ip}` |
| `/api/auth/set-password` | 1 hour | 3 | `setpw:{userId}` |

**Per-IP signup rate limiting:** The per-email limit (`signup:{email}`) prevents targeting a specific email, but an attacker can use unique emails to amplify CPU load via bcrypt. The per-IP limit bounds the total bcrypt work an attacker can trigger from a single source.

**Phase 1:** In-memory rate limiter (already built).
**Production:** Pluggable rate limit store interface. Redis adapter for multi-instance deployments.

```ts
interface RateLimitStore {
  check(key: string, window: number, max: number): Promise<RateLimitResult>;
}
```

### 11.3 Brute Force Protection

- **Sign-in:** After 5 failed attempts per email within 15 minutes, subsequent attempts return 429 regardless of credentials. The response does not distinguish "rate limited" from "invalid credentials" to prevent timing attacks.
- **MFA:** After 5 failed TOTP attempts per user within 15 minutes, MFA challenge returns 429.
- **Password reset:** Always returns 200 regardless of whether the email exists (prevents email enumeration).
- **Timing-safe comparison:** Password verification, TOTP validation, refresh token hash comparison, and all token hash comparisons use constant-time comparison. Backup code validation always iterates all 10 hashes (never short-circuits on match) to prevent timing attacks that reveal the position of valid codes.
- **MFA escalating lockout:** After 3 consecutive rate-limit windows (15 failed MFA attempts over 45 minutes), the account is locked and requires email verification to unlock. This prevents perpetual low-rate TOTP guessing.

### 11.4 Session Security

- **60-second JWT window:** Limits blast radius of token theft to 60 seconds maximum.
- **Refresh token rotation:** Every refresh invalidates the old token. Replay detection via failed rotation.
- **Per-device sessions:** Each device gets its own refresh token. Individual revocation via device management.
- **Automatic revocation:** Password change and MFA disable revoke all other sessions.
- **Refresh cookie path restriction:** `vertz.ref` cookie has `Path=/api/auth/refresh`, so it is never sent on regular API requests.

### 11.5 JWT Security

- **Algorithm:** HS256 (symmetric, default) or ES256 (asymmetric, for distributed verification). No RS256 (key size overhead, no benefit over ES256 for new systems).
- **Secret requirements:** Production requires explicit `jwtSecret` (minimum 32 bytes). Development auto-generates and persists to `.vertz/jwt-secret`.
- **No `alg: none`:** The `jose` library rejects unsigned tokens by default.
- **Clock tolerance:** 5 seconds, handles minor clock drift between server instances.

### 11.6 Production vs Development Mode

| Security Feature | Production | Development |
|-----------------|------------|-------------|
| JWT secret | Required (throws on missing) | Auto-generated, persisted to `.vertz/` |
| Cookie `Secure` flag | Required (throws if false) | Relaxed with console warning |
| CSRF Origin check | Enforced (403 on failure) | Enforced (warning on failure) |
| CSRF `X-VTZ-Request` header | Enforced (403 on missing) | Enforced (warning on failure) |
| Rate limiting | Active | Active |
| Password requirements | Active | Active |

Production mode is determined by: `config.isProduction > NODE_ENV > true (default)`. Secure by default -- only explicit `NODE_ENV=development` or `NODE_ENV=test` opts out.

### 11.7 Security Headers

The auth handler sets the following headers on auth responses:

```
Cache-Control: no-store, no-cache, must-revalidate
Pragma: no-cache
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
```

Session-related responses (sign-in, sign-up, refresh) must never be cached by intermediaries. The `Referrer-Policy` prevents OAuth callback URLs (which may contain authorization codes) from leaking via the `Referer` header.

**Server access logs:** Auth middleware strips cookie values from request logs. JWT contents must never appear in logs.

### 11.8 CORS

Default: same-origin only (no `Access-Control-Allow-Origin` header). For cross-origin consumption (mobile apps, external clients):

```ts
const auth = createAuth({
  // ...
  cors: {
    allowedOrigins: ['https://mobile.example.com'],
  },
});
```

`Access-Control-Allow-Origin: *` is never allowed when credentials (cookies) are used — the framework validates this at startup.

### 11.9 Session Limits

Maximum active sessions per user: 50 (configurable). When the limit is exceeded, the oldest session is automatically revoked. This prevents session accumulation from automated sign-in attacks and bounds the `listSessions()` response size.

---

## 12. Compiler Responsibilities

### 12.1 Generated Artifacts

| Artifact | Source | Output |
|----------|--------|--------|
| `Entitlement` union type | `defineAccess().entitlements` keys | `type Entitlement = 'project:view' \| 'project:edit' \| ...` |
| `Role<T>` mapped type | `defineAccess().roles` | `type Role<'project'> = 'manager' \| 'contributor' \| 'viewer'` |
| `DenialReasonFor<E>` | Entitlement config (plan, flag) | Narrowed denial reason union per entitlement |
| RLS policies | `rules.where()` + `rules.user` | `CREATE POLICY ... USING (...)` SQL |
| Closure table migration | `defineAccess().hierarchy` | `CREATE TABLE resource_closure ...` |
| Role assignment table | `defineAccess().roles` | `CREATE TABLE role_assignments ...` |
| Wallet table | `defineAccess().plans` with limits | `CREATE TABLE consumption_wallet ...` |
| Entity hooks | Hierarchy entities | `afterCreate`/`afterDelete` hooks for closure table |
| Signal API manifest entry | `can()` return shape | Reactive source in `@vertz/ui/auth` manifest |

### 12.2 Type Generation

```ts
// Generated by compiler from defineAccess()
type ResourceType = 'organization' | 'team' | 'project' | 'task';

type Entitlement =
  | 'project:view' | 'project:edit' | 'project:create' | 'project:delete' | 'project:export'
  | 'task:view' | 'task:edit' | 'task:complete'
  | 'team:invite'
  | 'org:billing' | 'org:audit-log';

type Role<T extends ResourceType> =
  T extends 'organization' ? 'owner' | 'admin' | 'member' :
  T extends 'team' ? 'lead' | 'editor' | 'viewer' :
  T extends 'project' ? 'manager' | 'contributor' | 'viewer' :
  T extends 'task' ? 'assignee' | 'viewer' :
  never;

// Narrowed denial reasons per entitlement
type DenialReasonFor<E extends Entitlement> =
  E extends 'project:export' ? 'role_required' | 'plan_required' | 'flag_disabled' :
  E extends 'org:audit-log' ? 'role_required' | 'plan_required' :
  'role_required';
```

### 12.3 `rules.where()` RLS Generation

```ts
// Source
rules.where({ createdBy: rules.user.id })

// Generated SQL
CREATE POLICY projects_owner_access ON projects FOR ALL
  USING (created_by = current_setting('app.user_id')::UUID);
```

```ts
// Source
rules.where({ team: { status: 'active' } })

// Generated SQL
CREATE POLICY tasks_active_team ON tasks FOR SELECT
  USING (team_id IN (SELECT id FROM teams WHERE status = 'active'));
```

### 12.4 Type Safety Enforcement

```ts
// Autocomplete on entitlement names
ctx.can('project:v|')  // → suggests 'project:view'

// Compile error on invalid entitlement
// @ts-expect-error -- 'project:fly' is not a valid Entitlement
ctx.can('project:fly');

// Compile error on invalid role name
// @ts-expect-error -- 'superadmin' is not a valid role
rules.role('superadmin');

// Compile error on invalid column in rules.where()
// @ts-expect-error -- 'nonExistent' is not a column on projects
rules.where({ nonExistent: rules.user.id });
```

---

## 13. Error Codes & HTTP Responses

### 13.1 Auth Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `AUTH_VALIDATION_ERROR` | 400 | Invalid input (email format, password too short) |
| `INVALID_CREDENTIALS` | 401 | Wrong email/password |
| `SESSION_EXPIRED` | 401 | JWT expired, refresh token invalid |
| `MFA_REQUIRED` | 403 | Primary auth passed, MFA needed |
| `STEP_UP_REQUIRED` | 403 | Action requires recent MFA |
| `PERMISSION_DENIED` | 403 | Access check failed |
| `USER_EXISTS` | 409 | Email already registered |
| `RATE_LIMITED` | 429 | Too many attempts |
| `OAUTH_ERROR` | 502 | Provider returned error |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

### 13.2 Auth Response Format

All auth endpoints return consistent JSON:

**Success:**
```json
{ "user": { "id": "...", "email": "...", "role": "..." } }
```

**Error:**
```json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid email or password"
  }
}
```

**MFA required:**
```json
{
  "requiresMfa": true,
  "mfaToken": "eyJ...",
  "methods": ["totp", "backup_code"]
}
```

**Step-up required (from non-auth endpoints):**
```json
{
  "error": {
    "code": "STEP_UP_REQUIRED",
    "message": "This action requires recent MFA verification",
    "meta": { "fvaMaxAge": 600 }
  }
}
```

---

## 14. Performance Analysis

### 14.1 Read Path (Access Checks)

| Scenario | Cost | Notes |
|----------|------|-------|
| RBAC-only (90% of checks) | < 0.1ms | Feature flag + role: in-memory lookups |
| Resource-scoped (hierarchy) | 1-3ms | + 1 indexed closure table query |
| Resource-scoped + wallet | 2-8ms | + 1 wallet query |
| Client `can()` (global) | < 0.01ms | Signal read from access set |
| Client `can()` (entity) | < 0.01ms | Signal read from entity `__access` |
| `__access` for N entities | O(N)*0.01ms + 1 query | Batch hierarchy + in-memory comparisons |

**Benchmark targets:**
- P50: < 1ms (precomputed RBAC)
- P95: < 5ms (hierarchy + plan)
- P99: < 10ms (hierarchy + plan + wallet)

### 14.2 Write Path

| Operation | Cost | Notes |
|-----------|------|-------|
| Role assignment change | 1-2ms | INSERT/DELETE in role_assignments |
| Invalidation propagation | < 5ms | WebSocket event to affected users |
| Client cache rebuild | 5-20ms | Batch query for fresh access set |
| Entity create (with closure) | 2-7ms | Entity INSERT + closure table INSERT |
| Entity reparent | 3-15ms | DELETE old closure rows + INSERT new (rare) |

### 14.3 Session Operations

| Operation | Cost | Notes |
|-----------|------|-------|
| JWT validation | < 0.1ms | HMAC verification, in-memory |
| Token refresh | 5-15ms | DB lookup + access set computation + JWT signing |
| Access set computation | 2-10ms | 1 batch query (roles + closure + plan + flags) |
| SSR DB fallback | 3-8ms | DB session lookup + user load |

### 14.4 Size Budgets

| Data | Typical Size | Maximum |
|------|-------------|---------|
| JWT payload | 1-2KB | 5KB (cookie limit concern at 4KB) |
| `__VERTZ_ACCESS_SET__` (SSR) | 2-5KB | 10KB |
| `__access` per entity | 200-500 bytes | 1KB |
| Access set in memory (client) | 5-10KB | 20KB |

---

## 15. Type Flow Map

```
defineAccess({ entitlements, roles, plans, flags })
  → [Compiler] Entitlement string literal union
  → [Compiler] Role<ResourceType> mapped type
  → [Compiler] DenialReasonFor<E> conditional type

Entity TableDef<TColumns>
  → rules.where() column names constrained to keyof TColumns & string
  → rules.user markers resolved against session type

Server ctx.can(Entitlement, Resource?)
  → 5-layer resolution
  → boolean

Server ctx.check(Entitlement, Resource?)
  → 5-layer resolution (evaluates ALL layers, no short-circuit)
  → AccessCheckData { allowed, reasons: DenialReasonFor<E>[], reason, meta }

Session bootstrap (sign-in / refresh)
  → AccessSet { entitlements: Record<Entitlement, AccessCheckData>, flags, plan }
  → Embedded in JWT as `acl` claim

JWT `acl` claim
  → SSR: injected as __VERTZ_ACCESS_SET__
  → Client: hydrated into AccessContext signal

can(Entitlement) [client, from @vertz/ui/auth]
  → reads AccessContext signal
  → AccessCheck { allowed, reasons, reason, meta, loading } (getter-backed, reactive-source)

can(Entitlement, entity) [client]
  → reads entity.__access[entitlement]
  → AccessCheck { allowed, reasons, reason, meta, loading } (getter-backed, reactive-source)

Compiler reactivity manifest (@vertz/ui/auth):
  can → reactive-source (all properties auto-unwrapped)
```

Each arrow is a mandatory type-level test during implementation.

---

## 16. Manifesto Alignment

### Explicit over implicit

- Access rules declared at the entity level with composable `rules.*` builders
- Denial reasons are explicit -- `{ allowed, reason, meta }` not just boolean
- `rules.where()` uses DB query syntax -- no separate DSL to learn
- Cookie names, TTLs, and security settings are visible in config

### Compile-time over runtime

- Entitlement names are string literal unions (typos = compile errors)
- `rules.role()` only accepts valid role names
- `rules.where()` column names autocomplete from entity table schema
- RLS policies generated from declarative rules at build time

### One way to do things

- One access API: `can()` on server, `can()` on client
- One definition site: `defineAccess()`
- One entity annotation: `access: { ... }`
- One query syntax: `rules.where()` = DB where clause
- No separate hooks per concern (no `useFeatureFlag()`, `useRole()`, `usePlan()`)

### AI agents are first-class users

- `can('project:export')` is predictable -- LLMs generate it correctly
- Denial reason enum is a closed set -- LLMs write exhaustive switch statements
- One auth function (`createAuth()`) with discoverable config shape
- OAuth providers are factory functions with typed config -- no magic strings

### Alternatives Rejected

| Alternative | Why Rejected |
|-------------|--------------|
| Separate `useFeatureFlag()`, `useRole()`, `usePlan()` hooks | Violates "one way to do things" |
| Client-side access resolution | Server pre-resolves; client reads results |
| CASL/Casbin integration | External dependency, no type safety |
| `<Authorize>` wrapper component | `&&` with `can()` is simpler |
| `access().can()` method pattern | Unnecessary wrapper; top-level `can()` needs zero compiler changes |
| Virtual roles | `rules.where()` + `rules.user` is strictly more powerful |
| Clerk/Auth.js integration | External portal, schema constraints, doesn't own session store |
| Separate `rules.where()` DSL | DB query syntax means one language everywhere |
| RS256 JWT | ES256 is smaller, equally secure; RS256 is legacy overhead |
| `ReadonlySignal` properties on `AccessCheck` | Getters backed by internal signals — developers never use `.value` |
| Single `reason` in `check()` response | `reasons` array returns all failing layers; `reason` is the primary (most actionable) |
| `globalThis` for SSR access set | Request-scoped storage (SyncLocalStorage) prevents cross-user leakage |
| Auto-link OAuth by email for all providers | Only `trustEmail: true` providers (OIDC with verified email) auto-link |

---

## 17. Non-Goals

1. **External auth provider integration** -- No Clerk, Auth0, or Firebase Auth adapters. Vertz owns the full auth stack. Developers build their own auth UI with `@vertz/ui`.

2. **Client-side access resolution** -- The client reads pre-resolved access data. Never computes access checks.

3. **Offline access checks** -- Uses last-known access set. No offline-first access guarantees.

4. **Custom client-side rules** -- `rules.*` is server-only. Client gets results.

5. **Wallet increment from client** -- `canAndConsume()` is server-only.

6. **Multi-tenant access set switching** -- Switching tenants requires a new session.

7. **WebAuthn/Passkeys** -- Deferred. Requires browser API integration and hardware key support. Future phase.

8. **Social login UI components** -- The framework provides the server-side OAuth flow. "Sign in with Google" button is the developer's responsibility using `@vertz/ui`.

9. **Email sending** -- The framework calls `onSend` callbacks. Actual email delivery (SMTP, SES, Resend) is the developer's responsibility. Vertz Cloud will provide managed email.

10. **Redis-backed wallet** — Phase 1 uses Postgres. Redis adapter for high-frequency limits is a future optimization.

11. **Sub-org billing** — Team-level budgets, per-user quotas, and department cost allocation are not supported. All limits are per-organization.

12. **Per-user org creation limits** — Free tier abuse via creating unlimited orgs is mitigated by org creation rate limiting (post-auth, per-user) and monitoring. Automated enforcement of org count limits is deferred.

---

## 18. Unknowns

### 18.1 Compiler-Generated Entitlement Types (Needs POC)

**Question:** Can the compiler generate the `Entitlement` string literal union from `defineAccess()` at dev-server startup, such that `can()` gets autocomplete before runtime?

**Resolution strategy:** Needs POC. The existing compiler processes `.tsx` files per-request. `defineAccess()` lives in a `.ts` config file. Must verify the codegen pipeline can extract string literals and emit a `.d.ts` augmentation file.

**Dependency:** The `DenialReasonFor<E>` conditional type (section 12.2) depends on this POC succeeding. If the POC fails, `DenialReasonFor<E>` collapses to the full `DenialReason` union (no per-entitlement narrowing). This is a DX degradation, not a correctness issue — runtime behavior is unaffected.

**DX flow for adding entitlements:** The design must specify how the developer's type updates flow: add entitlement to `defineAccess()` → ??? → `can('new:entitlement')` has autocomplete. If a dev-server restart or explicit codegen step is required, the DX is poor. If it happens automatically on save (like Prisma's type generation), the DX is good. The POC should validate both the type generation mechanism and the update latency.

### 18.2 `rules.where()` Relational Query Depth (Discussion)

**Question:** How deep should relational `rules.where()` traversal go?

**Options:**
- (a) Limit to 1 level of relation traversal, extend later
- (b) Support arbitrary depth matching the DB query API

**Recommendation:** Start with (a). Deep traversal complicates RLS generation significantly. 1-level covers 95% of use cases.

### 18.3 JWT Size vs Access Set Completeness (Discussion)

**Question:** If an app has 200+ entitlements, the access set may exceed the 5KB JWT budget. How do we handle this?

**Options:**
- (a) Only embed entitlements that differ from the "all-denied" default (sparse encoding)
- (b) Move access set out of JWT into a session-keyed cache, reference by ID
- (c) Split into "critical" (in JWT) and "extended" (fetched separately)

**Recommendation:** (a) for Phase 1. Most users have far fewer than 200 entitlements. Sparse encoding (`{ allowed: true }` only for granted entitlements, deny-by-default) compresses well.

### 18.4 OAuth State Storage (Discussion)

**Question:** OAuth state + PKCE code_verifier must survive the redirect. Where to store?

**Options:**
- (a) HttpOnly cookie (simple, works, 4KB limit)
- (b) Server-side session (requires DB write before redirect)

**Recommendation:** (a). State + code_verifier are small (< 200 bytes). Short TTL cookie (5 minutes) cleared after callback.

### 18.5 Multi-Org User Flow (Discussion)

**Question:** A user can belong to multiple organizations. How does org selection work?

**Options:**
- (a) Post-sign-in org selection step — user signs in, then selects/switches org
- (b) Org encoded in the sign-in URL — `POST /api/auth/signin { email, password, orgId }`
- (c) Separate session per org — each org gets its own JWT/refresh token pair

**Recommendation:** (a). Add a `POST /api/auth/switch-org { orgId }` endpoint that re-computes the access set for the new org and issues a fresh JWT with the new `tenantId`. This does not require re-authentication — the user's identity is already verified. The `role` field in the JWT is the **global platform role** (from the `users` table), independent of any org. Org-level roles are resolved via `role_assignments`.

### 18.6 Wallet Atomicity Across Instances (Discussion)

**Question:** With multiple server instances, how do we ensure wallet increments are atomic?

**Resolution:** Postgres `UPDATE ... WHERE consumed + amount <= limit RETURNING consumed` is atomic across connections. No application-level coordination needed. This is already specified in section 9.4.

---

## 19. E2E Acceptance Tests

### Authentication

```ts
describe('Authentication system', () => {
  // Email/password
  it('signs up with email/password, returns user + sets session cookie');
  it('signs in with correct credentials, returns user + sets session cookie');
  it('rejects sign-in with wrong password (INVALID_CREDENTIALS)');
  it('rate limits after 5 failed sign-in attempts (429)');
  it('rejects sign-up with existing email (USER_EXISTS)');
  it('validates password requirements (minLength)');

  // OAuth
  it('redirects to Google authorization URL with state + PKCE');
  it('exchanges OAuth code for tokens and creates user');
  it('auto-links OAuth to existing user when email matches');
  it('supports multiple OAuth providers per user');
  it('blocks unlinking the last auth method');

  // MFA
  it('generates TOTP secret and otpauth:// URI');
  it('enables MFA after verifying first TOTP code');
  it('requires MFA challenge after primary auth when MFA enabled');
  it('accepts valid backup code and marks it used');
  it('rate limits MFA challenge attempts');

  // Email verification
  it('sends verification email on sign-up when enabled');
  it('marks email as verified with valid token');
  it('rejects expired verification token');

  // Password reset
  it('returns 200 for forgot-password regardless of email existence');
  it('resets password with valid token, revokes all sessions');
  it('rejects expired reset token');
});
```

### Session Management

```ts
describe('Session management', () => {
  it('issues 60-second JWT + 7-day refresh token on sign-in');
  it('refreshes JWT with valid refresh token, rotates refresh token');
  it('rejects refresh with revoked refresh token (401)');
  it('revokes single session by ID');
  it('revokes all sessions for user on password change');
  it('lists active sessions with device info');
  it('SSR middleware validates JWT, falls back to DB on expiry');
  it('step-up auth: returns STEP_UP_REQUIRED when fva is stale');
  it('step-up auth: refreshes JWT with fva=0 after MFA');
});
```

### Access Control

```ts
describe('Access control system', () => {
  // RBAC
  it('ctx.can() returns true when user role grants entitlement');
  it('ctx.can() returns false when user lacks required role');
  it('ctx.authorize() throws AuthorizationError on denial');
  it('ctx.check() returns { allowed, reason, meta } with denial info');

  // Hierarchy
  it('org admin inherits team editor role via inheritance config');
  it('ctx.can() with resource checks closure table hierarchy');
  it('direct role assignment overrides inherited role');

  // Plans
  it('ctx.can() denies entitlement when org plan does not include it');
  it('check() returns plan_required with requiredPlans in meta');

  // Wallet
  it('canAndConsume() atomically checks and increments wallet');
  it('canAndConsume() returns false when limit reached');

  // Feature flags
  it('ctx.can() denies when required feature flag is disabled');
  it('check() returns flag_disabled reason');

  // Type safety
  it('invalid entitlement name is compile error (@ts-expect-error)');
  it('invalid role name in rules.role() is compile error (@ts-expect-error)');
  it('invalid column in rules.where() is compile error (@ts-expect-error)');
});
```

### Client-Side

```ts
describe('Client-side access', () => {
  it('can() returns allowed: true for entitled user (from access set)');
  it('can() returns denial reason + meta for plan-gated entitlement');
  it('can() with entity reads from __access metadata');
  it('can() memoizes by entitlement + entity.id');
  it('SSR renders with correct access checks (no hydration mismatch)');
  it('entity list response includes __access metadata per entity');
  it('WebSocket access:flag_toggled updates can() reactively');
  it('WebSocket access:role_changed triggers access set refetch');
});
```

### Security

```ts
describe('Security', () => {
  it('CSRF: rejects POST without Origin header in production');
  it('CSRF: rejects POST without X-VTZ-Request header in production');
  it('rate limiting: returns 429 after exceeding limits');
  it('no email enumeration: forgot-password returns 200 for unknown email');
  it('refresh token rotation: old token invalid after refresh');
  it('JWT secret: throws in production when missing');
  it('cookie Secure flag: throws in production when disabled');
});
```

---

## 20. Implementation Phases

### Phase 1: Foundation (Implemented)

Already built:
- `createAuth()` with JWT sessions
- Email/password with bcrypt
- CSRF protection (Origin + custom header)
- In-memory rate limiting
- `createAccess()` with flat RBAC
- `ctx.can()`, `ctx.authorize()`
- Auth routes, secure cookie defaults

### Phase 2: Dual-Token Sessions + DB Backend

- Replace 7-day JWT with 60-second JWT + 7-day refresh token (both configurable)
- `sessions` table with refresh token hashing
- Token rotation on refresh with 10-second grace period (multi-tab safety)
- Refresh token revocation check (`WHERE revoked_at IS NULL`)
- Session revocation API (revoke single, revoke all)
- Session listing (device management, paginated, max 50 active sessions per user)
- Pluggable rate limit store interface
- `POST /api/auth/switch-org` for multi-org users

**Integration test:** Sign in, verify 60s JWT. Wait 61s, API returns 401. Refresh succeeds with new JWT. Revoke session, refresh fails.

### Phase 3: OAuth Providers

- `OAuthProvider` interface
- Google, GitHub, Discord factory functions
- PKCE support (code_verifier/code_challenge)
- `oauth_accounts` table for account linking
- Auto-link by verified email
- OAuth state in HttpOnly cookie

**Integration test:** Initiate Google OAuth flow. Mock callback with code. Verify user created + session issued. Sign in again, verify account linked.

### Phase 4: MFA/TOTP

- TOTP secret generation (RFC 6238)
- MFA setup + verify routes
- MFA sign-in flow (mfaToken + challenge)
- Backup codes (hashed, single-use)
- Step-up auth (`fva` claim, `/mfa/step-up` route)
- `rules.fva()` builder

**Integration test:** Enable MFA. Sign in, receive mfaToken. Submit TOTP code, receive session. Access fva-gated endpoint, receive STEP_UP_REQUIRED. Complete step-up, access granted.

### Phase 5: Email Verification + Password Reset

- Email verification tokens (SHA-256 hashed, TTL)
- Password reset tokens
- `onSend` callback interface
- Rate limiting on verification/reset endpoints
- Auto-revoke sessions on password reset

**Integration test:** Sign up, receive verification callback. Verify email, confirm emailVerified=true. Request password reset, receive callback. Reset password, confirm old sessions revoked.

### Phase 6: Resource Hierarchy + `defineAccess()`

- Replace `createAccess()` with `defineAccess()` (breaking change — all existing consumers must migrate)
- Closure table migration generation
- Entity hooks for closure table maintenance
- Role inheritance across hierarchy levels
- `ctx.can()` with hierarchy resolution
- RLS policy generation

**Integration test:** Create Org -> Team -> Project. Assign user `admin` on Org. Verify user gets inherited `editor` on Team and `contributor` on Project. `ctx.can('project:edit', project)` returns true.

### Phase 7: Access Set Bootstrap + Client `can()`

- Access set computation at session start
- Access set embedded in JWT `acl` claim (with hydration fallback for large access sets)
- SSR serialization (`__VERTZ_ACCESS_SET__` with HTML escaping, request-scoped context)
- `can()` function in `@vertz/ui/auth` (getter-backed `AccessCheck`, `reactive-source` manifest)
- `AccessContext.Provider`
- `AuthGate` component (session loading guard)
- Reactivity manifest registration
- Entity `__access` metadata in responses (with `reasons` array)
- `can()` memoization (reactive to entity revalidation)

**Integration test:** Sign in, verify JWT contains `acl`. SSR renders with access-gated content. Client hydrates, `can()` reads from access set. Modify role via API, verify WebSocket triggers access set refresh.

### Phase 8: Plans & Wallet

- Plan definition in `defineAccess()`
- `org_plans` table with expiration + grace period
- Consumption wallet table with lazy initialization
- `canAndConsume()` atomic check + increment (with `amount` parameter)
- `unconsume()` for rollback after operation failure
- Per-customer overrides (additive only, `max(override, plan)`)
- Client-side plan/limit visibility
- `access:limit_updated` WebSocket fan-out from `canAndConsume()`

**Integration test:** Assign org to `free` plan with limit 5 projects/month. Create 5 projects via `canAndConsume()`. Sixth attempt returns false. Upgrade to `pro`, sixth attempt succeeds.

### Phase 9: Reactive Invalidation + Feature Flags

- Feature flag storage + toggle API
- WebSocket events for access changes (with JWT-authenticated upgrade handshake)
- WebSocket reconnection with exponential backoff + immediate access set refresh
- Jittered refetch for role/plan changes (scaled jitter by affected user count)
- Inline updates for flag/limit changes

**Integration test:** Client has `can('project:export')` returning false (flag disabled). Toggle flag via API. Verify WebSocket delivers `access:flag_toggled`. Verify `can()` reactively returns true.

### Phase 10: Compiler Integration

- Type generation from `defineAccess()` (`Entitlement`, `Role<T>`, `DenialReasonFor<E>`)
- `rules.where()` column type checking
- Closure table migration generation
- Entity hook generation for closure table
- RLS policy generation

**Integration test:** Define access with typed entitlements. Verify `@ts-expect-error` on invalid entitlement name. Verify `@ts-expect-error` on invalid role in `rules.role()`. Verify generated RLS policy matches expected SQL.

---

## Appendix A: Database Schema Summary

```sql
-- Users (developer provides, framework requires these columns)
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT NOT NULL UNIQUE,
  email_verified  BOOLEAN NOT NULL DEFAULT false,
  password_hash   TEXT,                    -- NULL if OAuth-only
  role            TEXT NOT NULL DEFAULT 'user',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sessions (refresh tokens)
CREATE TABLE sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_hash    TEXT NOT NULL UNIQUE,
  expires_at      TIMESTAMPTZ NOT NULL,
  revoked_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address      INET,
  user_agent      TEXT,
  device_name     TEXT
);

-- OAuth account links
CREATE TABLE oauth_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL,
  provider_id     TEXT NOT NULL,
  email           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider, provider_id)
);

-- MFA state
CREATE TABLE user_mfa (
  user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  totp_secret     TEXT,
  totp_enabled    BOOLEAN NOT NULL DEFAULT false,
  backup_codes    TEXT[],
  enabled_at      TIMESTAMPTZ,
  last_verified   TIMESTAMPTZ
);

-- Email verification tokens
CREATE TABLE email_verifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash      TEXT NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Password reset tokens
CREATE TABLE password_resets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash      TEXT NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Role assignments (RBAC)
CREATE TABLE role_assignments (
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resource_type   TEXT NOT NULL,
  resource_id     UUID NOT NULL,
  role            TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, resource_type, resource_id, role)
);

-- Resource hierarchy (closure table)
CREATE TABLE resource_closure (
  ancestor_type   TEXT NOT NULL,
  ancestor_id     UUID NOT NULL,
  descendant_type TEXT NOT NULL,
  descendant_id   UUID NOT NULL,
  depth           INT NOT NULL,
  PRIMARY KEY (ancestor_type, ancestor_id, descendant_type, descendant_id)
);

-- Org plans
CREATE TABLE org_plans (
  org_id          UUID PRIMARY KEY,
  plan_id         TEXT NOT NULL,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ,
  overrides       JSONB DEFAULT '{}',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Consumption wallet
CREATE TABLE consumption_wallet (
  org_id          UUID NOT NULL,
  entitlement     TEXT NOT NULL,
  period_start    TIMESTAMPTZ NOT NULL,
  period_end      TIMESTAMPTZ NOT NULL,
  consumed        BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, entitlement, period_start)
);
```

## Appendix B: Complete Route Table

| Route | Method | Auth Required | Description |
|-------|--------|--------------|-------------|
| `/api/auth/signup` | POST | No | Create account with email/password |
| `/api/auth/signin` | POST | No | Sign in with email/password |
| `/api/auth/signout` | POST | Session | Sign out (clear cookies, revoke session) |
| `/api/auth/session` | GET | Session | Get current session info |
| `/api/auth/refresh` | POST | Refresh cookie | Refresh JWT, rotate refresh token |
| `/api/auth/sessions` | GET | Session | List active sessions |
| `/api/auth/sessions/:id` | DELETE | Session | Revoke specific session |
| `/api/auth/sessions` | DELETE | Session | Revoke all other sessions |
| `/api/auth/oauth/:provider` | GET | No | Start OAuth flow |
| `/api/auth/oauth/:provider/callback` | GET | No | OAuth callback |
| `/api/auth/mfa/setup` | POST | Session | Start MFA setup |
| `/api/auth/mfa/verify-setup` | POST | Session | Verify and enable MFA |
| `/api/auth/mfa/challenge` | POST | MFA token | Submit MFA code during sign-in |
| `/api/auth/mfa/step-up` | POST | Session | Step-up MFA for sensitive actions |
| `/api/auth/mfa/disable` | POST | Session + re-auth + TOTP | Disable MFA (requires password + TOTP) |
| `/api/auth/mfa/backup-codes` | POST | Session + re-auth | Regenerate backup codes |
| `/api/auth/verify-email` | POST | No | Verify email with token |
| `/api/auth/resend-verification` | POST | Session | Resend verification email |
| `/api/auth/forgot-password` | POST | No | Request password reset |
| `/api/auth/reset-password` | POST | No | Reset password with token |
| `/api/auth/set-password` | POST | Session | Set password (for OAuth-only users) |
| `/api/auth/switch-org` | POST | Session | Switch active org, re-issue JWT with new tenantId |

## Appendix C: Cookie Summary

| Cookie | Value | HttpOnly | Secure | SameSite | Path | Max-Age | Purpose |
|--------|-------|----------|--------|----------|------|---------|---------|
| `vertz.sid` | JWT | Yes | Yes (prod) | Lax | `/` | 60s | Session identity + access set |
| `vertz.ref` | Opaque token | Yes | Yes (prod) | Lax | `/api/auth/refresh` | 7 days (configurable) | Session refresh |
| `vertz.oauth` | Encrypted (AES-256-GCM) state + PKCE + nonce | Yes | Yes (prod) | Lax | `/api/auth/oauth` | 5 min | OAuth flow state |

---

*This document supersedes `auth-module-spec.md`, `auth-phase2-spec.md`, `access-system.md`, and `access-system-client.md`. Those documents have been moved to `backstage/archive/` as historical reference.*
