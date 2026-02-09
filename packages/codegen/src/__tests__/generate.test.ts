import { describe, expect, it } from 'vitest';
import type { ResolvedCodegenConfig } from '../config';
import { generate } from '../generate';
import type { CodegenAuth, CodegenIR, CodegenModule, CodegenSchema } from '../types';

// ── Fixture helpers ──────────────────────────────────────────────

function makeAuth(overrides: Partial<CodegenAuth> = {}): CodegenAuth {
  return { schemes: [], ...overrides };
}

function makeSchema(overrides: Partial<CodegenSchema> = {}): CodegenSchema {
  return {
    name: 'TestSchema',
    jsonSchema: { type: 'object' },
    annotations: { namingParts: {} },
    ...overrides,
  };
}

function makeModule(overrides: Partial<CodegenModule> = {}): CodegenModule {
  return {
    name: 'test',
    operations: [
      {
        operationId: 'listTests',
        method: 'GET',
        path: '/api/v1/tests',
        tags: [],
        schemaRefs: {},
      },
    ],
    ...overrides,
  };
}

function makeIR(overrides: Partial<CodegenIR> = {}): CodegenIR {
  return {
    basePath: '/api/v1',
    modules: [makeModule()],
    schemas: [],
    auth: makeAuth(),
    ...overrides,
  };
}

function makeConfig(overrides: Partial<ResolvedCodegenConfig> = {}): ResolvedCodegenConfig {
  return {
    generators: ['typescript'],
    outputDir: '.vertz/generated',
    ...overrides,
  };
}

// ── generate() ───────────────────────────────────────────────────

describe('generate', () => {
  it('returns generated files for the typescript generator', () => {
    const ir = makeIR();
    const config = makeConfig({ generators: ['typescript'] });

    const result = generate(ir, config);

    expect(result.files.length).toBeGreaterThan(0);
  });

  it('returns files with path and content properties', () => {
    const ir = makeIR();
    const config = makeConfig();

    const result = generate(ir, config);

    for (const file of result.files) {
      expect(file).toHaveProperty('path');
      expect(file).toHaveProperty('content');
      expect(typeof file.path).toBe('string');
      expect(typeof file.content).toBe('string');
    }
  });

  it('generates files including client.ts for the typescript generator', () => {
    const ir = makeIR();
    const config = makeConfig({ generators: ['typescript'] });

    const result = generate(ir, config);
    const paths = result.files.map((f) => f.path);

    expect(paths).toContain('client.ts');
  });

  it('generates type files for each module', () => {
    const ir = makeIR({
      modules: [makeModule({ name: 'users' }), makeModule({ name: 'billing' })],
    });
    const config = makeConfig({ generators: ['typescript'] });

    const result = generate(ir, config);
    const paths = result.files.map((f) => f.path);

    expect(paths).toContain('types/users.ts');
    expect(paths).toContain('types/billing.ts');
  });

  it('generates index.ts barrel file', () => {
    const ir = makeIR();
    const config = makeConfig({ generators: ['typescript'] });

    const result = generate(ir, config);
    const paths = result.files.map((f) => f.path);

    expect(paths).toContain('index.ts');
  });

  it('generates CLI manifest when cli generator is included', () => {
    const ir = makeIR();
    const config = makeConfig({ generators: ['cli'] });

    const result = generate(ir, config);
    const paths = result.files.map((f) => f.path);

    expect(paths).toContain('cli/manifest.ts');
  });

  it('generates both SDK and CLI files when both generators are configured', () => {
    const ir = makeIR();
    const config = makeConfig({ generators: ['typescript', 'cli'] });

    const result = generate(ir, config);
    const paths = result.files.map((f) => f.path);

    expect(paths).toContain('client.ts');
    expect(paths).toContain('cli/manifest.ts');
  });

  it('includes the generator name in the result', () => {
    const ir = makeIR();
    const config = makeConfig({ generators: ['typescript'] });

    const result = generate(ir, config);

    expect(result.generators).toContain('typescript');
  });

  it('returns file count in the result', () => {
    const ir = makeIR();
    const config = makeConfig({ generators: ['typescript'] });

    const result = generate(ir, config);

    expect(result.fileCount).toBe(result.files.length);
  });

  it('generates schemas.ts when IR has schemas', () => {
    const ir = makeIR({
      schemas: [makeSchema({ name: 'User' })],
    });
    const config = makeConfig({ generators: ['typescript'] });

    const result = generate(ir, config);
    const paths = result.files.map((f) => f.path);

    expect(paths).toContain('schemas.ts');
  });
});
