import { describe, it } from 'vitest';
import { createEmptyDependencyGraph } from '../ir/builder';

describe('type-level: IR types', () => {
  it('AppIR requires app field', () => {
    // @ts-expect-error — AppIR without 'app' field should be rejected
    const _bad = {
      modules: [],
      middleware: [],
      schemas: [],
      dependencyGraph: createEmptyDependencyGraph(),
      diagnostics: [],
    };
  });
  it('RouteIR.method only accepts valid HttpMethod', () => {
    const _bad = {
      // @ts-expect-error — 'INVALID' is not a valid HttpMethod
      method: 'INVALID',
      path: '/',
      fullPath: '/',
      operationId: 'test',
      middleware: [],
      tags: [],
      sourceFile: '',
      sourceLine: 0,
      sourceColumn: 0,
    };
    void _bad;
  });
  it('DependencyNodeKind only accepts valid kinds', () => {
    // @ts-expect-error — 'unknown' is not a valid DependencyNodeKind
    const _bad = { id: '1', kind: 'unknown', name: 'test' };
    void _bad;
  });
  it('DependencyEdgeKind only accepts valid kinds', () => {
    // @ts-expect-error — 'unknown' is not a valid DependencyEdgeKind
    const _bad = { from: '1', to: '2', kind: 'unknown' };
    void _bad;
  });
});
describe('type-level: Diagnostic types', () => {
  it('DiagnosticCode only accepts known codes', () => {
    // @ts-expect-error — 'VERTZ_FAKE_CODE' is not a valid DiagnosticCode
    const _bad = { severity: 'error', code: 'VERTZ_FAKE_CODE', message: 'bad' };
    void _bad;
  });
  it('Diagnostic severity only accepts valid values', () => {
    // @ts-expect-error — 'critical' is not a valid DiagnosticSeverity
    const _bad = { severity: 'critical', code: 'VERTZ_APP_MISSING', message: 'bad' };
    void _bad;
  });
});
describe('type-level: Config types', () => {
  it('VertzConfig accepts partial compiler config', () => {
    const config = { strict: true, compiler: { sourceDir: 'app' } };
    void config;
  });
  it('ResolvedConfig requires all fields (no optionals)', () => {
    // @ts-expect-error — ResolvedConfig with missing compiler field should be rejected
    const _bad = { strict: true, forceGenerate: false };
    void _bad;
  });
});
describe('type-level: SchemaRef discriminated union', () => {
  it('narrows via kind field', () => {
    const ref = {};
    if (ref.kind === 'named') {
      const name = ref.schemaName;
      void name;
    }
    // @ts-expect-error — schemaName not accessible without narrowing
    const _bad = ref.schemaName;
  });
});
describe('type-level: SchemaIR moduleName', () => {
  it('SchemaIR without moduleName should be rejected', () => {
    // @ts-expect-error — SchemaIR requires moduleName field
    const _bad = {
      name: 'createUserBody',
      sourceFile: 'test.ts',
      sourceLine: 1,
      sourceColumn: 0,
      namingConvention: {},
      isNamed: false,
    };
    void _bad;
  });
});
describe('type-level: ModuleDefContext', () => {
  it('moduleDefVariables is Map<string, string>', () => {
    // @ts-expect-error — Map<string, number> is not assignable to Map<string, string>
    const _bad = { moduleDefVariables: new Map() };
    void _bad;
  });
});
//# sourceMappingURL=ir-types.test-d.js.map
