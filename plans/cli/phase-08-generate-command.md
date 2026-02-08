# Phase 8: `vertz generate` Command

**Prerequisites:** [Phase 7 -- `vertz dev` Command](./phase-07-dev-command.md)

**Goal:** Implement the code scaffolding command with templates, interactive prompts for missing parameters, and plugin system support.

---

## What to Implement

1. **Generator implementations** -- `src/generators/module.ts`, `service.ts`, `router.ts`, `schema.ts`
2. **Templates** -- `src/generators/templates/*.hbs` (or string template functions)
3. **Generate command** -- `src/commands/generate.ts` with interactive prompts for missing type/name/module
4. **Command registration** -- Wire `generate` command into `src/cli.ts` (replace stub)

---

## Files to Create/Modify

### New Files

```
packages/cli/src/
├── commands/
│   └── generate.ts
└── generators/
    ├── module.ts
    ├── service.ts
    ├── router.ts
    ├── schema.ts
    └── templates/
        ├── module-def.ts.hbs
        ├── module.ts.hbs
        ├── service.ts.hbs
        ├── router.ts.hbs
        └── schema.ts.hbs
```

### Test Files

```
packages/cli/src/
├── commands/
│   └── __tests__/
│       └── generate.test.ts
└── generators/
    └── __tests__/
        ├── module.test.ts
        ├── service.test.ts
        ├── router.test.ts
        └── schema.test.ts
```

### Modified Files

- `src/cli.ts` -- Replace generate command stub with real implementation

---

## Expected Behaviors to Test

### Module Generator (`src/generators/__tests__/module.test.ts`)

- [ ] Generates module-def file at `src/modules/<name>/<name>.module-def.ts`
- [ ] Generates module file at `src/modules/<name>/<name>.module.ts`
- [ ] Creates `schemas/` subdirectory inside the module
- [ ] Module-def file follows Vertz conventions (exports `createModuleDef()` call)
- [ ] Module file follows Vertz conventions (exports `createModule()` call)
- [ ] Uses kebab-case for directory name and file names
- [ ] Uses PascalCase for the module type name
- [ ] Returns list of generated file paths
- [ ] Handles names with different casing (normalizes to conventions)

### Service Generator (`src/generators/__tests__/service.test.ts`)

- [ ] Generates service file at `src/modules/<module>/<name>.service.ts`
- [ ] Service file exports a function following Vertz conventions
- [ ] Requires `module` option to determine target module
- [ ] Throws error when module directory does not exist
- [ ] Returns list of generated file paths

### Router Generator (`src/generators/__tests__/router.test.ts`)

- [ ] Generates router file at `src/modules/<module>/<name>.router.ts`
- [ ] Router file follows Vertz conventions (imports `createRouter`)
- [ ] Requires `module` option to determine target module
- [ ] Throws error when module directory does not exist
- [ ] Returns list of generated file paths

### Schema Generator (`src/generators/__tests__/schema.test.ts`)

- [ ] Generates schema file at `src/modules/<module>/schemas/<name>.schema.ts`
- [ ] Schema file follows Vertz conventions (uses `z.object()` with `createSchema()`)
- [ ] Requires `module` option to determine target module
- [ ] Throws error when module directory does not exist
- [ ] Returns list of generated file paths

### Generate Command (`src/commands/__tests__/generate.test.ts`)

#### Core behavior

- [ ] Calls the appropriate generator based on the type argument
- [ ] Displays list of generated files on success
- [ ] Shows "Next:" suggestion after generating a module

#### Interactive prompts (missing type)

- [ ] When `type` is not provided: shows a select prompt with generator options
- [ ] Select prompt includes built-in generators (module, service, router, schema)
- [ ] Select prompt includes custom generators from config (plugin system)
- [ ] User selection determines which generator runs

#### Interactive prompts (missing name)

- [ ] When `name` is not provided: shows a text input prompt
- [ ] Text input prompt uses the type as context (e.g., "Module name:")

#### Interactive prompts (missing module)

- [ ] When `--module` is not provided for service/router/schema: shows a select prompt
- [ ] Select prompt lists existing modules from `src/modules/` directory
- [ ] Module prompt is skipped for `module` type (module generator creates its own directory)

#### CI mode

- [ ] When `CI=true` and `type` is missing: exits with error, not prompt
- [ ] When `CI=true` and `name` is missing: exits with error, not prompt
- [ ] When `CI=true` and `--module` is required but missing: exits with error, not prompt
- [ ] Error message lists the missing required parameters

#### Dry run

- [ ] `--dry-run` shows what would be generated without writing files
- [ ] `--dry-run` lists file paths that would be created

#### Plugin generators

- [ ] Custom generators from `vertz.config.ts` appear in the type selection
- [ ] Custom generators receive the correct `GeneratorContext`
- [ ] Custom generators' output files are displayed the same as built-in generators

---

## Quality Gates

After each GREEN:

```bash
bunx biome check --write packages/cli/src/commands/ packages/cli/src/generators/
bun run typecheck
```

---

## Notes

- Templates can be either Handlebars files (`.hbs`) or plain TypeScript template functions. Start with string template functions (simpler, no extra dependency) and consider Handlebars later if templates get complex.
- The `--module` interactive prompt scans `src/modules/` for existing directories. This requires filesystem access. In tests, use a temp directory or mock `fs.readdir`.
- The `GeneratorDefinition` interface from the plugin system should be used for both built-in and custom generators. Built-in generators implement the same interface.
- Name normalization: input `"UserAuth"` should produce files like `user-auth.service.ts` (kebab-case files) with `UserAuth` in the type names (PascalCase).
- The `vertz generate` command is where interactive prompts are most important. This is the primary use case that motivated the interactive prompt design.
