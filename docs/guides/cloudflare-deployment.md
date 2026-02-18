# Cloudflare Deployment Guide

This guide covers deploying Vertz applications to Cloudflare Workers and Pages.

## Prerequisites

- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installed
- Cloudflare account
- Node.js 18+

```bash
npm install -g wrangler
wrangler login
```

## SSR Worker Deployment

### 1. Install Dependencies

```bash
npm install @vertz/core @vertz/cloudflare @vertz/server
npm install -D wrangler
```

### 2. Create Your Application

Create `src/app.ts`:

```typescript
import { vertz } from '@vertz/core';

const appDef = vertz.moduleDef({ name: 'app' });

const appRouter = appDef.router({ prefix: '' })
  .get('/api/health', {
    handler: async () => {
      return { status: 'ok' };
    },
  })
  .get('/', {
    handler: async () => {
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <title>Vertz on Cloudflare</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
  <h1>Vertz on Cloudflare Workers ⚡</h1>
  <p>This page was server-side rendered.</p>
</body>
</html>`;

      return new Response(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
        },
      });
    },
  });

export const appModule = vertz.module(appDef, {
  services: [],
  routers: [appRouter],
  exports: [],
});

export const app = vertz
  .app({
    basePath: '/',
    cors: { origins: true },
  })
  .register(appModule);
```

### 3. Create Worker Entry Point

Create `src/worker.ts`:

```typescript
import { createHandler } from '@vertz/cloudflare';
import { app } from './app';

export default createHandler(app);
```

### 4. Configure Wrangler

Create `wrangler.toml`:

```toml
name = "my-vertz-app"
main = "src/worker.ts"
compatibility_date = "2025-02-17"
compatibility_flags = ["nodejs_compat"]

# Optional: Environment variables
# [vars]
# API_KEY = "your-api-key"

# Optional: KV bindings
# [[kv_namespaces]]
# binding = "MY_KV"
# id = "your-kv-id"
```

### 5. Configure Package Scripts

Update `package.json`:

```json
{
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy"
  }
}
```

### 6. Deploy

```bash
# Development
npm run dev

# Production
npm run deploy
```

Your app will be deployed to `https://my-vertz-app.your-subdomain.workers.dev`

## Advanced Configuration

### Base Path

If deploying to a subdirectory, configure `basePath`:

```typescript
import { createHandler } from '@vertz/cloudflare';
import { app } from './app';

export default createHandler(app, {
  basePath: '/api',
});
```

This strips `/api` from incoming URLs before routing, so routes defined as `/health` will match requests to `/api/health`.

### Environment Variables

Access environment variables via the `env` parameter:

```typescript
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const handler = createHandler(app);
    return handler.fetch(request, env, ctx);
  },
};
```

Define the `Env` type:

```typescript
interface Env {
  API_KEY: string;
  MY_KV: KVNamespace;
}
```

## Static Pages Deployment

For static sites or SPAs, use Cloudflare Pages:

### 1. Build Your Static Site

```bash
npm run build
# Output directory: dist/
```

### 2. Deploy via Wrangler

```bash
wrangler pages deploy dist --project-name=my-vertz-app
```

### 3. Deploy via Git Integration

1. Push your repo to GitHub/GitLab
2. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → Pages
3. Click "Create a project" → "Connect to Git"
4. Select your repository
5. Configure build settings:
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
6. Click "Save and Deploy"

## Preview Deployments for PRs

Automatically deploy previews for every pull request using GitHub Actions.

Create `.github/workflows/preview.yml`:

```yaml
name: Deploy Preview

on:
  pull_request:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      deployments: write
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          
      - name: Install dependencies
        run: npm ci
        
      - name: Build
        run: npm run build
        
      - name: Deploy to Cloudflare Workers
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          command: deploy --env preview-${{ github.event.pull_request.number }}
          
      - name: Comment Preview URL
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `🚀 Preview deployed: https://preview-${context.issue.number}.my-vertz-app.workers.dev`
            })
