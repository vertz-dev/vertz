import type { Validator } from '../compiler';
import type { Diagnostic } from '../errors';
import { createDiagnostic } from '../errors';
import type { AppIR, ModuleIR } from '../ir/types';

export class ModuleValidator implements Validator {
  async validate(ir: AppIR): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];

    for (const mod of ir.modules) {
      this.checkExports(mod, diagnostics);
      this.checkOwnership(mod, diagnostics);
    }

    this.checkCircularDependencies(ir, diagnostics);

    return diagnostics;
  }

  private checkExports(mod: ModuleIR, diagnostics: Diagnostic[]): void {
    const serviceNames = new Set(mod.services.map((s) => s.name));
    for (const exp of mod.exports) {
      if (!serviceNames.has(exp)) {
        diagnostics.push(
          createDiagnostic({
            severity: 'error',
            code: 'VERTZ_MODULE_EXPORT_INVALID',
            message: `Module '${mod.name}' exports '${exp}' which is not one of its services.`,
            suggestion: `Either add '${exp}' as a service or remove it from exports.`,
          }),
        );
      }
    }
  }

  private checkOwnership(mod: ModuleIR, diagnostics: Diagnostic[]): void {
    for (const svc of mod.services) {
      if (svc.moduleName !== mod.name) {
        diagnostics.push(
          createDiagnostic({
            severity: 'error',
            code: 'VERTZ_MODULE_WRONG_OWNERSHIP',
            message: `Service '${svc.name}' declares module '${svc.moduleName}' but is listed under module '${mod.name}'.`,
          }),
        );
      }
    }
  }

  private checkCircularDependencies(ir: AppIR, diagnostics: Diagnostic[]): void {
    for (const cycle of ir.dependencyGraph.circularDependencies) {
      const path = [...cycle, cycle.at(0)].join(' -> ');
      diagnostics.push(
        createDiagnostic({
          severity: 'error',
          code: 'VERTZ_MODULE_CIRCULAR',
          message: `Circular dependency detected: ${path}.`,
          suggestion:
            'Break the cycle by extracting shared code into a separate module that both can import.',
        }),
      );
    }
  }
}
