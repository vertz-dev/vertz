import { ErrorCode } from '../core/errors';
import type { ParseContext } from '../core/parse-context';
import { BigIntSchema } from './bigint';
import { BooleanSchema } from './boolean';
import { DateSchema } from './date';
import { NumberSchema } from './number';
import { StringSchema } from './string';

export class CoercedStringSchema extends StringSchema {
  _parse(value: unknown, ctx: ParseContext): string {
    return super._parse(value == null ? '' : String(value), ctx);
  }

  _clone(): CoercedStringSchema {
    return Object.assign(new CoercedStringSchema(), super._clone());
  }
}

export class CoercedNumberSchema extends NumberSchema {
  _parse(value: unknown, ctx: ParseContext): number {
    return super._parse(Number(value), ctx);
  }

  _clone(): CoercedNumberSchema {
    return Object.assign(new CoercedNumberSchema(), super._clone());
  }
}

export class CoercedBooleanSchema extends BooleanSchema {
  _parse(value: unknown, ctx: ParseContext): boolean {
    return super._parse(Boolean(value), ctx);
  }

  _clone(): CoercedBooleanSchema {
    return Object.assign(new CoercedBooleanSchema(), super._clone());
  }
}

export class CoercedBigIntSchema extends BigIntSchema {
  _parse(value: unknown, ctx: ParseContext): bigint {
    if (typeof value === 'bigint') return super._parse(value, ctx);
    try {
      return super._parse(BigInt(value as string | number | bigint | boolean), ctx);
    } catch {
      ctx.addIssue({ code: ErrorCode.InvalidType, message: 'Expected value coercible to bigint' });
      return value as bigint;
    }
  }

  _clone(): CoercedBigIntSchema {
    return Object.assign(new CoercedBigIntSchema(), super._clone());
  }
}

export class CoercedDateSchema extends DateSchema {
  _parse(value: unknown, ctx: ParseContext): Date {
    if (value instanceof Date) return super._parse(value, ctx);
    return super._parse(new Date(value as string | number), ctx);
  }

  _clone(): CoercedDateSchema {
    return Object.assign(new CoercedDateSchema(), super._clone());
  }
}
