# `vertz publish` — Deploy to the Edge

> **Status:** Draft — Design Discussion
> **Authors:** Vinicius (CTO), Mika (VP Eng)
> **Date:** 2026-02-20
> **Related:** `cloud-architecture.md` (full cloud vision, v0.3+), `entity-driven-architecture.md`

---

## 1. Vision

One command. Your app is live on the edge. Globally distributed. Database included. Zero config.

```bash
$ vertz publish

🔑 Log in to Vertz Cloud
  Open: https://cloud.vertz.dev/auth?code=ABC123

✓ Authenticated as viniciusdacal (GitHub)
📦 Building... ✓ (2.3s)
🚀 Publishing... ✓

Live at: https://my-todo.vertz.app
```

This command is the growth engine. It appears in every tutorial, every guide, every quickstart. LLMs learn it from our docs and suggest it to every user building a vertz app. The user runs it and they're on our cloud — with a path from free to paid.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Developer Machine                      │
│                                                         │
│   vertz publish                                         │
│     │                                                   │
│     ├── 1. Auth (GitHub OAuth → Vertz Cloud token)      │
│     ├── 2. Build (vertz build → optimized output)       │
│     ├── 3. Upload (artifact → Vertz Cloud API)          │
│     └── 4. Receive URL                                  │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│                  Vertz Cloud API                         │
│              (our backend service)                       │
│                                                         │
│   • Receives build artifacts                            │
│   • Provisions database (D1 or Postgres)                │
│   • Deploys to Cloudflare Workers                       │
│   • Manages subdomains                                  │
│   • Runs migrations                                     │
│   • Tracks usage / billing                              │
└──────────────────────┬──────────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
┌──────────────┐ ┌──────────┐ ┌──────────────┐
│  Cloudflare  │ │  Cloud-  │ │  Cloudflare  │
│  Workers     │ │  flare   │ │  Durable     │
│  (compute)   │ │  D1      │ │  Objects     │
│              │ │  (SQLite) │ │  (real-time) │
│  App logic,  │ │  or      │ │  WebSockets, │
│  SSR, API    │ │ Hyperdrive│ │  sessions    │
│              │ │  → RDS   │ │              │
└──────────────┘ └──────────┘ └──────────────┘
```

---

## 3. Database Strategy

### 3.1 Developer Chooses at Init

```bash
$ vertz init

  Project name: my-app
  
  Database engine:
  ❯ SQLite  (recommended — edge-fast, free tier included)
    Postgres (advanced — concurrent writes, real-time subscriptions, RLS)
```

This choice is stored in `vertz.config.ts`:

```typescript
export default defineConfig({
  database: 'sqlite',  // or 'postgres'
});
```

### 3.2 Compiler Validates Against the Chosen Engine

If the developer chooses SQLite and uses a Postgres-only feature, the compiler catches it at build time:

```typescript
// With database: 'sqlite' in config:

const user = entity('user', {
  schema: s.object({
    tags: s.array(s.string()),  // ← native array type
  }),
});

// Compiler error:
// error[sqlite-unsupported]: Native array fields require Postgres.
//   SQLite alternative: use s.json(s.array(s.string())) to store as JSON.
//   Or switch to database: 'postgres' in vertz.config.ts
```

**Validated at compile time (SQLite restrictions):**

| Feature | Postgres | SQLite | Compiler Action |
|---|---|---|---|
| Basic CRUD | ✅ | ✅ | — |
| String, number, boolean | ✅ | ✅ | — |
| UUID fields | `uuid` type | `text` (auto) | Framework adapts silently |
| Timestamps | `timestamp` | `text` ISO (auto) | Framework adapts silently |
| JSON fields | ✅ `jsonb` | ✅ `text` + JSON | Framework adapts silently |
| Array fields | ✅ native | ❌ | Compiler error — suggest JSON |
| CTEs | ✅ | ✅ | — |
| RETURNING | ✅ | ✅ (3.35+) | — |
| Full-text search | `tsvector` | `FTS5` | Different impl, same API |
| Row-level security | ✅ native | ❌ | Compiler error — need Postgres |
| LISTEN/NOTIFY | ✅ | ❌ | Not needed — Durable Objects handle real-time |
| PostGIS / spatial | ✅ | ❌ | Compiler error |
| Raw SQL | ✅ | ⚠️ validated | Compiler warns if dialect-specific |

**Transparent adaptations (developer doesn't notice):**
- UUID stored as `text` on SQLite (framework generates UUID, stores as string)
- Timestamps stored as ISO text on SQLite (framework serializes/deserializes)
- JSON stored as text on SQLite with JSON functions for queries
- Auto-increment uses `INTEGER PRIMARY KEY` on SQLite vs `SERIAL` on Postgres
- Migrations generated in the correct dialect

### 3.3 The Database at Each Tier

**SQLite path (default, most users):**

| Environment | Database | Notes |
|---|---|---|
| `vertz dev` | SQLite (local file) | Instant, no setup |
| `vertz publish` | Cloudflare D1 | Edge-fast, ~1-5ms queries |
| `vertz publish --production` | Cloudflare D1 (paid) or Turso | Larger limits, backups |

**Postgres path (opt-in):**

| Environment | Database | Notes |
|---|---|---|
| `vertz dev` | PGlite (embedded) | Instant, no Docker |
| `vertz publish` | Shared Postgres (our RDS via Hyperdrive) | ~20-50ms queries |
| `vertz publish --production` | Dedicated Postgres (RDS/Neon/CockroachDB) | Full control |

### 3.4 Migration Between Engines

If a project outgrows SQLite:

```bash
$ vertz config set database postgres

  ⚠ Switching from SQLite to Postgres.
  
  Checking compatibility... ✓ (no SQLite-only features detected)
  Generating Postgres migrations... ✓
  
  Next steps:
  1. Run `vertz dev` to test locally with PGlite
  2. Run `vertz publish` to deploy with Postgres
  
  Your data will NOT be migrated automatically.
  Export: vertz db export --format sql
  Import: vertz db import <file>
