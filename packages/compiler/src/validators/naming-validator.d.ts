import type { Validator } from '../compiler';
import type { Diagnostic } from '../errors';
import type { AppIR } from '../ir/types';
export interface ParsedSchemaName {
  operation: string | null;
  entity: string | null;
  part: string | null;
}
export type ValidOperation = 'create' | 'read' | 'update' | 'list' | 'delete';
export type ValidPart = 'Body' | 'Response' | 'Query' | 'Params' | 'Headers';
export declare class NamingValidator implements Validator {
  validate(ir: AppIR): Promise<Diagnostic[]>;
  parseSchemaName(name: string): ParsedSchemaName;
  private suggestFix;
}
//# sourceMappingURL=naming-validator.d.ts.map
