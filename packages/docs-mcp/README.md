# @vertz/docs-mcp

Public [Model Context Protocol](https://modelcontextprotocol.io) server that
exposes the [Vertz](https://vertz.dev) documentation to LLM clients —
Claude Code, Cursor, Windsurf, Zed, and anything else that speaks MCP.

Install once and your LLM gets the full Vertz docs as a tool. No paste-into-prompt,
no stale knowledge, no waiting for the next training cutoff.

## What it gives the LLM

Four tools, all read-only, all bundled offline (no network calls at runtime):

| Tool          | Description                                                |
| ------------- | ---------------------------------------------------------- |
| `search_docs` | Ranked excerpt search over every guide and reference page. |
| `get_doc`     | Full markdown of a single doc page by path.                |
| `list_guides` | Flat listing of every doc page with title and description. |
| `get_example` | Full source of a Vertz example app by name.                |

## Install

### Claude Code

```sh
claude mcp add vertz-docs -- npx -y @vertz/docs-mcp
```

### Cursor

Add to `~/.cursor/mcp.json` (or the project `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "vertz-docs": {
      "command": "npx",
      "args": ["-y", "@vertz/docs-mcp"]
    }
  }
}
```

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "vertz-docs": {
      "command": "npx",
      "args": ["-y", "@vertz/docs-mcp"]
    }
  }
}
```

### Zed

Add to your Zed `settings.json`:

```json
{
  "context_servers": {
    "vertz-docs": {
      "command": {
        "path": "npx",
        "args": ["-y", "@vertz/docs-mcp"]
      }
    }
  }
}
```

### Anything else (manual stdio)

```sh
npx -y @vertz/docs-mcp
```

The binary speaks JSON-RPC over stdio per the MCP spec.

## Configuration

| Environment variable    | Default                                    | Purpose                                              |
| ----------------------- | ------------------------------------------ | ---------------------------------------------------- |
| `VERTZ_DOCS_INDEX_PATH` | `<package>/dist/docs-index.generated.json` | Override the bundled docs index (testing / pinning). |

## Updating

The docs index is regenerated and bundled with every npm release. To pull the
latest snapshot, restart your client — `npx` resolves `@vertz/docs-mcp@latest`
on every spawn.

## License

MIT — see `LICENSE` at the monorepo root.
