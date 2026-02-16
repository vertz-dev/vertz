import type { Validator } from '../compiler';
import type { Diagnostic } from '../errors';
import type { AppIR } from '../ir/types';
export declare class CompletenessValidator implements Validator {
  validate(ir: AppIR): Promise<Diagnostic[]>;
  private checkResponseSchemas;
  private checkUnusedServices;
  private checkUnreferencedSchemas;
  private checkDIWiring;
  private checkInjectTokens;
  private checkMiddlewareChains;
  private checkModuleOptions;
  private checkRoutePathFormat;
  private checkPathParamMatch;
  private checkDuplicateRoutes;
  private checkCtxKeyCollisions;
}
//# sourceMappingURL=completeness-validator.d.ts.map
