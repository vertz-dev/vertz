import { describe, it } from 'vitest';
import type {
  AppIR,
  DependencyEdge,
  DependencyNode,
  ModuleDefContext,
  RouteIR,
  SchemaRef,
} from '../ir/types';
import { createEmptyDependencyGraph } from '../ir/builder';
import type { Diagnostic } from '../errors';
import type { ResolvedConfig, VertzConfig } from '../config';

describe('type-level: IR types', () => {
  it('AppIR requires app field', () => {
    // @ts-expect-error — AppIR without 'app' field should be rejected
    const _bad: AppIR = {
      modules: [],
      middleware: [],
      schemas: [],
      dependencyGraph: createEmptyDependencyGraph(),
      diagnostics: [],
    };
  });

  it('RouteIR.method only accepts valid HttpMethod', () => {
    const _bad: RouteIR = {
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
    const _bad: DependencyNode = { id: '1', kind: 'unknown', name: 'test' };
    void _bad;
  });

  it('DependencyEdgeKind only accepts valid kinds', () => {
    // @ts-expect-error — 'unknown' is not a valid DependencyEdgeKind
    const _bad: DependencyEdge = { from: '1', to: '2', kind: 'unknown' };
    void _bad;
  });
});

describe('type-level: Diagnostic types', () => {
  it('DiagnosticCode only accepts known codes', () => {
    // @ts-expect-error — 'VERTZ_FAKE_CODE' is not a valid DiagnosticCode
    const _bad: Diagnostic = { severity: 'error', code: 'VERTZ_FAKE_CODE', message: 'bad' };
    void _bad;
  });

  it('Diagnostic severity only accepts valid values', () => {
    // @ts-expect-error — 'critical' is not a valid DiagnosticSeverity
    const _bad: Diagnostic = { severity: 'critical', code: 'VERTZ_APP_MISSING', message: 'bad' };
    void _bad;
  });
});

describe('type-level: Config types', () => {
  it('VertzConfig accepts partial compiler config', () => {
    const config: VertzConfig = { strict: true, compiler: { sourceDir: 'app' } };
    void config;
  });

  it('ResolvedConfig requires all fields (no optionals)', () => {
    // @ts-expect-error — ResolvedConfig with missing compiler field should be rejected
    const _bad: ResolvedConfig = { strict: true, forceGenerate: false };
    void _bad;
  });
});

describe('type-level: SchemaRef discriminated union', () => {
  it('narrows via kind field', () => {
    const ref: SchemaRef = {} as SchemaRef;
    if (ref.kind === 'named') {
      const name: string = ref.schemaName;
      void name;
    }
    // @ts-expect-error — schemaName not accessible without narrowing
    const _bad: string = ref.schemaName;
  });
});

describe('type-level: ModuleDefContext', () => {
  it('moduleDefVariables is Map<string, string>', () => {
    // @ts-expect-error — Map<string, number> is not assignable to Map<string, string>
    const _bad: ModuleDefContext = { moduleDefVariables: new Map<string, number>() };
    void _bad;
  });
});
