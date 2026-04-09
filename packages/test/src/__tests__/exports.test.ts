import { describe, expect, it } from 'bun:test';

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

describe('@vertz/test Bun bridge', () => {
  it('describe is a function from bun:test', () => {
    const mod = require('../index');
    expect(typeof mod.describe).toBe('function');
  });

  it('it is a function from bun:test', () => {
    const mod = require('../index');
    expect(typeof mod.it).toBe('function');
  });

  it('test is a function from bun:test', () => {
    const mod = require('../index');
    expect(typeof mod.test).toBe('function');
  });

  it('expect is a function from bun:test', () => {
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

  it('describe has skip, only, skipIf, each modifiers', () => {
    const mod = require('../index');
    expect(typeof mod.describe.skip).toBe('function');
    expect(typeof mod.describe.only).toBe('function');
    expect(typeof mod.describe.each).toBe('function');
  });

  it('it has skip, only, todo, each modifiers', () => {
    const mod = require('../index');
    expect(typeof mod.it.skip).toBe('function');
    expect(typeof mod.it.only).toBe('function');
    expect(typeof mod.it.todo).toBe('function');
    expect(typeof mod.it.each).toBe('function');
  });

  it('expect has asymmetric matcher factories', () => {
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
