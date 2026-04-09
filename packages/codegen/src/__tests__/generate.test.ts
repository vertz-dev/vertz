import { afterEach, beforeEach, describe, expect, it } from '@vertz/test';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AppIR } from '@vertz/compiler';
import { createEmptyAppIR } from '@vertz/compiler';
import type { ResolvedCodegenConfig } from '../config';
import { resolveCodegenConfig } from '../config';
import { generate, mergeImportsToPackageJson } from '../generate';
import type { GeneratedFile } from '../types';

// ── Minimal entity-based AppIR fixture ──────────────────────────────

function makeAppIR(overrides?: Partial<AppIR>): AppIR {
  const appIR = createEmptyAppIR();
  appIR.entities = [
    {
      name: 'tasks',
      modelRef: {
        variableName: 'tasksModel',
        schemaRefs: {
          resolved: true,
          response: {
            kind: 'inline',
            sourceFile: 'tasks.ts',
            resolvedFields: [
              { name: 'id', tsType: 'string', optional: false },
              { name: 'title', tsType: 'string', optional: false },
              { name: 'done', tsType: 'boolean', optional: false },
            ],
          },
          createInput: {
            kind: 'inline',
            sourceFile: 'tasks.ts',
            resolvedFields: [
              { name: 'title', tsType: 'string', optional: false },
              { name: 'done', tsType: 'boolean', optional: true },
            ],
          },
          updateInput: {
            kind: 'inline',
            sourceFile: 'tasks.ts',
            resolvedFields: [
              { name: 'title', tsType: 'string', optional: true },
              { name: 'done', tsType: 'boolean', optional: true },
            ],
          },
        },
      },
      access: {
        list: 'none',
        get: 'none',
        create: 'none',
        update: 'none',
        delete: 'none',
        custom: {},
      },
      hooks: { before: [], after: [] },
      actions: [],
      relations: [],
      sourceFile: 'tasks.ts',
      sourceLine: 1,
      sourceColumn: 1,
    },
  ];
  return { ...appIR, ...overrides };
}

