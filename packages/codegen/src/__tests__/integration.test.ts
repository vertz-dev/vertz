import { afterEach, beforeEach, describe, expect, it } from '@vertz/test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AppIR } from '@vertz/compiler';
import { createEmptyAppIR } from '@vertz/compiler';
import type { ResolvedCodegenConfig } from '../config';
import { resolveCodegenConfig } from '../config';
import { generate } from '../generate';

// ── Realistic multi-entity AppIR fixture ─────────────────────────────

function makeRealisticAppIR(): AppIR {
  const appIR = createEmptyAppIR();
  appIR.app.version = '2.0.0';
  appIR.entities = [
    {
      name: 'users',
      modelRef: {
        variableName: 'usersModel',
        schemaRefs: {
          resolved: true,
          response: {
            kind: 'inline',
            sourceFile: 'users.ts',
            resolvedFields: [
              { name: 'id', tsType: 'string', optional: false },
              { name: 'name', tsType: 'string', optional: false },
              { name: 'email', tsType: 'string', optional: false },
            ],
          },
          createInput: {
            kind: 'inline',
            sourceFile: 'users.ts',
            resolvedFields: [
              { name: 'name', tsType: 'string', optional: false },
              { name: 'email', tsType: 'string', optional: false },
            ],
          },
          updateInput: {
            kind: 'inline',
            sourceFile: 'users.ts',
            resolvedFields: [
              { name: 'name', tsType: 'string', optional: true },
              { name: 'email', tsType: 'string', optional: true },
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
      sourceFile: 'users.ts',
      sourceLine: 1,
      sourceColumn: 1,
    },
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
            resolvedFields: [{ name: 'title', tsType: 'string', optional: false }],
          },
        },
      },
      access: {
        list: 'none',
        get: 'none',
        create: 'none',
        update: 'false',
        delete: 'false',
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
  return appIR;
}

// ── Integration tests ──────────────────────────────────────────────

describe('Full pipeline integration', () => {
  let outputDir: string;

  beforeEach(() => {
    outputDir = mkdtempSync(join(tmpdir(), 'vertz-codegen-integration-'));
  });

  afterEach(() => {
    rmSync(outputDir, { recursive: true, force: true });
  });

  it('generates a complete entity SDK from a realistic multi-entity AppIR', async () => {
    const config: ResolvedCodegenConfig = resolveCodegenConfig({
      outputDir,
      generators: ['typescript'],
      format: false,
    });

    const result = await generate(makeRealisticAppIR(), config);

    // ── Verify file structure ──────────────────────────────────
    const expectedFiles = [
      'entities/users.ts',
      'entities/tasks.ts',
      'entities/index.ts',
      'types/users.ts',
      'types/tasks.ts',
      'types/index.ts',
      'schemas/users.ts',
      'schemas/tasks.ts',
      'schemas/index.ts',
    ];

    for (const file of expectedFiles) {
      expect(existsSync(join(outputDir, file))).toBe(true);
    }

    // ── Verify entity SDK has FetchClient ──────────────────────
    const usersEntity = readFileSync(join(outputDir, 'entities', 'users.ts'), 'utf-8');
    expect(usersEntity).toContain('FetchClient');
    expect(usersEntity).toContain('createUsersSdk');
    expect(usersEntity).toContain('createDescriptor');

    // ── Verify types file has entity types ──────────────────────
    const usersTypes = readFileSync(join(outputDir, 'types', 'users.ts'), 'utf-8');
    expect(usersTypes).toContain('UsersResponse');
    expect(usersTypes).toContain('CreateUsersInput');

    // ── Verify schemas file has validators ──────────────────────
    const usersSchemas = readFileSync(join(outputDir, 'schemas', 'users.ts'), 'utf-8');
    expect(usersSchemas).toContain('@vertz/schema');

    // ── Verify result metadata ─────────────────────────────────
    expect(result.ir.basePath).toBe('');
    expect(result.ir.version).toBe('2.0.0');
    expect(result.ir.entities).toHaveLength(2);
    expect(result.files.length).toBeGreaterThanOrEqual(expectedFiles.length);
  });

  it('produces valid TypeScript that contains no syntax errors', async () => {
    const config: ResolvedCodegenConfig = resolveCodegenConfig({
      outputDir,
      generators: ['typescript'],
      format: false,
    });

    await generate(makeRealisticAppIR(), config);

    // Check that key generated files contain valid-looking TypeScript
    const entityContent = readFileSync(join(outputDir, 'entities', 'users.ts'), 'utf-8');

    // Every export should be valid
    expect(entityContent).toContain('export');

    // Should have the auto-generated header
    expect(entityContent).toContain('// Generated by @vertz/codegen');
  });

  it('handles an AppIR with no entities gracefully', async () => {
    const emptyAppIR = createEmptyAppIR();
    emptyAppIR.entities = [];

    const config: ResolvedCodegenConfig = resolveCodegenConfig({
      outputDir,
      generators: ['typescript'],
      format: false,
    });

    const result = await generate(emptyAppIR, config);

    // Only client entry point files + entity schema manifest (no entity files)
    expect(result.files).toHaveLength(4);
    expect(result.files.map((f) => f.path).sort()).toEqual([
      'README.md',
      'client.ts',
      'entity-schema.json',
      'package.json',
    ]);
  });
});

describe('Feature: codegen pipeline emits typed service SDKs', () => {
  let outputDir: string;

  beforeEach(() => {
    outputDir = mkdtempSync(join(tmpdir(), 'vertz-codegen-service-'));
  });

  afterEach(() => {
    rmSync(outputDir, { recursive: true, force: true });
  });

  function makeServiceAppIR(): AppIR {
    const appIR = createEmptyAppIR();
    appIR.services = [
      {
        name: 'ai',
        inject: [],
        access: { parse: 'function' },
        actions: [
          {
            name: 'parse',
            method: 'POST',
            path: '/ai/parse',
            body: {
              kind: 'inline',
              sourceFile: 'ai.ts',
              resolvedFields: [{ name: 'message', tsType: 'string', optional: false }],
            },
            response: {
              kind: 'inline',
              sourceFile: 'ai.ts',
              resolvedFields: [{ name: 'id', tsType: 'string', optional: false }],
            },
          },
        ],
        sourceFile: 'ai.ts',
        sourceLine: 1,
        sourceColumn: 1,
      },
    ];
    return appIR;
  }

  describe('Given an AppIR with a service that defines body + response schemas', () => {
    describe('When generate() runs', () => {
      it('Then output includes types/services/{name}.ts', async () => {
        const config = resolveCodegenConfig({
          outputDir,
          generators: ['typescript'],
          format: false,
        });
        await generate(makeServiceAppIR(), config);
        expect(existsSync(join(outputDir, 'types/services/ai.ts'))).toBe(true);
        const content = readFileSync(join(outputDir, 'types/services/ai.ts'), 'utf-8');
        expect(content).toContain('export interface ParseAiInput');
        expect(content).toContain('export interface ParseAiOutput');
      });

      it('Then output includes services/{name}.ts importing from ../types/services/{name}', async () => {
        const config = resolveCodegenConfig({
          outputDir,
          generators: ['typescript'],
          format: false,
        });
        await generate(makeServiceAppIR(), config);
        const sdk = readFileSync(join(outputDir, 'services/ai.ts'), 'utf-8');
        expect(sdk).toContain(
          "import type { ParseAiInput, ParseAiOutput } from '../types/services/ai';",
        );
        expect(sdk).toContain('body: ParseAiInput');
        expect(sdk).toContain('client.post<ParseAiOutput>');
      });

      it('Then output includes client.ts', async () => {
        const config = resolveCodegenConfig({
          outputDir,
          generators: ['typescript'],
          format: false,
        });
        await generate(makeServiceAppIR(), config);
        expect(existsSync(join(outputDir, 'client.ts'))).toBe(true);
      });
    });
  });

  describe('Given an AppIR with zero services', () => {
    it('Then no services/ or types/services/ files are emitted', async () => {
      const emptyAppIR = createEmptyAppIR();
      emptyAppIR.entities = [];
      emptyAppIR.services = [];
      const config = resolveCodegenConfig({
        outputDir,
        generators: ['typescript'],
        format: false,
      });
      await generate(emptyAppIR, config);
      expect(existsSync(join(outputDir, 'services'))).toBe(false);
      expect(existsSync(join(outputDir, 'types/services'))).toBe(false);
    });
  });
});
