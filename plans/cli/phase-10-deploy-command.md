# Phase 10: `vertz deploy` Command

**Prerequisites:** [Phase 9 -- `vertz routes` Command](./phase-09-routes-command.md)

**Goal:** Implement the deployment helper command that auto-detects or prompts for a deployment target and generates platform-specific configuration files.

---

## What to Implement

1. **Deployment target detector** -- `src/deploy/detector.ts` for auto-detecting platform from project files
2. **Railway config generator** -- `src/deploy/railway.ts` for `railway.toml` generation
3. **Fly.io config generator** -- `src/deploy/fly.ts` for `fly.toml` + Dockerfile generation
4. **Dockerfile generator** -- `src/deploy/dockerfile.ts` for standalone Dockerfile + `.dockerignore`
5. **Deploy command** -- `src/commands/deploy.ts` with interactive target selection and `--dry-run` support
6. **Command registration** -- Wire `deploy` command into `src/cli.ts` (replace stub)

---

## Files to Create/Modify

### New Files

```
packages/cli/src/
├── commands/
│   └── deploy.ts
└── deploy/
    ├── detector.ts
    ├── railway.ts
    ├── fly.ts
    └── dockerfile.ts
```

### Test Files

```
packages/cli/src/
├── commands/
│   └── __tests__/
│       └── deploy.test.ts
└── deploy/
    └── __tests__/
        ├── detector.test.ts
        ├── railway.test.ts
        ├── fly.test.ts
        └── dockerfile.test.ts
```

### Modified Files

- `src/cli.ts` -- Replace deploy command stub with real implementation

---

## Expected Behaviors to Test

### Target Detector (`src/deploy/__tests__/detector.test.ts`)

- [ ] Returns `'fly'` when `fly.toml` exists in project root
- [ ] Returns `'railway'` when `railway.toml` exists in project root
- [ ] Returns `'docker'` when `Dockerfile` exists in project root
- [ ] Returns `null` when no deployment config is detected
- [ ] Checks in order: fly.toml, railway.toml, Dockerfile
- [ ] Uses the first match (does not check all)

### Railway Config Generator (`src/deploy/__tests__/railway.test.ts`)

- [ ] Generates a valid `railway.toml` file content
- [ ] Includes build command (`bun run build`)
- [ ] Includes start command
- [ ] Detects runtime from project (Bun vs Node) and adjusts commands
- [ ] Returns the file path and content as `GeneratedFile`

### Fly.io Config Generator (`src/deploy/__tests__/fly.test.ts`)

- [ ] Generates a valid `fly.toml` file content
- [ ] Generates a Dockerfile alongside `fly.toml`
- [ ] `fly.toml` includes internal port configuration
- [ ] `fly.toml` includes health check configuration
- [ ] Dockerfile uses appropriate base image (Bun or Node)
- [ ] Returns array of `GeneratedFile` entries

### Dockerfile Generator (`src/deploy/__tests__/dockerfile.test.ts`)

- [ ] Generates a Dockerfile for Bun runtime
- [ ] Generates a Dockerfile for Node runtime
- [ ] Includes multi-stage build (install deps -> build -> run)
- [ ] Copies only necessary files in the final stage
- [ ] Generates `.dockerignore` file
- [ ] `.dockerignore` includes `node_modules`, `.git`, `.vertz`
- [ ] Sets appropriate `EXPOSE` port
- [ ] Uses `CMD` with the correct start command

### Deploy Command (`src/commands/__tests__/deploy.test.ts`)

#### Core behavior

- [ ] Auto-detects deployment target when possible
- [ ] Shows confirmation message when target is auto-detected
- [ ] Writes generated config files to project root
- [ ] Shows list of generated files
- [ ] Shows next-steps guidance after generation

#### Interactive prompts (missing target)

- [ ] When `--target` is not provided and auto-detection fails: shows select prompt
- [ ] Select prompt lists all supported platforms (Railway, Fly.io, Docker)
- [ ] User selection determines which config generator runs

#### CI mode

- [ ] When `CI=true` and target cannot be determined: exits with error, not prompt
- [ ] Error message suggests using `--target` flag

#### Dry run

- [ ] `--dry-run` shows what files would be generated without writing
- [ ] `--dry-run` displays the content of generated files

#### Target flag

- [ ] `--target railway` generates Railway config directly (no prompt)
- [ ] `--target fly` generates Fly.io config directly (no prompt)
- [ ] `--target docker` generates Docker config directly (no prompt)
- [ ] Invalid `--target` value shows an error with valid options

---

## Quality Gates

After each GREEN:

```bash
bunx biome check --write packages/cli/src/commands/ packages/cli/src/deploy/
bun run typecheck
```

---

## Notes

- This is a convenience command -- it generates config files but does NOT deploy. The developer still uses the platform's own CLI (`railway up`, `fly deploy`, `docker build`).
- Config generators should use the runtime detection utility from Phase 1 to choose between Bun and Node base images and commands.
- The Dockerfile should follow best practices: multi-stage build, minimal final image, `.dockerignore`.
- The `--dry-run` flag is especially useful here since deployment configs are project-root files that users may want to review before writing.
- Generated files should include helpful comments explaining each section.
- Tests for config generators should assert on the content of generated files (key config values are present) without being overly brittle about exact formatting.