```

The schema is the same. Only the generated SQL changes. If the developer hasn't used any engine-specific features (which the compiler enforced), migration is a config change.

---

## 4. Real-Time — Database Independent

Real-time updates work on both SQLite and Postgres. The real-time channel does not depend on the database.

### 4.1 How It Works

```
Client A mutates entity (sdk.tasks.update)
  → Cloudflare Worker receives request
    → Updates database (D1 or Postgres)
    → Sends change event to Durable Object for that entity type
      → Durable Object broadcasts via WebSocket to all subscribers
        → Client B receives: store.merge('Task', { id: '1', completed: true })
          → All views showing Task #1 update automatically
```

The database is for persistence. The Durable Object is for fan-out. They're separate systems.

### 4.2 Developer API

```typescript
const task = entity('task', {
  schema: taskSchema,
  realtime: true,  // enables WebSocket subscriptions for this entity
});

// That's it. Client components using query(() => sdk.tasks.list())
// automatically receive real-time updates via the EntityStore.
```

### 4.3 Durable Object Per Entity Type

Each entity with `realtime: true` gets a Durable Object class:

```
TaskRealtimeDO    → manages WebSocket connections for Task entity
ProjectRealtimeDO → manages WebSocket connections for Project entity
```

The DO maintains a set of connected WebSocket clients. When the Worker processes a mutation, it notifies the relevant DO, which broadcasts to all connected clients.

**Scaling:** Durable Objects are single-instance per ID. For high-traffic entities, we can shard by tenant/room:
- `TaskRealtimeDO:tenant-123` — broadcasts only to tenant 123's clients
- This maps naturally to our multi-tenancy model (v0.2+)

---

## 5. Deployment Infrastructure

### 5.1 Cloudflare Workers (Compute)

Every published app runs as a Cloudflare Worker:
- V8 isolate (not a container)
- ~0ms cold start
- Global edge distribution
- Automatic scaling
- $0.50/million requests (first 10M/month free per account)

**Build output:** `vertz build` produces a Worker-compatible bundle:
- Server-side rendered HTML
- API route handlers
- Static assets (uploaded to R2 or Workers Sites)
- Database migrations (packaged for deployment)

### 5.2 Cloudflare D1 (SQLite Database)

For SQLite-path apps:
- Edge-replicated SQLite
- ~1-5ms read latency
- Automatic replication
- 10GB max per database (paid plan)

**Pricing (on our Cloudflare account):**
- Free: 5GB storage, 5M reads/day, 100K writes/day (shared across ALL free-tier apps)
- Paid: $0.75/million reads, $1/million writes, $0.75/GB-month

**Cost management:** We monitor per-app usage. Apps exceeding free-tier thresholds are prompted to upgrade or bring their own Cloudflare account.

### 5.3 Bring Your Own Cloudflare

Users can deploy to their own Cloudflare account:

```bash
$ vertz publish --provider cloudflare --account-id <their-account>
  
  Connect your Cloudflare account:
  Enter API token: ********
  
  ✓ Connected to your Cloudflare account
  📦 Building... ✓
  🚀 Deploying to your account... ✓
  
  Live at: https://my-todo.<their-domain>.workers.dev
