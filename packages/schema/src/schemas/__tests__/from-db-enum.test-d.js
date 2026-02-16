import { describe, expectTypeOf, it } from 'vitest';
import { s } from '../../index';

describe('s.fromDbEnum type inference', () => {
  it('infers the correct union type from db enum values', () => {
    const dbColumn = {
      _meta: {
        enumValues: ['todo', 'in_progress', 'done'],
      },
    };
    const _schema = s.fromDbEnum(dbColumn);
    expectTypeOf().toEqualTypeOf();
  });
  it('rejects columns without enumValues at type level', () => {
    const textColumn = {
      _meta: {},
    };
    // @ts-expect-error - should not accept columns without const enum values
    s.fromDbEnum(textColumn);
  });
});
//# sourceMappingURL=from-db-enum.test-d.js.map
