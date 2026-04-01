# Phase 3: CLI + Config

## Context

We're building `@vertz/openapi` — a standalone tool that generates typed TypeScript SDKs from OpenAPI 3.x specs. Phase 1 built the parser, Phase 2 built the generators. This phase wires them together with a CLI and config file support.

**Design doc:** `plans/openapi-sdk-codegen.md`
**Depends on:** Phase 1 (parser), Phase 2 (generators)

After this phase, the tool is usable end-to-end:
```bash
npx @vertz/openapi generate --from openapi.json --output ./src/generated
```

---

## Tasks

### Task 1: Config schema + loader

**Files:** (2)
- `packages/openapi/src/config.ts` (new)
- `packages/openapi/src/__tests__/config.test.ts` (new)

**What to implement:**

Config validation and loading from `openapi.config.ts` or CLI flags.

```typescript
export interface OpenAPIConfig {
  source: string;               // File path or URL
  output: string;               // Output directory (default: './src/generated')
  baseURL: string;              // Default base URL (default: '')
  groupBy: 'tag' | 'path' | 'none';  // Grouping strategy (default: 'tag')
  schemas: boolean;             // Generate Zod schemas (default: false)
  operationIds?: {
    overrides?: Record<string, string>;
    transform?: (cleaned: string, original: string) => string;
  };
}

/**
 * Merge CLI flags with config file values. CLI flags take precedence.
 */
export function resolveConfig(
  cliFlags: Partial<OpenAPIConfig> & { from?: string },
  configFile?: Partial<OpenAPIConfig>,
): OpenAPIConfig;

/**
 * Load config from openapi.config.ts if it exists.
 * Returns undefined if no config file found.
 */
export async function loadConfigFile(cwd: string): Promise<Partial<OpenAPIConfig> | undefined>;

/**
 * Helper for config files:
 * export default defineConfig({ source: '...', output: '...' })
 */
export function defineConfig(config: Partial<OpenAPIConfig>): Partial<OpenAPIConfig>;
```

**Acceptance criteria:**
- [ ] `resolveConfig()` applies defaults for missing values
- [ ] CLI `--from` flag maps to `source`
- [ ] CLI flags override config file values
- [ ] `defineConfig()` is a passthrough (type helper only)
- [ ] Validates `source` is provided (throws if missing from both CLI and config)
- [ ] `loadConfigFile()` returns undefined when no config file exists
- [ ] `loadConfigFile()` loads and returns config when `openapi.config.ts` exists

---

### Task 2: Spec loader (file + URL + YAML)

**Files:** (2)
- `packages/openapi/src/loader.ts` (new)
- `packages/openapi/src/__tests__/loader.test.ts` (new)

**What to implement:**

Load an OpenAPI spec from a file path or URL, supporting both JSON and YAML.

```typescript
/**
 * Load an OpenAPI spec from a file path or URL.
 * Auto-detects JSON vs YAML from file extension or content.
 * Returns the parsed JavaScript object.
 */
export async function loadSpec(source: string): Promise<Record<string, unknown>>;
```

Key behaviors:
- **File path:** Read from disk. Detect `.yaml`/`.yml` extension → parse as YAML. Otherwise parse as JSON.
- **URL** (starts with `http://` or `https://`): Fetch via `globalThis.fetch`. Detect content type or extension. Parse accordingly.
- **YAML parsing:** Use the `yaml` npm package (bundled dependency, not user-facing).
- **Error handling:** Clear errors for file not found, network errors, invalid JSON/YAML.

**Acceptance criteria:**
- [ ] Loads JSON file from disk
- [ ] Loads YAML file from disk (`.yaml` and `.yml` extensions)
- [ ] Fetches JSON from URL
- [ ] Fetches YAML from URL
- [ ] Auto-detects JSON content (starts with `{`)
- [ ] Throws clear error for file not found
- [ ] Throws clear error for network failure
- [ ] Throws clear error for invalid JSON
- [ ] Throws clear error for invalid YAML

---

### Task 3: Incremental file writer

**Files:** (2)
- `packages/openapi/src/writer/incremental.ts` (new)
- `packages/openapi/src/writer/__tests__/incremental.test.ts` (new)

**What to implement:**

Content-hash-based file writer that only writes files that changed.

