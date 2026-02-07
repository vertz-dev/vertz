import { Schema } from '../core/schema';
import type { ParseContext } from '../core/parse-context';
import { ErrorCode } from '../core/errors';
import { SchemaType } from '../core/types';
import type { RefTracker } from '../introspection/json-schema';
import type { JSONSchemaObject } from '../introspection/json-schema';

export class FileSchema extends Schema<Blob> {
  _parse(value: unknown, ctx: ParseContext): Blob {
    if (!(value instanceof Blob)) {
      ctx.addIssue({ code: ErrorCode.InvalidType, message: 'Expected File or Blob' });
      return value as Blob;
    }
    return value;
  }

  _schemaType(): SchemaType {
    return SchemaType.File;
  }

  _toJSONSchema(_tracker: RefTracker): JSONSchemaObject {
    return { type: 'string', contentMediaType: 'application/octet-stream' };
  }

  _clone(): FileSchema {
    return this._cloneBase(new FileSchema());
  }
}
