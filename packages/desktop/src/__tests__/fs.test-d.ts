import { describe, expectTypeOf, it } from 'bun:test';
import type { Result } from '@vertz/errors';
import { fs } from '../index.js';
import type { DesktopError, DirEntry, FileStat } from '../types.js';

// ── fs.readTextFile ──

describe('Feature: fs.readTextFile type safety', () => {
  describe('Given fs.readTextFile called with a path', () => {
    it('Then returns Promise<Result<string, DesktopError>>', () => {
      expectTypeOf(fs.readTextFile('/tmp/test.txt')).toEqualTypeOf<
        Promise<Result<string, DesktopError>>
      >();
    });
  });

  describe('Given wrong argument type', () => {
    it('Then produces a type error', () => {
      // @ts-expect-error path must be a string
      fs.readTextFile(42);
    });
  });
});

// ── fs.writeTextFile ──

describe('Feature: fs.writeTextFile type safety', () => {
  describe('Given fs.writeTextFile called with path and content', () => {
    it('Then returns Promise<Result<void, DesktopError>>', () => {
      expectTypeOf(fs.writeTextFile('/tmp/out.txt', 'hello')).toEqualTypeOf<
        Promise<Result<void, DesktopError>>
      >();
    });
  });

  describe('Given missing content argument', () => {
    it('Then produces a type error', () => {
      // @ts-expect-error content is required
      fs.writeTextFile('/tmp/out.txt');
    });
  });
});

// ── fs.exists ──

describe('Feature: fs.exists type safety', () => {
  it('Returns Promise<Result<boolean, DesktopError>>', () => {
    expectTypeOf(fs.exists('/tmp')).toEqualTypeOf<
      Promise<Result<boolean, DesktopError>>
    >();
  });
});

// ── fs.stat ──

describe('Feature: fs.stat type safety', () => {
  it('Returns Promise<Result<FileStat, DesktopError>>', () => {
    expectTypeOf(fs.stat('/tmp')).toEqualTypeOf<
      Promise<Result<FileStat, DesktopError>>
    >();
  });
});

// ── fs.readDir ──

describe('Feature: fs.readDir type safety', () => {
  it('Returns Promise<Result<DirEntry[], DesktopError>>', () => {
    expectTypeOf(fs.readDir('/tmp')).toEqualTypeOf<
      Promise<Result<DirEntry[], DesktopError>>
    >();
  });
});

// ── fs.createDir ──

describe('Feature: fs.createDir type safety', () => {
  it('Accepts recursive option', () => {
    expectTypeOf(fs.createDir('/tmp/new', { recursive: true })).toEqualTypeOf<
      Promise<Result<void, DesktopError>>
    >();
  });

  it('Works without options', () => {
    expectTypeOf(fs.createDir('/tmp/new')).toEqualTypeOf<
      Promise<Result<void, DesktopError>>
    >();
  });
});

// ── fs.remove ──

describe('Feature: fs.remove type safety', () => {
  it('Returns Promise<Result<void, DesktopError>>', () => {
    expectTypeOf(fs.remove('/tmp/old.txt')).toEqualTypeOf<
      Promise<Result<void, DesktopError>>
    >();
  });
});

// ── fs.rename ──

describe('Feature: fs.rename type safety', () => {
  it('Returns Promise<Result<void, DesktopError>>', () => {
    expectTypeOf(fs.rename('/tmp/a.txt', '/tmp/b.txt')).toEqualTypeOf<
      Promise<Result<void, DesktopError>>
    >();
  });

  describe('Given missing second argument', () => {
    it('Then produces a type error', () => {
      // @ts-expect-error to is required
      fs.rename('/tmp/a.txt');
    });
  });
});
