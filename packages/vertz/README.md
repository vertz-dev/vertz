# Vertz

**If it builds, it works.** The TypeScript framework where types flow from database to browser.

Define your schema once — get a typed database layer, a typed API with auto-generated OpenAPI, and a compiled UI with fine-grained reactivity.

```
d.table()  →  entity()  →  createServer()  →  query() / form()
 schema        CRUD API       serve it          use it in UI
```

## Install

```bash
bun add vertz
```

Import what you need via subpath exports:

```typescript
import { createServer } from 'vertz/server';
import { s } from 'vertz/schema';
import { createDb } from 'vertz/db';
import { createTestClient } from 'vertz/testing';
import { query, form, mount } from 'vertz/ui';
```

One dependency. Tree-shakeable. No barrel file — every import is explicit.

## Available subpaths

| Subpath             | Package              |
| ------------------- | -------------------- |
| `vertz/server`      | `@vertz/server`      |
| `vertz/schema`      | `@vertz/schema`      |
| `vertz/db`          | `@vertz/db`          |
| `vertz/testing`     | `@vertz/testing`     |
| `vertz/ui`          | `@vertz/ui`          |
| `vertz/ui-server`   | `@vertz/ui-server`   |
| `vertz/ui-compiler` | `@vertz/ui-server` (compiler utilities) |

## Documentation

Full guides, API reference, and examples at **[vertz.dev](https://vertz.dev)** (coming soon).

- [GitHub](https://github.com/vertz-dev/vertz) — source code and issues
- [Manifesto](https://github.com/vertz-dev/vertz/blob/main/MANIFESTO.md) — what we believe and why
- [Vision](https://github.com/vertz-dev/vertz/blob/main/VISION.md) — the 8 principles behind every decision

## License

MIT
