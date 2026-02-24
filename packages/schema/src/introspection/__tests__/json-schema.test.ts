import { describe, expect, it } from 'bun:test';
import { ErrorCode } from '../../core/errors';
import type { ParseContext } from '../../core/parse-context';
import { Schema } from '../../core/schema';
import { SchemaType } from '../../core/types';
import { RefTracker, toJSONSchema } from '../json-schema';

class TestSchema extends Schema<string> {
  _parse(value: unknown, ctx: ParseContext): string {
    if (typeof value !== 'string') {
      ctx.addIssue({ code: ErrorCode.InvalidType, message: 'Expected string' });
      return value as string;
    }
    return value;
  }
  _schemaType(): SchemaType {
    return SchemaType.String;
  }
  _toJSONSchema(): Record<string, unknown> {
    return { type: 'string' };
  }
  _clone(): TestSchema {
    return this._cloneBase(new TestSchema());
  }
}

describe('RefTracker', () => {
  it('tracks seen ids and builds $defs', () => {
    const tracker = new RefTracker();

    expect(tracker.hasSeen('User')).toBe(false);
    tracker.markSeen('User');
    expect(tracker.hasSeen('User')).toBe(true);

    tracker.addDef('User', { type: 'object' });
    expect(tracker.getDefs()).toEqual({ User: { type: 'object' } });
  });
});

describe('toJSONSchema standalone', () => {
  it('delegates to schema.toJSONSchema()', () => {
    const schema = new TestSchema();
    expect(toJSONSchema(schema)).toEqual({ type: 'string' });
  });
});
