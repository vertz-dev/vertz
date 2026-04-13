import { describe, expect, it } from '@vertz/test';

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expectTypeOf,
  mock,
  spyOn,
  vi,
} from '../index';

import type {
  AfterAll,
  AfterEach,
  AsymmetricMatcher,
  BeforeAll,
  BeforeEach,
  Describe,
  Expect,
  ExpectTypeOf,
  It,
  Mock,
  MockFunction,
  SpyOn,
  Test,
  Vi,
} from '../index';

// --- Bun runtime bridge ---
// When running under `bun test`, @vertz/test re-exports from bun:test.
// These tests verify the bridge works correctly.
// Tests that use require() are skipped under vtz (no CJS require in ESM modules).

const isBun = typeof Bun !== 'undefined';

describe('@vertz/test Bun bridge', () => {
  it.skipIf(!isBun)('describe is a function from bun:test', () => {
    const mod = require('../index');
    expect(typeof mod.describe).toBe('function');
  });

  it.skipIf(!isBun)('it is a function from bun:test', () => {
    const mod = require('../index');
    expect(typeof mod.it).toBe('function');
  });

  it.skipIf(!isBun)('test is a function from bun:test', () => {
    const mod = require('../index');
    expect(typeof mod.test).toBe('function');
  });

  it.skipIf(!isBun)('expect is a function from bun:test', () => {
    const mod = require('../index');
    expect(typeof mod.expect).toBe('function');
  });

  it('beforeEach is a function', () => {
    expect(typeof beforeEach).toBe('function');
  });

  it('afterEach is a function', () => {
    expect(typeof afterEach).toBe('function');
  });

  it('beforeAll is a function', () => {
    expect(typeof beforeAll).toBe('function');
  });

  it('afterAll is a function', () => {
    expect(typeof afterAll).toBe('function');
  });

  it('mock is a function', () => {
    expect(typeof mock).toBe('function');
  });

  it('spyOn is a function', () => {
    expect(typeof spyOn).toBe('function');
  });

  it('vi/jest is an object with expected methods', () => {
    expect(typeof vi).toBe('object');
    expect(typeof vi.fn).toBe('function');
    expect(typeof vi.spyOn).toBe('function');
    expect(typeof vi.useFakeTimers).toBe('function');
    expect(typeof vi.useRealTimers).toBe('function');
    expect(typeof vi.clearAllMocks).toBe('function');
    expect(typeof vi.resetAllMocks).toBe('function');
    expect(typeof vi.restoreAllMocks).toBe('function');
  });

  it.skipIf(!isBun)('describe has skip, each modifiers', () => {
    const mod = require('../index');
    expect(typeof mod.describe.skip).toBe('function');
    expect(typeof mod.describe.each).toBe('function');
    // Note: describe.only throws on CI (Bun disables .only to prevent skipping)
    expect('only' in mod.describe).toBe(true);
  });

  it.skipIf(!isBun)('it has skip, todo, each modifiers', () => {
    const mod = require('../index');
    expect(typeof mod.it.skip).toBe('function');
    expect(typeof mod.it.todo).toBe('function');
    expect(typeof mod.it.each).toBe('function');
    // Note: it.only throws on CI (Bun disables .only to prevent skipping)
    expect('only' in mod.it).toBe(true);
  });

  it.skipIf(!isBun)('expect has asymmetric matcher factories', () => {
    const mod = require('../index');
    expect(typeof mod.expect.any).toBe('function');
    expect(typeof mod.expect.anything).toBe('function');
    expect(typeof mod.expect.objectContaining).toBe('function');
    expect(typeof mod.expect.arrayContaining).toBe('function');
    expect(typeof mod.expect.stringContaining).toBe('function');
    expect(typeof mod.expect.stringMatching).toBe('function');
    expect(typeof mod.expect.extend).toBe('function');
  });

  it('mock has module() method', () => {
    expect(typeof mock.module).toBe('function');
  });
});

// --- Type existence checks ---
// These verify the type exports compile correctly (checked at typecheck time).

describe('@vertz/test type exports', () => {
  it('all type exports are accessible', () => {
    const _types: [
      Describe,
      It,
      Test,
      Expect,
      BeforeEach,
      AfterEach,
      BeforeAll,
      AfterAll,
      Mock,
      SpyOn,
      Vi,
      ExpectTypeOf,
      MockFunction,
      AsymmetricMatcher,
    ] = [] as never;
    expect(_types).toBeDefined();
  });
});
