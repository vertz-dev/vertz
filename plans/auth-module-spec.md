# Auth Module Phase 1 Specification

> **Status:** Draft for CTO Review  
> **Date:** 2026-02-15  
> **Scope:** Phase 1 (v0.x)

---

## 1. API Surface — `createAuth()`

### 1.1 Function Signature

```typescript
function createAuth(config: AuthConfig): AuthInstance

interface AuthConfig {
  // Session strategy
  session: {
    strategy: 'jwt' | 'database' | 'hybrid'
    ttl: Duration
    refreshable?: boolean
    cookie?: CookieConfig
  }

  // Authentication methods
  emailPassword?: EmailPasswordConfig
  oauth?: OAuthProviders
  mfa?: MFAConfig
}

interface AuthInstance {
  // HTTP handler for auth routes
  handler: RequestHandler
  
  // Server-side API
  api: {
    signUp: (data: SignUpInput) => Promise<Result<Session>>
    signIn: (data: SignInInput) => Promise<Result<Session>>
    signOut: (ctx: Context) => Promise<Result<void>>
    getSession: (headers: Headers) => Promise<Result<Session>>
    refreshSession: (ctx: Context) => Promise<Result<Session>>
  }
}
```

### 1.2 Integration with `createServer()`

```typescript
// Option A: Plugin-style (recommended)
const server = createServer({
  auth: createAuth({
    session: { strategy: 'jwt', ttl: '7d' },
    emailPassword: { enabled: true },
  }),
  domains: [User, Project, Task],
})

// Auth routes auto-mounted at /api/auth/*
// ctx.user available in all domain handlers
```

**Decision needed:** Plugin-style (Option A) or middleware function (Option B)?

### 1.3 Session Strategies

| Strategy | Description | Best for |
|----------|-------------|----------|
| `jwt` | Stateless JWT in cookie. No DB lookup on requests. | High-scale, serverless |
| `database` | Server-side sessions in DB. Revokable. | Need session invalidation |
| `hybrid` | JWT for speed + database for revocation check | Balanced |

**Phase 1:** JWT default. Database sessions deferred.

### 1.4 Email/Password

```typescript
emailPassword: {
  enabled: true,
  // Password requirements (defaults shown)
  password: {
    minLength: 8,
    requireUppercase: false,
    requireNumbers: false,
    requireSymbols: false,
    // bcrypt cost: 12 default
  },
  // Rate limiting
  rateLimit: {
    window: '15m',
    maxAttempts: 5,
  },
}
```

### 1.5 OAuth (Phase 2+)

```typescript
// Deferred to Phase 2
oauth: {
  google: { clientId, clientSecret },
  github: { clientId, clientSecret },
  // 35+ providers available via better-auth adapter
}
```

### 1.6 MFA (Phase 2+)

```typescript
// Deferred to Phase 2
mfa: {
  totp: { enabled: true },
  backupCodes: { enabled: true },
}
```

---

## 2. `ctx.can()` Design

### 2.1 Core API

```typescript
interface AccessContext {
  // Single check
  can(entitlement: Entitlement): Promise<boolean>
  can(entitlement: Entitlement, resource: Resource): Promise<boolean>
  
  // Throws on denial
  authorize(entitlement: Entitlement, resource?: Resource): Promise<void>
  
  // Bulk check
  canAll(checks: Array<{ entitlement: Entitlement; resource?: Resource }>): Promise<Map<string, boolean>>
}
```

### 2.2 Resolution Order (Phase 1: RBAC only)

```
Phase 1: ctx.can() → Role check only
  ├── Feature flags (stub, always returns true)
  ├── Role → entitlement mapping
  └── Plan/wallet checks (stub, always returns true)

Phase 2+: Full resolution
  ├── Feature flag check
  ├── RBAC (role → entitlement)
  ├── Hierarchy (closure table)
  ├── Plan check
  └── Wallet consumption
```

### 2.3 Entitlements & Roles (Phase 1)

```typescript
// Defined via createAccess() - separate from auth
const access = createAccess({
  // Phase 1: flat roles only (no hierarchy)
  roles: {
    user: ['read', 'create'],
    editor: ['read', 'create', 'update'],
    admin: ['read', 'create', 'update', 'delete'],
  },
  entitlements: {
    'user:read':   { roles: ['user', 'editor', 'admin'] },
    'user:create': { roles: ['user', 'editor', 'admin'] },
    'user:update': { roles: ['editor', 'admin'] },
    'user:delete': { roles: ['admin'] },
  },
})
```

### 2.4 Phase 1 Limitations

- **No hierarchy:** Resource-scoped checks ignore parent chain
- **No plans:** Plan checks always pass
- **No wallet:** Usage limits not enforced
- **No feature flags:** All return true
- **No relationships:** ReBAC not implemented

---

## 3. Integration with Domains

### 3.1 Domain Access Rules

