import { describe, expectTypeOf, it } from 'vitest';
import type { Compiler } from '../compiler';
import type {
  FileCategory,
  FileChange,
  IncrementalCompiler,
  IncrementalResult,
} from '../incremental';
import type { TypecheckResult } from '../typecheck';

describe('FileChange', () => {
  it('kind is a union type', () => {
    expectTypeOf<FileChange['kind']>().toEqualTypeOf<'added' | 'modified' | 'deleted'>();
  });
});

describe('FileCategory', () => {
  it('has no unknown variant', () => {
    // @ts-expect-error - 'unknown' is not a valid FileCategory
    const _bad: FileCategory = 'unknown';
  });
});

describe('IncrementalResult', () => {
  it('is a discriminated union on kind', () => {
    expectTypeOf<IncrementalResult>().toMatchTypeOf<{ kind: string }>();
  });
});

describe('IncrementalCompiler', () => {
  it('constructor requires Compiler', () => {
    expectTypeOf<ConstructorParameters<typeof IncrementalCompiler>>().toEqualTypeOf<[Compiler]>();
  });

  it('handleChanges returns Promise<IncrementalResult>', () => {
    expectTypeOf<
      IncrementalCompiler['handleChanges']
    >().returns.resolves.toMatchTypeOf<IncrementalResult>();
  });
});

describe('TypecheckResult', () => {
  it('includes diagnostics array', () => {
    expectTypeOf<TypecheckResult['diagnostics']>().toBeArray();
  });

  it('includes success boolean', () => {
    expectTypeOf<TypecheckResult['success']>().toBeBoolean();
  });
});
