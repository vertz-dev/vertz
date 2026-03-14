import { describe, it } from 'bun:test';
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
    const _check1: 'added' | 'modified' | 'deleted' = {} as FileChange['kind'];
    const _check2: FileChange['kind'] = {} as 'added' | 'modified' | 'deleted';
    void _check1;
    void _check2;
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
    const _check: { kind: string } = {} as IncrementalResult;
    void _check;
  });
});

describe('IncrementalCompiler', () => {
  it('constructor requires Compiler', () => {
    const _check1: [Compiler] = {} as ConstructorParameters<typeof IncrementalCompiler>;
    const _check2: ConstructorParameters<typeof IncrementalCompiler> = {} as [Compiler];
    void _check1;
    void _check2;
  });

  it('handleChanges returns Promise<IncrementalResult>', () => {
    const _check: IncrementalResult = {} as Awaited<
      ReturnType<IncrementalCompiler['handleChanges']>
    >;
    void _check;
  });
});

describe('TypecheckResult', () => {
  it('includes diagnostics array', () => {
    const _check: unknown[] = {} as TypecheckResult['diagnostics'];
    void _check;
  });

  it('includes success boolean', () => {
    const _check: boolean = {} as TypecheckResult['success'];
    void _check;
  });
});
