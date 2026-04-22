---
'@vertz/docs-mcp': patch
'@vertz/landing': patch
---

feat(docs-mcp): public `@vertz/docs-mcp` MCP server for Vertz documentation

Closes [#2967](https://github.com/vertz-dev/vertz/issues/2967).

First task of GEO/SEO Phase 1 — bypasses the LLM training cutoff by exposing the full Vertz documentation as MCP tools to Claude Code, Cursor, Windsurf, Zed, and any other client.

The server is offline-first: docs are indexed at `prepublish` from `packages/mint-docs/`, bundled as JSON inside the package, and served via stdio. No runtime network calls.

**Tools exposed:**
- `search_docs(query, limit?)` — BM25 ranked excerpts.
- `get_doc(path)` — full markdown for a doc page.
- `list_guides()` — every doc page with title and description.
- `get_example(name)` — full source of a Vertz example app.

**Install (Claude Code):**

```sh
claude mcp add vertz-docs -- npx -y @vertz/docs-mcp
```

The vertz.dev landing page now ships a "Use Vertz in your IDE" section with copy-paste install snippets for the four supported clients.
