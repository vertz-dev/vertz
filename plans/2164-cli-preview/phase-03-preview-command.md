# Phase 3: Preview Command Implementation

## Context

Issue #2164 adds a `vertz preview` command. Phase 1 extracted shared serving functions, Phase 2 implemented freshness detection. This phase wires everything together into the actual CLI command.

Design doc: `plans/2164-cli-preview.md`

## Tasks

### Task 1: Implement `previewAction()` function

**Files:**
- `packages/cli/src/commands/preview.ts` (new)
- `packages/cli/src/commands/__tests__/preview.test.ts` (new)

**What to implement:**

Create the `previewAction()` function that orchestrates build + serve:

```typescript
export interface PreviewCommandOptions {
  port?: number;
  host?: string;
  build?: boolean; // true = force, false = skip, undefined = auto
  open?: boolean;
  verbose?: boolean;
}

export async function previewAction(options: PreviewCommandOptions): Promise<Result<void, Error>>;
```

**Logic flow:**
1. Find project root (`findProjectRoot`)
2. Detect app type (`detectAppType`)
3. Determine build strategy:
   - `build === false` (--no-build): validate build outputs exist, fail if missing
   - `build === true` (--build): run `buildAction({ projectRoot, detected })`
   - `build === undefined` (default): call `isBuildFresh()`, build if not fresh
4. If build needed and build fails: print "Build failed. Fix the errors above and try again." and return error
5. Validate build outputs (even after build, for safety)
6. Dispatch to appropriate `serve*()` from `serve-shared.ts`
7. Log preview banner:
   ```
   Preview server running at http://localhost:4000
   AOT: N route(s) loaded       (if applicable)

   This is a local preview. For production, use "vertz start".
   Press Ctrl+C to stop.
   ```
8. If `--open`: open browser via `Bun.openInEditor` or `open` command
9. Register graceful shutdown

**Acceptance criteria:**
- [ ] Auto-builds when dist/ is missing
- [ ] Auto-builds when src/ is newer than dist/
- [ ] Skips build when dist/ is fresh
- [ ] `--build` forces rebuild even when fresh
- [ ] `--no-build` skips build and fails if dist/ missing
- [ ] Returns error if build fails
- [ ] Logs preview-specific banner (not start's banner)
- [ ] Prints "This is a local preview" footer
- [ ] Port defaults to `PORT` env or `4000`
- [ ] Host defaults to `localhost`
- [ ] Graceful shutdown on SIGINT/SIGTERM

---

### Task 2: Register command in CLI

**Files:**
- `packages/cli/src/cli.ts` (modified)
- `packages/cli/src/commands/preview.ts` (modified if needed)

**What to implement:**

Register the `preview` command in `createCLI()`:

```typescript
program
  .command('preview')
  .description('Serve the production build locally for testing')
  .option('-p, --port <port>', 'Server port (default: PORT env or 4000)')
  .option('--host <host>', 'Server host', 'localhost')
  .option('--build', 'Force rebuild before serving')
  .option('--no-build', 'Skip auto-build, fail if dist/ missing')
  .option('--open', 'Open browser on start')
  .option('-v, --verbose', 'Verbose output')
  .action(async (opts) => {
    const result = await previewAction({
      port: opts.port ? parseInt(opts.port, 10) : undefined,
      host: opts.host,
      build: opts.build,
      open: opts.open,
      verbose: opts.verbose,
    });
    if (!result.ok) {
      console.error(result.error.message);
      process.exit(1);
    }
  });
```

**Note on `--build`/`--no-build`:** Commander treats `--no-build` as negation of a `--build` boolean. When neither is passed, `opts.build` is `undefined`. When `--build` is passed, it's `true`. When `--no-build` is passed, it's `false`. This maps cleanly to the three-state logic.

**Acceptance criteria:**
- [ ] `vertz preview` is registered and shows in `vertz --help`
- [ ] Description shows "Serve the production build locally for testing"
- [ ] All flags are parsed correctly
- [ ] `--build` / `--no-build` three-state logic works via Commander
- [ ] Error exits with code 1

---

### Task 3: Quality gates and integration verification

**Files:**
- No new files — verification only

**What to implement:**

Run full quality gates to verify the implementation:
- `vtz test` — all tests pass
- `vtz run typecheck` — types clean
- `vtz run lint` — lint clean

Verify the command works end-to-end by checking:
- `vertz --help` lists `preview`
- `vertz preview --help` shows all options

**Acceptance criteria:**
- [ ] All tests pass
- [ ] Typecheck clean
- [ ] Lint clean
- [ ] `vertz --help` includes `preview` command
- [ ] `vertz preview --help` shows correct options and description
