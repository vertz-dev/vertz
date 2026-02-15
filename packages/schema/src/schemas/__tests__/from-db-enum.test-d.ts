import { describe, expectTypeOf, it } from 'vitest';
import { s } from '../../index';

describe('s.fromDbEnum type inference', () => {
  it('infers the correct union type from db enum values', () => {
    const dbColumn = {
      _meta: {
        enumValues: ['todo', 'in_progress', 'done'] as const,
      },
    };

    const schema = s.fromDbEnum(dbColumn);
    type Result = ReturnType<typeof schema.parse>;
    expectTypeOf<Result>().toEqualTypeOf<'todo' | 'in_progress' | 'done'>();
  });

  it('rejects columns without enumValues at type level', () => {
    const textColumn = {
      _meta: {} as { enumValues?: undefined },
    };

    // @ts-expect-error - should not accept columns without const enum values
    s.fromDbEnum(textColumn);
  });
});
