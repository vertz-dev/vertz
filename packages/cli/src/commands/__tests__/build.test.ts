import type { AppIR, CompileResult, Compiler, Diagnostic } from '@vertz/compiler';
import { describe, expect, it, vi } from 'vitest';
import { buildAction } from '../build';

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
  const hasErrors = diagnostics.some((d) => d.severity === 'error');
  return {
    analyze: vi.fn().mockResolvedValue(ir),
    validate: vi.fn().mockResolvedValue(diagnostics),
    generate: vi.fn().mockResolvedValue(undefined),
    compile: vi.fn().mockResolvedValue({
      success: !hasErrors,
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

describe('buildAction', () => {
  it('returns success when compilation has no errors', async () => {
    const compiler = createMockCompiler([]);
    const result = await buildAction({ compiler });
    expect(result.success).toBe(true);
  });

  it('calls compiler.compile()', async () => {
    const compiler = createMockCompiler([]);
    await buildAction({ compiler });
    expect(compiler.compile).toHaveBeenCalled();
  });

  it('returns failure when compilation has errors', async () => {
    const compiler = createMockCompiler([makeDiagnostic()]);
    const result = await buildAction({ compiler });
    expect(result.success).toBe(false);
  });

  it('includes diagnostics in result', async () => {
    const compiler = createMockCompiler([makeDiagnostic()]);
    const result = await buildAction({ compiler });
    expect(result.diagnostics).toHaveLength(1);
  });

  it('returns success with only warnings', async () => {
    const compiler = createMockCompiler([makeDiagnostic({ severity: 'warning' })]);
    const result = await buildAction({ compiler });
    expect(result.success).toBe(true);
  });

  it('includes output text on success', async () => {
    const compiler = createMockCompiler([]);
    const result = await buildAction({ compiler });
    expect(result.output).toContain('Built successfully');
  });

  it('includes failure message on error', async () => {
    const compiler = createMockCompiler([makeDiagnostic()]);
    const result = await buildAction({ compiler });
    expect(result.output).toContain('Build failed');
  });

  it('respects noEmit option by not calling compile', async () => {
    const compiler = createMockCompiler([]);
    const result = await buildAction({ compiler, noEmit: true });
    expect(result.success).toBe(true);
    expect(compiler.compile).not.toHaveBeenCalled();
    expect(compiler.analyze).toHaveBeenCalled();
    expect(compiler.validate).toHaveBeenCalled();
  });
});
