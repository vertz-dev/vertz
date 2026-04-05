# Phase 3: Documentation

## Context

Phases 1 and 2 delivered working `--inspect` and `--inspect-brk` support with breakpoint debugging, source maps, and isolate restart resilience. This phase documents the feature for developers.

Design doc: `plans/2044-cdp-inspect.md` (Rev 3)
Depends on: Phase 2 (all inspector functionality complete)

## Tasks

### Task 1: Mintlify docs — `--inspect` usage guide

**Files:** (3)
- `packages/mint-docs/runtime/debugging.mdx` (new)
- `packages/mint-docs/mint.json` (modified — add page to navigation)
- `packages/mint-docs/runtime/dev-server.mdx` (modified — add cross-reference to debugging page)

**What to implement:**

Create a new documentation page for debugging with Chrome DevTools. Structure:

1. **Overview** — What `--inspect` does, one-sentence summary
2. **Quick start** — `vtz dev --inspect`, open `chrome://inspect`, click "inspect"
3. **VS Code setup** — Complete `launch.json` example with `type: node`, `attach`, `restart: true`, `skipFiles`, `sourceMapPathOverrides`. Step-by-step instructions.
4. **CLI flags reference**:
   - `--inspect` — Enable inspector on port 9229
   - `--inspect-brk` — Enable inspector and pause at first statement
   - `--inspect-port <port>` — Custom inspector port (implies `--inspect`)
5. **Breakpoint debugging** — How to set breakpoints in `.tsx` source, how source maps work, what to expect during SSR renders
6. **`--inspect-brk` workflow** — When to use it (debugging startup code, SSR initialization), what "waiting for debugger" means, how to resume
7. **Known limitations**:
   - Breakpoints are lost when files change (isolate restarts)
   - Single debugger session at a time
   - Inspector binds to `127.0.0.1` only (no remote debugging)
8. **Troubleshooting**:
   - "Inspector port in use" — another process on 9229, use `--inspect-port`
   - "Source maps not loading" — verify CORS, check `Debugger.scriptParsed` events
   - "Breakpoints not hitting" — ensure file is loaded via SSR, not just client-side

Add the page to `mint.json` navigation under the "Runtime" section.

Add a brief cross-reference in the existing dev server documentation (`dev-server.mdx` or equivalent) pointing to the debugging page.

**Acceptance criteria:**
- [ ] New `debugging.mdx` page exists with all sections above
- [ ] Page is accessible in Mintlify navigation
- [ ] VS Code `launch.json` example is complete and correct (verified in Phase 2)
- [ ] Cross-reference from dev server docs to debugging page
- [ ] No broken links

---

### Task 2: CLI help text polish

**Files:** (1)
- `native/vtz/src/cli.rs` (modified — improve help descriptions)

**What to implement:**

Review and polish the `#[arg(help = "...")]` descriptions for the three inspector flags. Ensure:
- Help text is concise and matches the documentation
- `--inspect-brk` help mentions it implies `--inspect`
- `--inspect-port` help mentions it implies `--inspect`
- `vtz dev --help` output reads naturally

Example:

```rust
/// Enable V8 inspector for Chrome DevTools / VS Code debugging (port 9229)
#[arg(long)]
pub inspect: bool,

/// Like --inspect, but pause before the entry module loads (waits for debugger)
#[arg(long, conflicts_with = "inspect")]
pub inspect_brk: bool,

/// Inspector port (default: 9229, implies --inspect)
#[arg(long, default_value_t = 9229)]
pub inspect_port: u16,
```

**Acceptance criteria:**
- [ ] `vtz dev --help` output includes clear descriptions for all three flags
- [ ] Help text for `--inspect-brk` and `--inspect-port` mentions they imply `--inspect`
- [ ] No truncation or awkward formatting in terminal output