```

### Setup Secrets

Add `CLOUDFLARE_API_TOKEN` to your GitHub repository secrets:

1. Go to Cloudflare Dashboard → My Profile → API Tokens
2. Create token with "Edit Cloudflare Workers" permissions
3. Add to GitHub: Settings → Secrets and variables → Actions → New repository secret

### Configure Multiple Environments

Update `wrangler.toml`:

```toml
name = "my-vertz-app"
main = "src/worker.ts"
compatibility_date = "2025-02-17"
compatibility_flags = ["nodejs_compat"]

[env.preview]
name = "my-vertz-app-preview"

[env.staging]
name = "my-vertz-app-staging"

[env.production]
name = "my-vertz-app"
```

Deploy to specific environments:

```bash
wrangler deploy --env preview
wrangler deploy --env staging
wrangler deploy --env production
```

## Custom Domains

### 1. Add Custom Domain via Dashboard

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Select your Worker or Pages project
3. Go to "Settings" → "Domains & Routes"
4. Click "Add Custom Domain"
5. Enter your domain (e.g., `api.example.com`)
6. Cloudflare will automatically configure DNS

### 2. Add Custom Domain via Wrangler

Update `wrangler.toml`:

```toml
routes = [
  { pattern = "api.example.com/*", custom_domain = true }
]
```

Then deploy:

```bash
wrangler deploy
```

### 3. Multiple Domains

```toml
routes = [
  { pattern = "api.example.com/*", custom_domain = true },
  { pattern = "app.example.com/*", custom_domain = true }
]
```

### 4. Zone-Based Routes

For advanced routing within a Cloudflare-managed zone:

```toml
route = "api.example.com/*"
zone_name = "example.com"
```

## Performance Best Practices

### Enable Compression

Cloudflare automatically compresses responses. Ensure your responses have appropriate `Content-Type` headers.

### Use Cache API

Cache expensive computations:

```typescript
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const cache = caches.default;
    let response = await cache.match(request);
    
    if (!response) {
      const handler = createHandler(app);
      response = await handler.fetch(request, env, ctx);
      
      // Cache for 1 hour
      ctx.waitUntil(cache.put(request, response.clone()));
    }
    
    return response;
  },
};
```

### Streaming Responses

Vertz automatically supports streaming via standard Response objects. For large payloads, use `ReadableStream`:

```typescript
appRouter.get('/large-data', {
  handler: async () => {
    const stream = new ReadableStream({
      async start(controller) {
        for (let i = 0; i < 1000; i++) {
          controller.enqueue(new TextEncoder().encode(`Chunk ${i}\n`));
        }
        controller.close();
      },
    });
    
    return new Response(stream, {
      headers: { 'Content-Type': 'text/plain' },
    });
  },
});
```

## Troubleshooting

### Module Not Found Errors

Ensure `compatibility_flags = ["nodejs_compat"]` is set in `wrangler.toml`.

### Worker Size Limits

- Free plan: 1 MB
- Paid plan: 10 MB

If you exceed limits, consider:
- Splitting into multiple workers
- Using external dependencies as KV/R2 assets
- Tree-shaking unused code

### Cold Start Performance

Workers have minimal cold start overhead (~5ms). For optimal performance:
- Keep bundle size small
- Avoid heavy initialization in global scope
- Use lazy imports for large dependencies

### Debugging

View logs:

```bash
wrangler tail
```

Stream logs during deployment:

```bash
wrangler tail --format=pretty
```

## Resources

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Wrangler CLI Reference](https://developers.cloudflare.com/workers/wrangler/)
- [Vertz Cloudflare Example](https://github.com/vertz-dev/vertz/tree/main/examples/ssr-cloudflare)
- [Cloudflare Pages Docs](https://developers.cloudflare.com/pages/)