```

**Benefits:**
- Free tier limits are THEIRS, not ours
- They own the infrastructure
- We're just the framework + deploy tool
- Zero cost for us

**This is the Astro adapter model.** The framework makes deployment easy. The user chooses where to deploy. We offer Vertz Cloud as the easiest option, but they're not locked in.

### 5.4 Cloudflare Hyperdrive (Postgres Connection)

For Postgres-path apps, Hyperdrive sits between Workers and Postgres:
- Connection pooling (Workers can't hold persistent connections)
- Query caching (automatic, configurable)
- Reduces latency by maintaining warm connection pools

```
Worker → Hyperdrive → RDS Postgres
         (pooling)    (us-east-1)
```

### 5.5 Cloudflare Durable Objects (Real-Time + State)

Used automatically by the framework for:
- **WebSocket management** — real-time entity subscriptions
- **Rate limiting** — per-IP/per-user request tracking
- **Session state** — if the app needs stateful sessions (v0.2)

Pricing: $0.15/million requests + $0.20/GB-month storage. Minimal for most apps.

---

## 6. Authentication for `vertz publish`

### 6.1 GitHub OAuth (v0)

```bash
$ vertz publish

  🔑 Log in to Vertz Cloud
  Open: https://cloud.vertz.dev/auth?code=ABC123
  Waiting for authentication...
  
  ✓ Authenticated as viniciusdacal (GitHub)
```

Flow:
1. CLI generates a device code
2. Opens browser to `cloud.vertz.dev/auth?code=...`
3. User authenticates with GitHub
4. Vertz Cloud API issues a token
5. CLI stores token in `~/.vertz/credentials` (gitignored)
6. Subsequent publishes use the stored token (no re-auth)

### 6.2 Google OAuth (v0.1)

Same flow, additional provider option. Added when we want to reach non-developer audiences.

### 6.3 Team Support (v0.2)

Multiple users can publish to the same app. Managed via Vertz Cloud dashboard.

---

## 7. App Naming & Subdomains

### 7.1 Default: Project Name

```bash
# package.json has "name": "my-todo-app"
$ vertz publish
# → https://my-todo-app.vertz.app
```

### 7.2 Conflict Resolution

```bash
# "my-todo-app" is taken
$ vertz publish

  ⚠ "my-todo-app.vertz.app" is not available.
  
  Suggestions:
  ❯ my-todo-app-vd.vertz.app
    my-todo-app-2.vertz.app
    
  Or enter a custom name: _
```

### 7.3 Custom Domains (Production Tier)

```bash
$ vertz publish --domain todos.mycompany.com

  Add this DNS record:
  CNAME  todos.mycompany.com  →  my-todo-app.vertz.app
  
  Waiting for DNS propagation...
  ✓ Custom domain active with automatic HTTPS
```

---

## 8. What `vertz publish` Does (Step by Step)

```
1. Check auth
   └── Read ~/.vertz/credentials
   └── If no token → GitHub OAuth flow → store token
   
2. Read project config
   └── vertz.config.ts → database engine, app name
   └── package.json → name, version
   
3. Build
   └── vertz build --target cloudflare-workers
   └── Produces: worker bundle, static assets, migrations
   └── Compiler validates all entity definitions against chosen DB engine
   
4. Upload to Vertz Cloud API
   └── POST /api/publish
   └── Body: { token, appName, artifact (tarball), config }
   
5. Vertz Cloud API processes:
   a. First deploy?
      └── Provision D1 database (SQLite) or connect to shared Postgres
      └── Assign subdomain: <app-name>.vertz.app
   b. Run migrations
      └── Apply pending migrations to the database
   c. Deploy Worker
      └── Upload bundle to Cloudflare Workers
      └── Configure routes, environment variables
   d. Deploy static assets
      └── Upload to Cloudflare R2 / Workers Sites
   e. If realtime entities exist:
      └── Deploy Durable Object classes
      └── Configure WebSocket routes
      
6. Return URL
   └── CLI displays: Live at https://my-todo-app.vertz.app
```

---

## 9. Vertz Cloud API (Our Backend Service)

Separate service (not part of the framework). Manages deployments, billing, and infrastructure.

### 9.1 Endpoints

```
POST   /api/auth/github          → GitHub OAuth callback
POST   /api/auth/token            → Exchange code for token
GET    /api/auth/me                → Current user info

POST   /api/publish               → Deploy an app
GET    /api/apps                   → List user's apps
GET    /api/apps/:id               → App details (URL, status, usage)
DELETE /api/apps/:id               → Tear down an app
POST   /api/apps/:id/rollback     → Rollback to previous deploy

