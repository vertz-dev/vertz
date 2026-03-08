# Auth Module Phase 2 Specification

> **Status:** Draft for Implementation  
> **Date:** 2026-02-16  
> **Scope:** Phase 2 (OAuth, DB Sessions, MFA)

---

## Overview

Phase 2 builds on Phase 1's foundation (JWT sessions, email/password, RBAC) to add:

1. **OAuth Providers** — Google, GitHub, Discord as first-class providers
2. **DB-Backed Sessions** — Optional server-side session storage for revocation support
3. **MFA/2FA** — TOTP-based multi-factor authentication

---

## 1. OAuth Providers

### 1.1 Provider Plugin Pattern

OAuth providers use a plugin pattern that integrates with `createAuth()`:

```typescript
import { createAuth, google, github, discord } from '@vertz/server';

const auth = createAuth({
  session: { strategy: 'jwt', ttl: '7d' },
  emailPassword: { enabled: true },
  providers: [
    google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    github({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    }),
    discord({
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
    }),
  ],
});
```

### 1.2 Provider Interface

```typescript
interface OAuthProvider {
  /** Unique provider identifier */
  id: string;
  /** Display name */
  name: string;
  /** OAuth configuration */
  config: {
    clientId: string;
    clientSecret: string;
    /** Optional: Custom scopes (defaults provided) */
    scopes?: string[];
    /** Optional: Redirect URI override */
    redirectUri?: string;
  };
  /** Build authorization URL */
  getAuthorizationUrl(state: string): string;
  /** Exchange code for tokens */
  exchangeCode(code: string): Promise<OAuthTokens>;
  /** Get user info from provider */
  getUserInfo(accessToken: string): Promise<OAuthUserInfo>;
}

interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType: string;
}

interface OAuthUserInfo {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
  provider: string;
}
```

### 1.3 Provider Factories

Each provider is a factory function that returns an `OAuthProvider`:

```typescript
// google.ts
export function google(config: GoogleConfig): OAuthProvider {
  return {
    id: 'google',
    name: 'Google',
    config: {
      scopes: ['openid', 'email', 'profile'],
      ...config,
    },
    getAuthorizationUrl(state: string) { /* ... */ },
    async exchangeCode(code: string) { /* ... */ },
    async getUserInfo(accessToken: string) { /* ... */ },
  };
}

// github.ts - uses GitHub OAuth
// discord.ts - uses Discord OAuth
```

### 1.4 OAuth Flow

```
1. Client redirects to /api/auth/oauth/{provider}
2. Server redirects to provider's authorization URL
3. User authorizes on provider
4. Provider redirects back to /api/auth/oauth/{provider}/callback?code=xxx&state=xxx
5. Server exchanges code for tokens
6. Server gets user info from provider
7. Server creates/links user in DB
8. Server creates session (JWT)
9. Server redirects to app with session cookie
```

### 1.5 HTTP Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/auth/oauth/{provider}` | GET | Start OAuth flow (redirects to provider) |
| `/api/auth/oauth/{provider}/callback` | GET | OAuth callback handler |

### 1.6 Provider-Specific Notes

#### Google
- Scopes: `openid`, `email`, `profile`
- Userinfo endpoint: `https://www.googleapis.com/oauth2/v3/userinfo`
- Token endpoint: `https://oauth2.googleapis.com/token`

#### GitHub
- Scopes: `read:user`, `user:email`
- User endpoint: `https://api.github.com/user`
- Email endpoint: `https://api.github.com/user/emails`

#### Discord
- Scopes: `identify`, `email`
- User endpoint: `https://discord.com/api/users/@me`
- Avatar URL format: `https://cdn.discordapp.com/avatars/{id}/{avatar}.png`

---

## 2. DB-Backed Sessions

### 2.1 Session Storage

Phase 1 uses in-memory session storage. Phase 2 adds optional database-backed sessions:

```typescript
const auth = createAuth({
  session: {
    strategy: 'database', // or 'hybrid'
    ttl: '7d',
    // Database table configuration
    table: db.sessions, // Optional: use existing table
  },
  // On Vertz Cloud: zero-config
  // On self-hosted: opt-in
});
```

### 2.2 Session Table Schema

```typescript
// sessions table
interface SessionRecord {
  id: string;           // Primary key (JWT jti)
  userId: string;      // FK to users
  token: string;       // Hashed JWT (for revocation lookup)
  expiresAt: Date;
  createdAt: Date;
  lastAccessedAt: Date;
  ipAddress?: string;
  userAgent?: string;
  // For hybrid strategy
  isRevoked?: boolean;
}
```

### 2.3 Session Strategies

| Strategy | Behavior | Use Case |
|----------|----------|----------|
| `jwt` | Stateless, no DB lookup | High-scale, serverless |
| `database` | Server-side sessions, fully revokable | Need session invalidation |
| `hybrid` | JWT for speed + DB for revocation check | Balanced (default on Cloud) |

### 2.4 Hybrid Strategy (Default on Cloud)

