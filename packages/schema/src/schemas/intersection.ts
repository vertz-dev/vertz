import { Schema } from '../core/schema';
import { ParseContext } from '../core/parse-context';
import { ErrorCode } from '../core/errors';
import { SchemaType } from '../core/types';
import type { RefTracker, JSONSchemaObject } from '../introspection/json-schema';

export class IntersectionSchema<L extends Schema<any>, R extends Schema<any>> extends Schema<
  L['_output'] & R['_output']
> {
  private readonly _left: L;
  private readonly _right: R;

  constructor(left: L, right: R) {
    super();
    this._left = left;
    this._right = right;
  }

  _parse(value: unknown, ctx: ParseContext): L['_output'] & R['_output'] {
    const leftResult = this._left.safeParse(value);
    const rightResult = this._right.safeParse(value);

    if (!leftResult.success || !rightResult.success) {
      ctx.addIssue({
        code: ErrorCode.InvalidIntersection,
        message: 'Value does not satisfy intersection',
      });
      return value as any;
    }

    if (
      typeof leftResult.data === 'object' &&
      leftResult.data !== null &&
      typeof rightResult.data === 'object' &&
      rightResult.data !== null
    ) {
      return { ...leftResult.data, ...rightResult.data };
    }

    return leftResult.data;
  }

  _schemaType(): SchemaType {
    return SchemaType.Intersection;
  }

  _toJSONSchema(tracker: RefTracker): JSONSchemaObject {
    return {
      allOf: [
        this._left._toJSONSchemaWithRefs(tracker),
        this._right._toJSONSchemaWithRefs(tracker),
      ],
    };
  }

  _clone(): IntersectionSchema<L, R> {
    return this._cloneBase(new IntersectionSchema(this._left, this._right));
  }
}
