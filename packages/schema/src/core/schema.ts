import { ParseError } from './errors';
import type { SchemaType, SafeParseResult, SchemaMetadata } from './types';
import { ParseContext } from './parse-context';
import { SchemaRegistry } from './registry';
import { RefTracker } from '../introspection/json-schema';
import type { JSONSchemaObject } from '../introspection/json-schema';

export abstract class Schema<O, I = O> {
  /** @internal */ declare readonly _output: O;
  /** @internal */ declare readonly _input: I;
  /** @internal */ _id: string | undefined;
  /** @internal */ _description: string | undefined;
  /** @internal */ _meta: Record<string, unknown> | undefined;
  /** @internal */ _examples: unknown[];

  constructor() {
    this._examples = [];
  }

  /** Validate and return the parsed value. Return value is discarded when `ctx` has issues. */
  abstract _parse(value: unknown, ctx: ParseContext): O;
  abstract _schemaType(): SchemaType;
  abstract _toJSONSchema(tracker: RefTracker): JSONSchemaObject;
  abstract _clone(): Schema<O, I>;

  parse(value: unknown): O {
    const ctx = new ParseContext();
    const result = this._runPipeline(value, ctx);
    if (ctx.hasIssues()) {
      throw new ParseError(ctx.issues);
    }
    return result;
  }

  safeParse(value: unknown): SafeParseResult<O> {
    const ctx = new ParseContext();
    try {
      const data = this._runPipeline(value, ctx);
      if (ctx.hasIssues()) {
        return { success: false, error: new ParseError(ctx.issues) };
      }
      return { success: true, data };
    } catch (e) {
      if (e instanceof ParseError) {
        return { success: false, error: e };
      }
      throw e;
    }
  }

  id(name: string): this {
    const clone = this._clone();
    clone._id = name;
    SchemaRegistry.register(name, clone);
    return clone as this;
  }

  describe(description: string): this {
    const clone = this._clone();
    clone._description = description;
    return clone as this;
  }

  meta(data: Record<string, unknown>): this {
    const clone = this._clone();
    clone._meta = { ...(this._meta ?? {}), ...data };
    return clone as this;
  }

  example(value: I): this {
    const clone = this._clone();
    clone._examples = [...this._examples, value];
    return clone as this;
  }

  get metadata(): SchemaMetadata {
    return {
      type: this._schemaType(),
      id: this._id,
      description: this._description,
      meta: this._meta,
      examples: this._examples,
    };
  }

  toJSONSchema(): JSONSchemaObject {
    const tracker = new RefTracker();
    const schema = this._toJSONSchemaWithRefs(tracker);
    const defs = tracker.getDefs();
    if (Object.keys(defs).length > 0) {
      return { $defs: defs, ...schema };
    }
    return schema;
  }

  _toJSONSchemaWithRefs(tracker: RefTracker): JSONSchemaObject {
    if (this._id && tracker.hasSeen(this._id)) {
      return { $ref: `#/$defs/${this._id}` };
    }
    if (this._id) {
      tracker.markSeen(this._id);
      const jsonSchema = this._toJSONSchema(tracker);
      tracker.addDef(this._id, jsonSchema);
      return { $ref: `#/$defs/${this._id}` };
    }
    return this._toJSONSchema(tracker);
  }

  _runPipeline(value: unknown, ctx: ParseContext): O {
    return this._parse(value, ctx);
  }
}
