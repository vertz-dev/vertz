import { ParseContext } from '../../core/parse-context';
import { ErrorCode } from '../../core/errors';
import { StringSchema } from '../string';
import type { RefTracker, JSONSchemaObject } from '../../introspection/json-schema';

export abstract class FormatSchema extends StringSchema {
  protected abstract _errorMessage: string;

  protected abstract _validate(value: string): boolean;

  protected _jsonSchemaExtra(): Record<string, unknown> | undefined {
    return undefined;
  }

  _parse(value: unknown, ctx: ParseContext): string {
    const result = super._parse(value, ctx);
    if (ctx.hasIssues()) return result;
    if (!this._validate(result)) {
      ctx.addIssue({ code: ErrorCode.InvalidString, message: this._errorMessage });
    }
    return result;
  }

  _toJSONSchema(tracker: RefTracker): JSONSchemaObject {
    const extra = this._jsonSchemaExtra();
    if (!extra) return super._toJSONSchema(tracker);
    return { ...super._toJSONSchema(tracker), ...extra };
  }

  _clone(): this {
    const Ctor = this.constructor as new () => this;
    return Object.assign(new Ctor(), super._clone());
  }
}
