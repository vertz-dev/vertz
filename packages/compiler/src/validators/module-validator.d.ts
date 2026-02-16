import type { Validator } from '../compiler';
import type { Diagnostic } from '../errors';
import type { AppIR } from '../ir/types';
export declare class ModuleValidator implements Validator {
  validate(ir: AppIR): Promise<Diagnostic[]>;
  private checkExports;
  private checkOwnership;
  private checkCircularDependencies;
}
//# sourceMappingURL=module-validator.d.ts.map