1. Validate JWT normally (fast path)
2. Check if token is in revocation table
3. If revoked: treat as unauthenticated
4. Optional: Update last accessed timestamp periodically

```typescript
// Hybrid session validation
async function validateSessionHybrid(token: string, payload: SessionPayload): Promise<Session | null> {
  // 1. JWT already validated
  // 2. Check revocation
  const revoked = await db.sessions.findFirst({
    where: { token: hashToken(token), isRevoked: true },
  });
  if (revoked) return null;
  
  // 3. Return session (or update lastAccessed)
  return { /* session data */ };
}
```

### 2.5 Session Revocation API

```typescript
// Server-side API
auth.api.revokeSession(sessionId: string): Promise<Result<void>>;
auth.api.revokeAllSessions(userId: string): Promise<Result<void>>;
auth.api.listSessions(userId: string): Promise<Result<Session[]>>;
```

---

## 3. MFA/2FA (TOTP)

### 3.1 Overview

TOTP-based MFA using standard authenticator apps (Google Authenticator, Authy, etc.):

```typescript
const auth = createAuth({
  session: { strategy: 'jwt', ttl: '7d' },
  emailPassword: { enabled: true },
  mfa: {
    totp: {
      enabled: true,
      issuer: 'Vertz', // App name in authenticator
    },
    // Optional: backup codes
    backupCodes: {
      enabled: true,
      count: 10, // Number of backup codes
    },
  },
});
```

### 3.2 TOTP Setup Flow

```
1. User enables MFA in settings
2. Server generates secret (TOTP secret)
3. Server provides QR code (otpauth:// URL)
4. User scans with authenticator app
5. User verifies with initial code
6. Server enables MFA for user
```

### 3.3 MFA User Flow

```
Sign In:
1. User provides email/password
2. Server validates credentials
3. If MFA enabled → prompt for MFA code
4. User enters TOTP code
5. Server validates code
6. If valid → create session
```

### 3.4 TOTP Implementation

```typescript
// TOTP provider (using otplib)
import { authenticator } from 'otplib';

// Generate secret for user
function generateTOTPSecret(user: AuthUser): string {
  return authenticator.generateSecret();
}

// Generate QR code URL (for authenticator app)
function generateTOTPAuthUrl(user: AuthUser, secret: string, issuer: string): string {
  return authenticator.keyuri(user.email, issuer, secret);
}

// Validate TOTP code
function validateTOTP(secret: string, code: string): boolean {
  return authenticator.verify({ token: code, secret });
}
```

### 3.5 MFA Configuration Types

```typescript
interface MFAConfig {
  totp: {
    enabled: boolean;
    issuer?: string; // Default: 'Vertz'
  };
  backupCodes?: {
    enabled: boolean;
    count?: number; // Default: 10
  };
}

interface MFAUserState {
  userId: string;
  totpSecret?: string;
  backupCodes?: string[]; // Hashed codes
  mfaEnabled: boolean;
  mfaVerifiedAt?: Date;
}
```

### 3.6 MFA API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/auth/mfa/setup` | POST | Initialize MFA setup (returns secret) |
| `/api/auth/mfa/verify` | POST | Verify and enable MFA |
| `/api/auth/mfa/disable` | POST | Disable MFA |
| `/api/auth/mfa/backup-codes` | GET | Get backup codes (once) |

### 3.7 Sign In with MFA

```typescript
// Modified sign-in flow
async function signIn(data: SignInInput): Promise<AuthResult<Session>> {
  // 1. Validate credentials
  const user = await validateCredentials(data);
  if (!user) return error('INVALID_CREDENTIALS');

  // 2. Check if MFA enabled
  if (user.mfaEnabled) {
    // Return partial session requiring MFA
    return { 
      ok: true, 
      data: { 
        requiresMfa: true, 
        mfaToken: createMFAToken(user.id),
      } 
    };
  }

  // 3. Normal sign in
  return createSession(user);
}

// New MFA verification endpoint
async function verifyMFA(mfaToken: string, code: string): Promise<AuthResult<Session>> {
  const userId = verifyMFAToken(mfaToken);
  const user = await getUser(userId);
  
  // Check TOTP or backup code
  const valid = validateTOTP(user.totpSecret, code) || 
                validateBackupCode(user.backupCodes, code);
  
  if (!valid) return error('INVALID_MFA_CODE');
  
  return createSession(user);
}
```

---

## 4. Integration with createServer()

### 4.1 Full Configuration Example

