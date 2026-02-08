# Phase 11: `create-vertz-app`

**Prerequisites:** [Phase 10 -- `vertz deploy` Command](./phase-10-deploy-command.md)

**Goal:** Build the standalone scaffolding package for `npm create vertz-app` / `bun create vertz-app`. This is a separate package that scaffolds a complete new Vertz project.

---

## What to Implement

1. **Package setup** -- `packages/create-vertz-app/` with its own `package.json`, `tsconfig.json`, build config
2. **CLI entry point** -- `bin/create-vertz-app.ts`
3. **Project scaffolder** -- `src/scaffold.ts` that creates the project directory and files
4. **Template files** -- All the files that make up a new Vertz project
5. **Interactive prompts** -- Runtime selection, example module opt-in, project name input
6. **CI mode support** -- All prompts skippable via flags when `CI=true`

---

## Files to Create/Modify

### New Package

```
packages/create-vertz-app/
├── package.json
├── tsconfig.json
├── bunup.config.ts
├── vitest.config.ts
├── bin/
│   └── create-vertz-app.ts
├── src/
│   ├── index.ts
│   ├── scaffold.ts
│   ├── prompts.ts
│   └── templates/
│       ├── package.json.ts
│       ├── tsconfig.json.ts
│       ├── vertz.config.ts.ts
│       ├── env.ts.ts
│       ├── env.example.ts
│       ├── gitignore.ts
│       ├── app.ts.ts
│       ├── main.ts.ts
│       ├── request-id.middleware.ts.ts
│       ├── health.module-def.ts.ts
│       ├── health.module.ts.ts
│       ├── health.service.ts.ts
│       ├── health.router.ts.ts
│       └── health-check.schema.ts.ts
```

### Test Files

```
packages/create-vertz-app/src/
├── __tests__/
│   ├── scaffold.test.ts
│   └── prompts.test.ts
└── templates/
    └── __tests__/
        └── templates.test.ts
```

---

## Expected Behaviors to Test

### Scaffold (`src/__tests__/scaffold.test.ts`)

Use a temp directory for all file system tests.

#### Directory structure

- [ ] Creates the project directory with the given name
- [ ] Creates `src/` subdirectory
- [ ] Creates `src/modules/` subdirectory
- [ ] Creates `src/middlewares/` subdirectory
- [ ] Throws error if project directory already exists

#### Core files

- [ ] Generates `package.json` with project name
- [ ] `package.json` includes `@vertz/core` as dependency
- [ ] `package.json` includes `@vertz/cli` as dev dependency
- [ ] `package.json` includes scripts: `dev`, `build`, `check`
- [ ] Generates `tsconfig.json` with strict TypeScript config
- [ ] Generates `vertz.config.ts` with default config
- [ ] Generates `.env` file with placeholder values
- [ ] Generates `.env.example` matching `.env` structure
- [ ] Generates `.gitignore` with standard entries

#### Source files

- [ ] Generates `src/env.ts` with environment variable validation
- [ ] Generates `src/app.ts` with app creation
- [ ] Generates `src/main.ts` as the entry point
- [ ] Generates `src/middlewares/request-id.middleware.ts`

#### Example module (opt-in)

- [ ] When example is enabled: generates health module files
- [ ] Health module includes `health.module-def.ts`
- [ ] Health module includes `health.module.ts`
- [ ] Health module includes `health.service.ts`
- [ ] Health module includes `health.router.ts`
- [ ] Health module includes `schemas/health-check.schema.ts`
- [ ] When example is disabled: `src/modules/` exists but is empty

#### Runtime configuration

- [ ] Bun runtime: `package.json` uses Bun-appropriate scripts
- [ ] Node runtime: `package.json` uses Node-appropriate scripts (tsx for dev)
- [ ] Deno runtime: generates `deno.json` instead of some Node-specific configs

### Prompts (`src/__tests__/prompts.test.ts`)

#### Interactive mode

- [ ] When project name is not provided: prompts for it
- [ ] Prompts for runtime selection (Bun, Node, Deno)
- [ ] Bun is the default/recommended option
- [ ] Prompts for example module inclusion (default: yes)

#### CI mode

- [ ] When `CI=true` and project name is not provided: exits with error
- [ ] When `CI=true`: uses flag values or defaults (no prompts)
- [ ] `--runtime bun` skips the runtime prompt
- [ ] `--example` / `--no-example` skips the example prompt

#### Flag handling

- [ ] `--runtime` accepts `bun`, `node`, `deno`
- [ ] `--runtime` with invalid value shows error and valid options
- [ ] `--example` enables example module without prompting
- [ ] `--no-example` disables example module without prompting

### Templates (`src/templates/__tests__/templates.test.ts`)

- [ ] All template functions return valid file content (non-empty strings)
- [ ] `package.json` template produces valid JSON
- [ ] `tsconfig.json` template produces valid JSON
- [ ] Template files use consistent formatting
- [ ] Templates include helpful comments for new users

---

## Quality Gates

After each GREEN:

```bash
bunx biome check --write packages/create-vertz-app/src/
bun run typecheck
```

---

## Notes

- This is a **separate package** from `@vertz/cli`. It has its own `package.json`, build config, and test suite.
- The package name must be `create-vertz-app` to work with `npm create vertz-app` and `bun create vertz-app`.
- Templates are TypeScript functions (not Handlebars) since each template needs minimal logic (name substitution, runtime-conditional sections).
- The scaffolded project should work out of the box after `bun install && bun run dev` (or equivalent for other runtimes).
- The example health module demonstrates Vertz conventions. It should be a minimal but complete example: module-def, module, service, router, schema.
- Consider providing a `--template` flag for future expansion (e.g., `--template api`, `--template monorepo`). For now, only the default template is needed.
- This package has NO dependency on `@vertz/compiler`. It generates static files. Keep it lightweight.
- For Ink-based UI in the scaffolder, depend on Ink directly (separate from `@vertz/cli`'s Ink). Or use simpler terminal output (no Ink) to keep the package lightweight.