GET    /api/apps/:id/usage         → Usage stats (requests, DB, storage)
POST   /api/apps/:id/upgrade       → Upgrade to production tier
```

### 9.2 Tech Stack

The Vertz Cloud API itself runs on vertz (dogfooding):
- Cloudflare Workers for the API
- D1 for cloud metadata (users, apps, deployments)
- Cloudflare API for managing Workers, D1 databases, Durable Objects

### 9.3 Cloudflare API Integration

On each deploy, the Cloud API calls Cloudflare's API to:
- Create/update a Worker script (wrangler API equivalent)
- Create D1 database if first deploy
- Run migrations on the D1 database
- Configure custom domains if provided
- Deploy Durable Object bindings if real-time entities exist

---

## 10. Pricing Model

### Free Tier (vertz publish)

- Unlimited apps
- *.vertz.app subdomain
- SQLite database (D1, shared limits)
- Auto-sleep after 30 min inactivity (Worker stays deployed, wakes on request — Workers don't actually sleep, so this may not apply)
- Community support
- Vertz Cloud branding in footer (optional, removable on paid)

### Starter Tier (~$10-20/month per app)

- Everything in Free
- Custom domain
- Dedicated D1 database (own limits)
- Or: shared Postgres via Hyperdrive
- No branding
- Email support
- Usage dashboard

### Production Tier (~$50+/month per app)

- Everything in Starter
- Dedicated Postgres (RDS or CockroachDB)
- Multi-region deployment
- Durable Objects for real-time
- Background job processing
- Auto-scaling
- SLA
- Priority support

### Bring Your Own Cloudflare (Free)

- User deploys to their own Cloudflare account
- Vertz provides the deploy tooling
- No Vertz Cloud costs
- User manages their own billing with Cloudflare

---

## 11. What We Need to Build for v0

### Framework side (`@vertz/cli`)
- [ ] `vertz publish` command (auth → build → upload → URL)
- [ ] `vertz build --target cloudflare-workers` (Worker-compatible output)
- [ ] GitHub OAuth device flow
- [ ] Credential storage (`~/.vertz/credentials`)
- [ ] SQLite dialect in `@vertz/db` (D1 compatibility)
- [ ] Compiler: database engine validation (sqlite vs postgres feature checking)

### Cloud side (new service: `vertz-cloud`)
- [ ] Vertz Cloud API (auth, publish, app management)
- [ ] Cloudflare API integration (Worker deployment, D1 provisioning)
- [ ] Subdomain management (*.vertz.app DNS)
- [ ] Migration runner (apply migrations on D1 during deploy)
- [ ] Usage tracking (per-app request/storage counters)

### Infrastructure
- [ ] Cloudflare account setup (Workers, D1, R2, Durable Objects)
- [ ] vertz.app domain + wildcard DNS
- [ ] GitHub OAuth app registration
- [ ] Shared Postgres on AWS (for Postgres-path users)

---

## 12. What We Defer

- Google OAuth (v0.1)
- Team/org support (v0.2)
- Production tier with dedicated Postgres (v0.2)
- CockroachDB integration (v0.3+)
- Background job offloading to containers (v0.2)
- Multi-region deployment (v0.3+)
- Usage-based billing integration (v0.1)
- App dashboard UI (v0.1 — CLI-only for v0)
- Rollback functionality (v0.1)
- Bring Your Own Cloudflare flow (v0.1)

---

## 13. The LLM Distribution Strategy

Every tutorial, guide, and example ends with:

```markdown
## Ship it

\`\`\`bash
vertz publish
\`\`\`

Your app is live on the edge with a database. Share the URL.
```

This sentence enters LLM training data. When a user asks an LLM to "build me a todo app with vertz," the LLM generates the code AND suggests `vertz publish` as the final step. The user is on our cloud before they think about infrastructure.

**The docs narrative:**

```
vertz init       → choose your stack (SQLite or Postgres)
vertz dev        → local development with instant database
vertz publish    → live on the edge, share the URL
```

Three commands. Zero to production. That's the story.

---

## 14. Open Questions

1. **Cloudflare account structure:** One Cloudflare account for all free-tier apps, or multiple accounts for isolation? Need to check Cloudflare's per-account limits for Workers and D1.

2. **D1 database-per-app or shared database?** D1 supports multiple databases per account. Each free-tier app could get its own D1 database (isolated) or share one (cheaper but less isolated). Recommendation: one D1 per app — isolation is worth the small overhead.

3. **Build artifact format:** What does `vertz build --target cloudflare-workers` produce? A single JS bundle + static assets? A wrangler.toml equivalent? Need to align with Cloudflare's deployment API.

4. **Migration strategy for D1:** D1 supports migrations via SQL statements. How do we package and apply migrations during deploy? Need to investigate D1's migration API.

5. **Durable Object deployment:** Durable Objects require class bindings in wrangler.toml. How does the framework auto-generate these from entity definitions with `realtime: true`?

6. **Monitoring/observability:** Free-tier apps need basic observability. Cloudflare Workers has built-in analytics. Is that sufficient or do we need more?

7. **Rate limiting for free tier:** How do we prevent abuse? Per-app request limits? Per-account limits? Cloudflare's built-in rate limiting or our own via Durable Objects?