```typescript
import { createServer, createAuth, createAccess, google, github, discord } from '@vertz/server';
import { db } from './db';

const server = createServer({
  auth: createAuth({
    // Session configuration
    session: {
      strategy: 'hybrid', // 'jwt' | 'database' | 'hybrid'
      ttl: '7d',
      cookie: {
        name: 'vertz.sid',
        secure: true,
        sameSite: 'lax',
      },
    },
    
    // Email/password (Phase 1)
    emailPassword: {
      enabled: true,
      password: { minLength: 8 },
      rateLimit: { window: '15m', maxAttempts: 5 },
    },
    
    // OAuth providers (Phase 2)
    providers: [
      google({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      }),
      github({
        clientId: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
      }),
      discord({
        clientId: process.env.DISCORD_CLIENT_ID,
        clientSecret: process.env.DISCORD_CLIENT_SECRET,
      }),
    ],
    
    // MFA (Phase 2)
    mfa: {
      totp: { enabled: true, issuer: 'Vertz' },
      backupCodes: { enabled: true },
    },
    
    // Custom claims
    claims: (user) => ({ plan: user.plan }),
  }),
  
  // Access control (Phase 1)
  access: createAccess({
    roles: {
      user: { entitlements: ['read', 'create'] },
      editor: { entitlements: ['read', 'create', 'update'] },
      admin: { entitlements: ['read', 'create', 'update', 'delete'] },
    },
    entitlements: { /* ... */ },
  }),
  
  domains: [User, Project, Task],
});
```

### 4.2 Auth Instance

```typescript
interface AuthInstance {
  /** HTTP handler for all auth routes */
  handler: RequestHandler;
  
  /** Server-side API */
  api: {
    // Phase 1
    signUp: (data: SignUpInput) => Promise<AuthResult<Session>>;
    signIn: (data: SignInInput) => Promise<AuthResult<Session>>;
    signOut: (ctx: Context) => Promise<AuthResult<void>>;
    getSession: (headers: Headers) => Promise<AuthResult<Session | null>>;
    refreshSession: (ctx: Context) => Promise<AuthResult<Session>>;
    
    // Phase 2 - Sessions
    revokeSession: (sessionId: string) => Promise<AuthResult<void>>;
    revokeAllSessions: (userId: string) => Promise<AuthResult<void>>;
    listSessions: (userId: string) => Promise<AuthResult<Session[]>>;
    
    // Phase 2 - MFA
    setupMFA: (userId: string) => Promise<AuthResult<MFASetup>>;
    verifyMFA: (userId: string, code: string) => Promise<AuthResult<void>>;
    disableMFA: (userId: string) => Promise<AuthResult<void>>;
  };
  
  /** Session middleware that injects ctx.user */
  middleware: () => Middleware;
  
  /** Initialize auth (create tables, etc.) */
  initialize: () => Promise<void>;
}
```

---

## 5. Security Considerations

### 5.1 OAuth Security

- **State parameter** — Required to prevent CSRF, generated per flow
- **PKCE** — Recommended for public clients (not implemented in Phase 2)
- **Token storage** — Access tokens not stored; only used for user info fetch
- **Redirect URIs** — Must be validated against registered URLs

### 5.2 MFA Security

- **Secret storage** — TOTP secrets stored encrypted at rest
- **Rate limiting** — Limit MFA verification attempts (5 per 15min)
- **Backup codes** — One-time use, hashed storage, shown once then never again
- **Trusted devices** — Not implemented in Phase 2 (defer)

### 5.3 Session Security

- **Token hashing** — Store hashed tokens in DB for revocation lookups
- **Rotation** — New JWT on refresh, old tokens remain valid until expiry
- **Revocation** — On password change, optionally revoke all sessions

---

## 6. Phase 2 Scope

### 6.1 Shipping in Phase 2

| Feature | Status |
|---------|--------|
| OAuth providers (Google, GitHub, Discord) | ✅ |
| Provider plugin pattern | ✅ |
| DB-backed sessions (optional) | ✅ |
| Hybrid session strategy | ✅ |
| Session revocation API | ✅ |
| MFA (TOTP) | ✅ |
| Backup codes | ✅ |

### 6.2 Deferred to Phase 3

- OAuth provider plugins (additional providers)
- WebAuthn/Passkeys
- Trusted devices
- Session persistence across devices
- Account recovery flows

---

## 7. Implementation Notes

### 7.1 TDD Approach

1. Write tests first for OAuth providers
2. Implement provider interface and factories
3. Add database session tests
4. Implement session storage
5. Add MFA tests
6. Implement TOTP logic

### 7.2 Error Handling

All public APIs use Result type for errors:

```typescript
type AuthResult<T> = 
  | { ok: true; data: T }
  | { ok: false; error: AuthError };

interface AuthError {
  code: string;
  message: string;
  status: number;
}
```

### 7.3 Backward Compatibility

- Phase 1 configurations continue to work unchanged
- New fields (providers, mfa) are optional
- Default session strategy remains `jwt` for self-hosted
- Cloud defaults to `hybrid` automatically

---

## 8. Testing Strategy

### 8.1 OAuth Tests

- Provider factory returns correct config
- Authorization URL generation
- Token exchange (mocked)
- User info mapping
- Error handling for invalid codes

### 8.2 Session Tests

- Database session creation/retrieval
- Session revocation
- Hybrid validation flow
- Concurrent session handling

### 8.3 MFA Tests

- TOTP secret generation
- QR code URL generation
- Code validation
- Backup code generation and validation
- MFA-enabled sign-in flow