```typescript
import type { GeneratedFile } from '../generators/types';

export interface WriteResult {
  written: number;
  skipped: number;
  removed: number;
  filesWritten: string[];
}

/**
 * Write generated files to disk, only updating files whose content changed.
 * Optionally removes stale files in the output directory.
 */
export async function writeIncremental(
  files: GeneratedFile[],
  outputDir: string,
  options?: { clean?: boolean; dryRun?: boolean },
): Promise<WriteResult>;
```

Key behaviors:
- Compute SHA-256 hash of each file's content
- Compare with existing file on disk (if present)
- Only write if content changed
- When `clean: true`, remove files in `outputDir` that aren't in the generated set
- When `dryRun: true`, compute the result without writing anything
- Create directories as needed (`mkdir -p`)
- Report counts: written, skipped, removed

**Acceptance criteria:**
- [ ] Writes new files to disk
- [ ] Skips files with unchanged content (same hash)
- [ ] Removes stale files when `clean: true`
- [ ] Does NOT remove stale files when `clean: false` (default)
- [ ] `dryRun: true` returns correct counts without writing
- [ ] Creates nested directories as needed
- [ ] Returns accurate `WriteResult` with counts and file paths

---

### Task 4: Main pipeline (`generateFromOpenAPI`)

**Files:** (2)
- `packages/openapi/src/generate.ts` (new)
- `packages/openapi/src/__tests__/generate.test.ts` (new)

**What to implement:**

The main programmatic entry point that wires together loader → parser → grouper → generators → writer.

```typescript
import type { OpenAPIConfig } from './config';
import type { WriteResult } from './writer/incremental';

/**
 * Generate a typed SDK from an OpenAPI spec.
 * This is the main programmatic API.
 */
export async function generateFromOpenAPI(
  config: OpenAPIConfig & { dryRun?: boolean },
): Promise<WriteResult>;
```

Pipeline:
1. `loadSpec(config.source)` — load the spec
2. `parseOpenAPI(spec)` — parse and validate
3. `groupOperations(operations, config.groupBy)` — group into resources (applying `config.operationIds` normalizer config)
4. `generateAll(parsedSpec, { schemas: config.schemas, baseURL: config.baseURL })` — generate files
5. `writeIncremental(files, config.output, { clean: true, dryRun: config.dryRun })` — write to disk

Re-export from `src/index.ts` as the main public API.

**Acceptance criteria:**
- [ ] Full pipeline: spec file → parsed → grouped → generated → written
- [ ] Applies operation ID normalization config (overrides, transform)
- [ ] Passes `schemas` option through to generators
- [ ] Passes `baseURL` through to client generator
- [ ] Passes `dryRun` through to writer
- [ ] Returns `WriteResult` with correct counts
- [ ] Errors from any stage propagate with clear messages

---

### Task 5: CLI entry point

**Files:** (3)
- `packages/openapi/src/cli.ts` (new)
- `packages/openapi/bin/openapi.ts` (new)
- `packages/openapi/src/__tests__/cli.test.ts` (new)

**What to implement:**

CLI that parses arguments and invokes `generateFromOpenAPI()`.

```bash
# Usage
npx @vertz/openapi generate --from <path-or-url> [options]
npx @vertz/openapi validate --from <path-or-url>

# Options
--from <source>     Path to OpenAPI spec file or URL (required if no config file)
--output <dir>      Output directory (default: ./src/generated)
--base-url <url>    Base URL for API calls (default: '')
--group-by <mode>   Grouping: tag | path | none (default: tag)
--schemas           Generate Zod schemas (default: false)
--dry-run           Preview without writing files
```

**Commands:**
- `generate` — Run the full pipeline
- `validate` — Parse and validate the spec, report errors, don't generate

**Output:**
- Print summary on success: `✓ Generated 12 files in ./src/generated (3 written, 9 unchanged)`
- Print errors on failure with context (file path, line if available)
- Non-zero exit code on failure

**Bin entry:**
- `packages/openapi/bin/openapi.ts` — hashbang script that imports `cli.ts`
- `package.json` `"bin"` field points to this

**Acceptance criteria:**
- [ ] `generate` command produces SDK files from a spec file
- [ ] `validate` command validates spec without generating
- [ ] `--from` flag accepts file paths and URLs
- [ ] `--output` flag sets output directory
- [ ] `--dry-run` flag previews without writing
- [ ] `--schemas` flag enables Zod schema generation
- [ ] Falls back to `openapi.config.ts` when no `--from` flag
- [ ] Prints summary with written/skipped counts
- [ ] Exits with code 1 on error
- [ ] Prints clear error messages with context