```typescript
const User = domain('users', {
  type: 'persisted',
  table: userEntry,
  
  access: {
    read: (user, ctx) => ctx.can('user:read'),
    create: (_, ctx) => ctx.can('user:create'),
    update: (user, ctx) => {
      // Self-edit allowed, admins can edit anyone
      return user.id === ctx.user.id || ctx.can('user:update')
    },
    delete: (_, ctx) => ctx.can('user:delete'),
  },
})
```

### 3.2 Role Assignment

```typescript
// Admin action to assign roles
const assignRole = action('assignRole', {
  input: v.object({
    userId: v.uuid(),
    role: v.enum(['user', 'editor', 'admin']),
  }),
  handler: async (input, ctx) => {
    await ctx.db.roleAssignments.create({
      userId: input.userId,
      role: input.role,
    })
    // Invalidate user's access cache
    await invalidateAccessCache(input.userId)
    return { ok: true }
  },
})
```

---

## 4. Phase 1 Scope

### 4.1 Shipping in Phase 1

| Feature | Status |
|---------|--------|
| `createAuth()` with JWT sessions | ✅ |
| Email/password with bcrypt | ✅ |
| `ctx.can()` role-based checks | ✅ |
| Domain access rules | ✅ |
| Role assignment via action | ✅ |
| Session middleware (ctx.user) | ✅ |
| Basic rate limiting | ✅ |
| Secure cookie defaults | ✅ |

### 4.2 Deferred to Phase 2

- OAuth providers (Google, GitHub, etc.)
- Resource hierarchy (closure table)
- Relationship-based access (ReBAC)
- MFA (TOTP, backup codes)
- Database sessions with revocation

### 4.3 Deferred to Phase 3

- Plans & billing integration
- Usage limits (wallet)
- Feature flags
- API keys

---

## 5. Security Defaults

### 5.1 What's Enabled by Default

| Security Feature | Default | Configurable |
|-----------------|---------|--------------|
| Password hashing | bcrypt (cost 12) | Yes |
| CSRF protection | Enabled | No (Zeroth Law) |
| Rate limiting | 5 attempts / 15min | Yes |
| Secure cookies | HttpOnly + Secure + SameSite=Lax | Yes (not recommended) |
| Session expiry | 7 days | Yes |
| JWT signing | HS256 | Yes (RS256 available) |

### 5.2 CSRF Protection

```typescript
// Always enabled in Phase 1
// Uses origin header + fetch metadata
// Cannot be disabled (Zeroth Law)
```

### 5.3 Rate Limiting

```typescript
// Built-in rate limiter on auth endpoints
rateLimit: {
  signIn: { window: '15m', max: 5 },
  signUp: { window: '1h', max: 3 },
  refresh: { window: '1m', max: 10 },
}
```

### 5.4 Password Requirements

```typescript
// Minimum bar for Phase 1
password: {
  minLength: 8,
  // Other requirements opt-in to avoid friction
}
```

---

## 6. Comparison

### 6.1 vs BetterAuth

| Aspect | BetterAuth | Vertz (Phase 1) |
|--------|------------|-----------------|
| Auth methods | 35+ OAuth, 2FA, passkeys | Email/password only |
| Authorization | Org-scoped only | First-class RBAC + hierarchy (Phase 2+) |
| Type safety | Excellent (`$Infer`) | Entity-integrated types |
| Plugin system | Best-in-class | Simpler module approach |
| Multi-tenancy | Org plugin | Built-in (via entity system) |
| Database | Adapter-based | Native (owns the DB) |
| Session | Cookie/JWT/hybrid | JWT default |

**Vertz advantage:** Built-in authorization that integrates with the entity system. BetterAuth punts on this.

### 6.2 vs NextAuth (Auth.js)

| Aspect | NextAuth | Vertz (Phase 1) |
|--------|----------|-----------------|
| Auth focus | OAuth-first | Email/password + RBAC |
| Authorization | Middleware-based | First-class `ctx.can()` |
| Type safety | Partial | Full stack |
| Session | JWT | JWT (same) |

### 6.3 vs Lucia

| Aspect | Lucia | Vertz (Phase 1) |
|--------|-------|-----------------|
| Philosophy | Minimal, flexible | Integrated |
| Authorization | DIY | Built-in |
| Database | Adapter-based | Native |

---

## 7. Open Questions for CTO

1. **Session strategy default:** `jwt` or `database`? (Recommend `jwt` for v1 simplicity)

2. **Auth integration pattern:** Plugin in `createServer()` or middleware function?
   - Plugin: `createServer({ auth: createAuth(...) })`
   - Middleware: `createServer({ middleware: [authMiddleware()] })`

3. **Role storage:** In user table or separate table?
   - Option A: `user.role` field
   - Option B: `role_assignments` table (enables per-resource roles in Phase 2)

4. **Migration path:** Should we support BetterAuth adapter for existing apps?

---

## 8. Next Steps

- [ ] CTO approval on this spec
- [ ] Decide open questions above
- [ ] Begin implementation of `createAuth()`
- [ ] Design `createAccess()` for Phase 1 RBAC
- [ ] Implement domain access rules integration
