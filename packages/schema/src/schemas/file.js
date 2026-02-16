import { ErrorCode } from '../core/errors';
import { Schema } from '../core/schema';
import { SchemaType } from '../core/types';
export class FileSchema extends Schema {
  _parse(value, ctx) {
    if (!(value instanceof Blob)) {
      ctx.addIssue({ code: ErrorCode.InvalidType, message: 'Expected File or Blob' });
      return value;
    }
    return value;
  }
  _schemaType() {
    return SchemaType.File;
  }
  _toJSONSchema(_tracker) {
    return { type: 'string', contentMediaType: 'application/octet-stream' };
  }
  _clone() {
    return this._cloneBase(new FileSchema());
  }
}
//# sourceMappingURL=file.js.map
