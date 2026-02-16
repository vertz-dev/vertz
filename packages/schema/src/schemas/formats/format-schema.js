import { ErrorCode } from '../../core/errors';
import { StringSchema } from '../string';
export class FormatSchema extends StringSchema {
  _jsonSchemaExtra() {
    return undefined;
  }
  _parse(value, ctx) {
    const result = super._parse(value, ctx);
    if (ctx.hasIssues()) return result;
    if (!this._validate(result)) {
      ctx.addIssue({ code: ErrorCode.InvalidString, message: this._errorMessage });
    }
    return result;
  }
  _toJSONSchema(tracker) {
    const extra = this._jsonSchemaExtra();
    if (!extra) return super._toJSONSchema(tracker);
    return { ...super._toJSONSchema(tracker), ...extra };
  }
  _clone() {
    const Ctor = this.constructor;
    return Object.assign(new Ctor(), super._clone());
  }
}
//# sourceMappingURL=format-schema.js.map
