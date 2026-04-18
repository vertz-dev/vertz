---
'@vertz/cli-runtime': patch
---

fix(runtime): clean Node-like env for server handlers

Server handlers (entity actions, service actions, middleware, auth resolvers,
route loaders) now run in a Workers-compatible context that does **not**
expose `window`, `document`, `location`, `history`, or other DOM globals.
Only SSR render runs under a scoped DOM shim, which is installed before the
matched route renders and removed immediately after.

This means third-party SDKs that gate on `typeof window !== 'undefined'`
(like `@anthropic-ai/sdk`, `openai`, and `stripe`) work in server handlers
without `dangerouslyAllowBrowser: true`:

```ts
import Anthropic from '@anthropic-ai/sdk';
import { service } from 'vertz/server';

export default service('ai', {
  actions: {
    summarize: {
      handler: async ({ text }) => {
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
        // no `dangerouslyAllowBrowser: true` needed
        return client.messages.create({ /* ... */ });
      },
    },
  },
});
```

Closes #2760.
