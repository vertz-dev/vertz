import type { AppIR, CompileResult, Compiler, Diagnostic } from '@vertz/compiler';
import { describe, expect, it, vi } from 'bun:test';
import { checkAction } from '../check';

function makeDiagnostic(overrides: Partial<Diagnostic> = {}): Diagnostic {
  return {
    severity: 'error',
    code: 'VERTZ_ROUTE_MISSING_RESPONSE',
    message: 'Missing response schema',
    file: 'src/user.router.ts',
    line: 14,
    column: 1,
    ...overrides,
  };
}

function createMockCompiler(diagnostics: Diagnostic[] = []): Compiler {
  const ir = { diagnostics: [] } as unknown as AppIR;
  return {
    analyze: vi.fn().mockResolvedValue(ir),
    validate: vi.fn().mockResolvedValue(diagnostics),
    generate: vi.fn().mockResolvedValue(undefined),
    compile: vi.fn().mockResolvedValue({
      success: diagnostics.every((d) => d.severity !== 'error'),
      ir,
      diagnostics,
    } satisfies CompileResult),
    getConfig: vi.fn().mockReturnValue({
      strict: false,
      forceGenerate: false,
      compiler: {
        sourceDir: 'src',
        outputDir: '.vertz/generated',
        entryFile: 'src/app.ts',
        schemas: { enforceNaming: true, enforcePlacement: true },
        openapi: {
          output: '.vertz/generated/openapi.json',
          info: { title: 'API', version: '1.0.0' },
        },
        validation: { requireResponseSchema: true, detectDeadCode: true },
      },
    }),
  } as unknown as Compiler;
}

describe('checkAction', () => {
  it('returns success result when no diagnostics', async () => {
    const compiler = createMockCompiler([]);
    const result = await checkAction({
      compiler,
      format: 'json',
    });
    expect(result.success).toBe(true);
  });

  it('calls compiler.analyze()', async () => {
    const compiler = createMockCompiler([]);
    await checkAction({ compiler, format: 'json' });
    expect(compiler.analyze).toHaveBeenCalled();
  });

  it('calls compiler.validate() with the IR', async () => {
    const compiler = createMockCompiler([]);
    await checkAction({ compiler, format: 'json' });
    expect(compiler.validate).toHaveBeenCalled();
  });

  it('returns failure when there are error diagnostics', async () => {
    const compiler = createMockCompiler([makeDiagnostic()]);
    const result = await checkAction({ compiler, format: 'json' });
    expect(result.success).toBe(false);
  });

  it('returns success when there are only warnings', async () => {
    const compiler = createMockCompiler([makeDiagnostic({ severity: 'warning' })]);
    const result = await checkAction({ compiler, format: 'json' });
    expect(result.success).toBe(true);
  });

  it('includes diagnostics in the result', async () => {
    const diag = makeDiagnostic();
    const compiler = createMockCompiler([diag]);
    const result = await checkAction({ compiler, format: 'json' });
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe('VERTZ_ROUTE_MISSING_RESPONSE');
  });

  it('returns formatted output for json format', async () => {
    const compiler = createMockCompiler([makeDiagnostic()]);
    const result = await checkAction({ compiler, format: 'json' });
    expect(result.output).toBeDefined();
    const parsed = JSON.parse(result.output);
    expect(parsed.success).toBe(false);
    expect(parsed.diagnostics).toHaveLength(1);
  });

  it('returns formatted output for github format', async () => {
    const compiler = createMockCompiler([makeDiagnostic()]);
    const result = await checkAction({ compiler, format: 'github' });
    expect(result.output).toContain('::error file=src/user.router.ts');
  });

  it('returns formatted output for text format', async () => {
    const compiler = createMockCompiler([makeDiagnostic()]);
    const result = await checkAction({ compiler, format: 'text' });
    expect(result.output).toContain('VERTZ_ROUTE_MISSING_RESPONSE');
    expect(result.output).toContain('Missing response schema');
  });
});
