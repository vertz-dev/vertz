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
    expectTypeOf(fs.exists('/tmp')).toEqualTypeOf<Promise<Result<boolean, DesktopError>>>();
  });
});

// ── fs.stat ──

describe('Feature: fs.stat type safety', () => {
  it('Returns Promise<Result<FileStat, DesktopError>>', () => {
    expectTypeOf(fs.stat('/tmp')).toEqualTypeOf<Promise<Result<FileStat, DesktopError>>>();
  });
});

// ── fs.readDir ──

describe('Feature: fs.readDir type safety', () => {
  it('Returns Promise<Result<DirEntry[], DesktopError>>', () => {
    expectTypeOf(fs.readDir('/tmp')).toEqualTypeOf<Promise<Result<DirEntry[], DesktopError>>>();
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
    expectTypeOf(fs.createDir('/tmp/new')).toEqualTypeOf<Promise<Result<void, DesktopError>>>();
  });
});

// ── fs.remove ──

describe('Feature: fs.remove type safety', () => {
  it('Returns Promise<Result<void, DesktopError>>', () => {
    expectTypeOf(fs.remove('/tmp/old.txt')).toEqualTypeOf<Promise<Result<void, DesktopError>>>();
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

// ── fs.readBinaryFile ──

describe('Feature: fs.readBinaryFile type safety', () => {
  describe('Given fs.readBinaryFile called with a path', () => {
    it('Then returns Promise<Result<Uint8Array, DesktopError>>', () => {
      expectTypeOf(fs.readBinaryFile('/tmp/image.png')).toEqualTypeOf<
        Promise<Result<Uint8Array, DesktopError>>
      >();
    });
  });

  describe('Given fs.readBinaryFile called with options', () => {
    it('Then returns Promise<Result<Uint8Array, DesktopError>>', () => {
      expectTypeOf(fs.readBinaryFile('/tmp/image.png', { timeout: 5000 })).toEqualTypeOf<
        Promise<Result<Uint8Array, DesktopError>>
      >();
    });
  });

  describe('Given wrong argument type', () => {
    it('Then produces a type error', () => {
      // @ts-expect-error path must be a string
      fs.readBinaryFile(42);
    });
  });
});

// ── fs.writeBinaryFile ──

describe('Feature: fs.writeBinaryFile type safety', () => {
  describe('Given fs.writeBinaryFile called with path and Uint8Array', () => {
    it('Then returns Promise<Result<void, DesktopError>>', () => {
      expectTypeOf(fs.writeBinaryFile('/tmp/out.bin', new Uint8Array(8))).toEqualTypeOf<
        Promise<Result<void, DesktopError>>
      >();
    });
  });

  describe('Given fs.writeBinaryFile called with options', () => {
    it('Then returns Promise<Result<void, DesktopError>>', () => {
      expectTypeOf(
        fs.writeBinaryFile('/tmp/out.bin', new Uint8Array(8), { timeout: 5000 }),
      ).toEqualTypeOf<Promise<Result<void, DesktopError>>>();
    });
  });

  describe('Given missing data argument', () => {
    it('Then produces a type error', () => {
      // @ts-expect-error data is required
      fs.writeBinaryFile('/tmp/out.bin');
    });
  });

  describe('Given wrong data type (string)', () => {
    it('Then produces a type error', () => {
      // @ts-expect-error data must be Uint8Array, not string
      fs.writeBinaryFile('/tmp/out.bin', 'not binary');
    });
  });

  describe('Given wrong data type (ArrayBuffer)', () => {
    it('Then produces a type error', () => {
      // @ts-expect-error data must be Uint8Array, not ArrayBuffer
      fs.writeBinaryFile('/tmp/out.bin', new ArrayBuffer(8));
    });
  });
});

// ── fs.readBinaryStream ──

describe('Feature: fs.readBinaryStream type safety', () => {
  describe('Given fs.readBinaryStream called with a path', () => {
    it('Then returns Promise<Result<ReadableStream<Uint8Array>, DesktopError>>', () => {
      expectTypeOf(fs.readBinaryStream('/tmp/large.bin')).toEqualTypeOf<
        Promise<Result<ReadableStream<Uint8Array>, DesktopError>>
      >();
    });
  });

  describe('Given fs.readBinaryStream called with options', () => {
    it('Then returns Promise<Result<ReadableStream<Uint8Array>, DesktopError>>', () => {
      expectTypeOf(fs.readBinaryStream('/tmp/large.bin', { timeout: 30000 })).toEqualTypeOf<
        Promise<Result<ReadableStream<Uint8Array>, DesktopError>>
      >();
    });
  });

  describe('Given wrong argument type', () => {
    it('Then produces a type error', () => {
      // @ts-expect-error path must be a string
      fs.readBinaryStream(42);
    });
  });
});

// ── fs.writeBinaryStream ──

describe('Feature: fs.writeBinaryStream type safety', () => {
  describe('Given fs.writeBinaryStream called with path and ReadableStream', () => {
    it('Then returns Promise<Result<void, DesktopError>>', () => {
      expectTypeOf(
        fs.writeBinaryStream('/tmp/out.bin', new ReadableStream<Uint8Array>()),
      ).toEqualTypeOf<Promise<Result<void, DesktopError>>>();
    });
  });

  describe('Given fs.writeBinaryStream called with options', () => {
    it('Then returns Promise<Result<void, DesktopError>>', () => {
      expectTypeOf(
        fs.writeBinaryStream('/tmp/out.bin', new ReadableStream<Uint8Array>(), { timeout: 30000 }),
      ).toEqualTypeOf<Promise<Result<void, DesktopError>>>();
    });
  });

  describe('Given missing data argument', () => {
    it('Then produces a type error', () => {
      // @ts-expect-error data is required
      fs.writeBinaryStream('/tmp/out.bin');
    });
  });

  describe('Given wrong data type (Uint8Array instead of ReadableStream)', () => {
    it('Then produces a type error', () => {
      // @ts-expect-error data must be ReadableStream, not Uint8Array
      fs.writeBinaryStream('/tmp/out.bin', new Uint8Array(8));
    });
  });

  describe('Given wrong stream element type (string instead of Uint8Array)', () => {
    it('Then produces a type error', () => {
      // @ts-expect-error data must be ReadableStream<Uint8Array>, not ReadableStream<string>
      fs.writeBinaryStream('/tmp/out.bin', new ReadableStream<string>());
    });
  });
});
