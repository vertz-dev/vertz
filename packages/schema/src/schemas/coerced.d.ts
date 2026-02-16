import type { ParseContext } from '../core/parse-context';
import { BigIntSchema } from './bigint';
import { BooleanSchema } from './boolean';
import { DateSchema } from './date';
import { NumberSchema } from './number';
import { StringSchema } from './string';
export declare class CoercedStringSchema extends StringSchema {
  _parse(value: unknown, ctx: ParseContext): string;
  _clone(): this;
}
export declare class CoercedNumberSchema extends NumberSchema {
  _parse(value: unknown, ctx: ParseContext): number;
  _clone(): CoercedNumberSchema;
}
export declare class CoercedBooleanSchema extends BooleanSchema {
  _parse(value: unknown, ctx: ParseContext): boolean;
  _clone(): CoercedBooleanSchema;
}
export declare class CoercedBigIntSchema extends BigIntSchema {
  _parse(value: unknown, ctx: ParseContext): bigint;
  _clone(): CoercedBigIntSchema;
}
export declare class CoercedDateSchema extends DateSchema {
  _parse(value: unknown, ctx: ParseContext): Date;
  _clone(): CoercedDateSchema;
}
//# sourceMappingURL=coerced.d.ts.map
