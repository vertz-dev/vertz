import type { Validator } from '../compiler';
import type { Diagnostic } from '../errors';
import type { AppIR } from '../ir/types';
export declare class PlacementValidator implements Validator {
  validate(ir: AppIR): Promise<Diagnostic[]>;
  private checkFileLocation;
  private checkMixedExports;
}
//# sourceMappingURL=placement-validator.d.ts.map