describe('generate', () => {
  let outputDir: string;

  beforeEach(() => {
    outputDir = mkdtempSync(join(tmpdir(), 'vertz-codegen-generate-test-'));
  });

  afterEach(() => {
    rmSync(outputDir, { recursive: true, force: true });
  });

  it('generates entity SDK files and writes them to disk', async () => {
    const config: ResolvedCodegenConfig = resolveCodegenConfig({
      outputDir,
      generators: ['typescript'],
      format: false,
    });

    const result = await generate(makeAppIR(), config);

    // Should return the list of generated files
    expect(result.files.length).toBeGreaterThan(0);

    // Entity SDK files should exist
    const entityFile = join(outputDir, 'entities', 'tasks.ts');
    expect(existsSync(entityFile)).toBe(true);

    // Entity types should exist
    const typesFile = join(outputDir, 'types', 'tasks.ts');
    expect(existsSync(typesFile)).toBe(true);
  });

  it('returns file paths relative to the output directory', async () => {
    const config: ResolvedCodegenConfig = resolveCodegenConfig({
      outputDir,
      generators: ['typescript'],
      format: false,
    });

    const result = await generate(makeAppIR(), config);

    // All returned file paths should be relative (not absolute)
    for (const file of result.files) {
      expect(file.path).not.toMatch(/^\//);
    }
  });

  it('includes the codegen IR in the result', async () => {
    const config: ResolvedCodegenConfig = resolveCodegenConfig({
      outputDir,
      generators: ['typescript'],
      format: false,
    });

    const result = await generate(makeAppIR(), config);

    expect(result.ir).toBeDefined();
    expect(result.ir.basePath).toBe('');
    expect(result.ir.entities.length).toBe(1);
    expect(result.ir.entities[0]?.entityName).toBe('tasks');
  });

  it('includes generator names and file count in the result', async () => {
    const config: ResolvedCodegenConfig = resolveCodegenConfig({
      outputDir,
      generators: ['typescript'],
      format: false,
    });

    const result = await generate(makeAppIR(), config);

    expect(result.generators).toContain('typescript');
    expect(result.fileCount).toBe(result.files.length);
  });

  // ── RLS opt-in tests ───────────────────────────────────────────

  it('does not generate rls-policies.json by default', async () => {
    const appIR = makeAppIR();
    appIR.access = {
      entities: [{ name: 'task', roles: ['owner'] }],
      entitlements: ['task:edit'],
      whereClauses: [
        {
          entitlement: 'task:edit',
          conditions: [{ kind: 'marker', column: 'createdBy', marker: 'user.id' }],
        },
      ],
      sourceFile: 'access.ts',
      sourceLine: 1,
      sourceColumn: 1,
    };
    const config: ResolvedCodegenConfig = resolveCodegenConfig({
      outputDir,
      generators: ['typescript'],
      format: false,
    });

    const result = await generate(appIR, config);
    const rlsFile = result.files.find((f) => f.path === 'rls-policies.json');
    expect(rlsFile).toBeUndefined();
  });

  it('generates rls-policies.json when typescript.rls is true', async () => {
    const appIR = makeAppIR();
    appIR.access = {
      entities: [{ name: 'task', roles: ['owner'] }],
      entitlements: ['task:edit'],
      whereClauses: [
        {
          entitlement: 'task:edit',
          conditions: [{ kind: 'marker', column: 'createdBy', marker: 'user.id' }],
        },
      ],
      sourceFile: 'access.ts',
      sourceLine: 1,
      sourceColumn: 1,
    };
    const config: ResolvedCodegenConfig = resolveCodegenConfig({
      outputDir,
      generators: ['typescript'],
      format: false,
      typescript: { rls: true },
    });

    const result = await generate(appIR, config);
    const rlsFile = result.files.find((f) => f.path === 'rls-policies.json');
    expect(rlsFile).toBeDefined();
    const parsed = JSON.parse(rlsFile!.content);
    expect(parsed.tables).toBeDefined();
  });

  it('formats output by default when format is not explicitly false', async () => {
    const config: ResolvedCodegenConfig = resolveCodegenConfig({
      outputDir,
      generators: ['typescript'],
      // format not set — defaults to true (line 177: config.format !== false)
    });

    const result = await generate(makeAppIR(), config);
    expect(result.files.length).toBeGreaterThan(0);
  });

  // ── Incremental mode tests ──────────────────────────────────────

  describe('incremental mode', () => {
    it('returns incremental stats by default', async () => {
      const config: ResolvedCodegenConfig = resolveCodegenConfig({
        outputDir,
        generators: ['typescript'],
        format: false,
      });

      const result = await generate(makeAppIR(), config);

      // Incremental is on by default — all files should be written (first run)
      expect(result.incremental).toBeDefined();
      expect(result.incremental?.written.length).toBe(result.files.length);
      expect(result.incremental?.skipped.length).toBe(0);
    });

    it('skips unchanged files on second run', async () => {
      const config: ResolvedCodegenConfig = resolveCodegenConfig({
        outputDir,
        generators: ['typescript'],
        format: false,
      });

      // First run — writes everything
      await generate(makeAppIR(), config);

      // Second run with identical input — should skip everything
      const result2 = await generate(makeAppIR(), config);

      expect(result2.incremental).toBeDefined();
      expect(result2.incremental?.written.length).toBe(0);
      expect(result2.incremental?.skipped.length).toBe(result2.files.length);
    });

    it('does not return incremental stats when incremental is false', async () => {
      const config: ResolvedCodegenConfig = resolveCodegenConfig({
        outputDir,
        generators: ['typescript'],
        format: false,
        incremental: false,
      });

      const result = await generate(makeAppIR(), config);

      // When incremental is disabled, no incremental result
      expect(result.incremental).toBeUndefined();
    });
  });
});

describe('mergeImportsToPackageJson', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vertz-merge-imports-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns false when no package.json in generated files', async () => {
    const files: GeneratedFile[] = [{ path: 'index.ts', content: 'export {}' }];
    const result = await mergeImportsToPackageJson(files, tmpDir);
    expect(result).toBe(false);
  });

  it('returns false when generated package.json has no imports', async () => {
    const files: GeneratedFile[] = [
      { path: 'package.json', content: JSON.stringify({ name: 'test' }) },
    ];
    const result = await mergeImportsToPackageJson(files, tmpDir);
    expect(result).toBe(false);
  });

  it('returns false when generated package.json has empty imports', async () => {
    const files: GeneratedFile[] = [
      { path: 'package.json', content: JSON.stringify({ name: 'test', imports: {} }) },
    ];
    const result = await mergeImportsToPackageJson(files, tmpDir);
    expect(result).toBe(false);
  });

  it('returns false when no ancestor package.json is found', async () => {
    const deepDir = join(tmpDir, 'a', 'b', 'c');
    const files: GeneratedFile[] = [
      {
        path: 'package.json',
        content: JSON.stringify({ imports: { '#gen': './index.ts' } }),
      },
    ];
    // outputDir points to a deep path with no package.json above it
    const result = await mergeImportsToPackageJson(files, deepDir);
    expect(result).toBe(false);
  });

  it('writes imports to ancestor package.json when they differ', async () => {
    // Create a package.json in tmpDir
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test-pkg' }, null, 2));

    const files: GeneratedFile[] = [
      {
        path: 'package.json',
        content: JSON.stringify({ imports: { '#gen': './index.ts' } }),
      },
    ];

    const result = await mergeImportsToPackageJson(files, tmpDir);
    expect(result).toBe(true);

    // Verify the imports were written
    const pkg = JSON.parse(await Bun.file(join(tmpDir, 'package.json')).text());
    expect(pkg.imports).toEqual({ '#gen': './index.ts' });
  });

  it('returns false when imports already match', async () => {
    const imports = { '#gen': './index.ts' };
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'test-pkg', imports }, null, 2),
    );

    const files: GeneratedFile[] = [{ path: 'package.json', content: JSON.stringify({ imports }) }];

    const result = await mergeImportsToPackageJson(files, tmpDir);
    expect(result).toBe(false);
  });
});
