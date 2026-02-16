import { ErrorCode } from '../core/errors';
import { Schema } from '../core/schema';
import { SchemaType } from '../core/types';
export class IntersectionSchema extends Schema {
  _left;
  _right;
  constructor(left, right) {
    super();
    this._left = left;
    this._right = right;
  }
  _parse(value, ctx) {
    const leftResult = this._left.safeParse(value);
    const rightResult = this._right.safeParse(value);
    if (!leftResult.success || !rightResult.success) {
      ctx.addIssue({
        code: ErrorCode.InvalidIntersection,
        message: 'Value does not satisfy intersection',
      });
      return value;
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
  _schemaType() {
    return SchemaType.Intersection;
  }
  _toJSONSchema(tracker) {
    return {
      allOf: [
        this._left._toJSONSchemaWithRefs(tracker),
        this._right._toJSONSchemaWithRefs(tracker),
      ],
    };
  }
  _clone() {
    return this._cloneBase(new IntersectionSchema(this._left, this._right));
  }
}
//# sourceMappingURL=intersection.js.map
