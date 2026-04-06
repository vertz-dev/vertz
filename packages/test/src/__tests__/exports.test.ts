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

// --- Stub behavior ---

describe('@vertz/test runtime stubs', () => {
  const EXPECTED_ERROR =
    '@vertz/test: this function is a stub. Run your tests with `vtz test` to use the real implementation.';

  it('describe() throws a helpful error', () => {
    const { describe: stubDescribe } = require('../index');
    expect(() => stubDescribe('suite', () => {})).toThrow(EXPECTED_ERROR);
  });

  it('it() throws a helpful error', () => {
    const { it: stubIt } = require('../index');
    expect(() => stubIt('test', () => {})).toThrow(EXPECTED_ERROR);
  });

  it('test() throws a helpful error', () => {
    const { test: stubTest } = require('../index');
    expect(() => stubTest('test', () => {})).toThrow(EXPECTED_ERROR);
  });

  it('expect() throws a helpful error', () => {
    const { expect: stubExpect } = require('../index');
    expect(() => stubExpect(1)).toThrow(EXPECTED_ERROR);
  });

  it('beforeEach() throws a helpful error', () => {
    expect(() => beforeEach(() => {})).toThrow(EXPECTED_ERROR);
  });

  it('afterEach() throws a helpful error', () => {
    expect(() => afterEach(() => {})).toThrow(EXPECTED_ERROR);
  });

  it('beforeAll() throws a helpful error', () => {
    expect(() => beforeAll(() => {})).toThrow(EXPECTED_ERROR);
  });

  it('afterAll() throws a helpful error', () => {
    expect(() => afterAll(() => {})).toThrow(EXPECTED_ERROR);
  });

  it('mock() throws a helpful error', () => {
    expect(() => mock()).toThrow(EXPECTED_ERROR);
  });

  it('spyOn() throws a helpful error', () => {
    expect(() => spyOn({}, 'toString')).toThrow(EXPECTED_ERROR);
  });

  it('vi.fn() throws a helpful error', () => {
    expect(() => vi.fn()).toThrow(EXPECTED_ERROR);
  });

  it('vi.spyOn() throws a helpful error', () => {
    expect(() => vi.spyOn({}, 'toString')).toThrow(EXPECTED_ERROR);
  });

  it('vi.useFakeTimers() throws a helpful error', () => {
    expect(() => vi.useFakeTimers()).toThrow(EXPECTED_ERROR);
  });

  it('vi.clearAllMocks() throws a helpful error', () => {
    expect(() => vi.clearAllMocks()).toThrow(EXPECTED_ERROR);
  });

  it('vi.mock() throws a helpful error', () => {
    expect(() => vi.mock('module')).toThrow(EXPECTED_ERROR);
  });

  it('vi.hoisted() throws a helpful error', () => {
    expect(() => vi.hoisted(() => ({}))).toThrow(EXPECTED_ERROR);
  });

  it('vi.importActual() throws a helpful error', () => {
    expect(() => vi.importActual('module')).toThrow(EXPECTED_ERROR);
  });

  it('expectTypeOf() throws a helpful error', () => {
    expect(() => expectTypeOf()).toThrow(EXPECTED_ERROR);
  });

  it('describe.each() throws a helpful error', () => {
    const mod = require('../index');
    const eachFn = mod.describe.each([1, 2]);
    expect(() => eachFn('test %s', () => {})).toThrow(EXPECTED_ERROR);
  });

  it('it.each() throws a helpful error', () => {
    const mod = require('../index');
    const eachFn = mod.it.each([1, 2]);
    expect(() => eachFn('test %s', () => {})).toThrow(EXPECTED_ERROR);
  });

  it('expect.extend() throws a helpful error', () => {
    const mod = require('../index');
    expect(() => mod.expect.extend({})).toThrow(EXPECTED_ERROR);
  });

  it('describe.skip() throws a helpful error', () => {
    const mod = require('../index');
    expect(() => mod.describe.skip('suite', () => {})).toThrow(EXPECTED_ERROR);
  });

  it('describe.skipIf() throws a helpful error', () => {
    const mod = require('../index');
    expect(() => mod.describe.skipIf(true)).toThrow(EXPECTED_ERROR);
  });

  it('it.skip() throws a helpful error', () => {
    const mod = require('../index');
    expect(() => mod.it.skip('test', () => {})).toThrow(EXPECTED_ERROR);
  });

  it('it.todo() throws a helpful error', () => {
    const mod = require('../index');
    expect(() => mod.it.todo('test')).toThrow(EXPECTED_ERROR);
  });

  it('it.skipIf() throws a helpful error', () => {
    const mod = require('../index');
    expect(() => mod.it.skipIf(true)).toThrow(EXPECTED_ERROR);
  });

  it('expect.any() throws a helpful error', () => {
    const mod = require('../index');
    expect(() => mod.expect.any(String)).toThrow(EXPECTED_ERROR);
  });

  it('expect.anything() throws a helpful error', () => {
    const mod = require('../index');
    expect(() => mod.expect.anything()).toThrow(EXPECTED_ERROR);
  });

  it('expect.objectContaining() throws a helpful error', () => {
    const mod = require('../index');
    expect(() => mod.expect.objectContaining({})).toThrow(EXPECTED_ERROR);
  });

  it('expect.arrayContaining() throws a helpful error', () => {
    const mod = require('../index');
    expect(() => mod.expect.arrayContaining([])).toThrow(EXPECTED_ERROR);
  });

  it('expect.stringContaining() throws a helpful error', () => {
    const mod = require('../index');
    expect(() => mod.expect.stringContaining('x')).toThrow(EXPECTED_ERROR);
  });

  it('expect.stringMatching() throws a helpful error', () => {
    const mod = require('../index');
    expect(() => mod.expect.stringMatching(/x/)).toThrow(EXPECTED_ERROR);
  });

  it('mock.module() throws a helpful error', () => {
    expect(() => mock.module('mod')).toThrow(EXPECTED_ERROR);
  });

  it('vi.useRealTimers() throws a helpful error', () => {
    expect(() => vi.useRealTimers()).toThrow(EXPECTED_ERROR);
  });

  it('vi.advanceTimersByTime() throws a helpful error', () => {
    expect(() => vi.advanceTimersByTime(100)).toThrow(EXPECTED_ERROR);
  });

  it('vi.advanceTimersToNextTimer() throws a helpful error', () => {
    expect(() => vi.advanceTimersToNextTimer()).toThrow(EXPECTED_ERROR);
  });

  it('vi.runAllTimers() throws a helpful error', () => {
    expect(() => vi.runAllTimers()).toThrow(EXPECTED_ERROR);
  });

  it('vi.runOnlyPendingTimers() throws a helpful error', () => {
    expect(() => vi.runOnlyPendingTimers()).toThrow(EXPECTED_ERROR);
  });

  it('vi.setSystemTime() throws a helpful error', () => {
    expect(() => vi.setSystemTime(0)).toThrow(EXPECTED_ERROR);
  });

  it('vi.getTimerCount() throws a helpful error', () => {
    expect(() => vi.getTimerCount()).toThrow(EXPECTED_ERROR);
  });

  it('vi.isFakeTimers() throws a helpful error', () => {
    expect(() => vi.isFakeTimers()).toThrow(EXPECTED_ERROR);
  });

  it('vi.resetAllMocks() throws a helpful error', () => {
    expect(() => vi.resetAllMocks()).toThrow(EXPECTED_ERROR);
  });

  it('vi.restoreAllMocks() throws a helpful error', () => {
    expect(() => vi.restoreAllMocks()).toThrow(EXPECTED_ERROR);
  });
});

// --- Export existence ---

describe('@vertz/test exports', () => {
  it('exports describe as a function', () => {
    const mod = require('../index');
    expect(typeof mod.describe).toBe('function');
  });

  it('exports it as a function', () => {
    const mod = require('../index');
    expect(typeof mod.it).toBe('function');
  });

  it('exports test as a function', () => {
    const mod = require('../index');
    expect(typeof mod.test).toBe('function');
  });

  it('exports expect as a function', () => {
    const mod = require('../index');
    expect(typeof mod.expect).toBe('function');
  });

  it('exports beforeEach as a function', () => {
    expect(typeof beforeEach).toBe('function');
  });

  it('exports afterEach as a function', () => {
    expect(typeof afterEach).toBe('function');
  });

  it('exports beforeAll as a function', () => {
    expect(typeof beforeAll).toBe('function');
  });

  it('exports afterAll as a function', () => {
    expect(typeof afterAll).toBe('function');
  });

  it('exports mock as a function', () => {
    expect(typeof mock).toBe('function');
  });

  it('exports spyOn as a function', () => {
    expect(typeof spyOn).toBe('function');
  });

  it('exports vi as an object with expected methods', () => {
    expect(typeof vi).toBe('object');
    expect(typeof vi.fn).toBe('function');
    expect(typeof vi.spyOn).toBe('function');
    expect(typeof vi.useFakeTimers).toBe('function');
    expect(typeof vi.useRealTimers).toBe('function');
    expect(typeof vi.advanceTimersByTime).toBe('function');
    expect(typeof vi.advanceTimersToNextTimer).toBe('function');
    expect(typeof vi.runAllTimers).toBe('function');
    expect(typeof vi.runOnlyPendingTimers).toBe('function');
    expect(typeof vi.setSystemTime).toBe('function');
    expect(typeof vi.getTimerCount).toBe('function');
    expect(typeof vi.isFakeTimers).toBe('function');
    expect(typeof vi.clearAllMocks).toBe('function');
    expect(typeof vi.resetAllMocks).toBe('function');
    expect(typeof vi.restoreAllMocks).toBe('function');
    expect(typeof vi.mock).toBe('function');
    expect(typeof vi.hoisted).toBe('function');
    expect(typeof vi.importActual).toBe('function');
  });

  it('exports expectTypeOf as a function', () => {
    expect(typeof expectTypeOf).toBe('function');
  });

  it('describe has skip, only, skipIf, each modifiers', () => {
    const mod = require('../index');
    expect(typeof mod.describe.skip).toBe('function');
    expect(typeof mod.describe.only).toBe('function');
    expect(typeof mod.describe.skipIf).toBe('function');
    expect(typeof mod.describe.each).toBe('function');
  });

  it('it has skip, only, todo, skipIf, each modifiers', () => {
    const mod = require('../index');
    expect(typeof mod.it.skip).toBe('function');
    expect(typeof mod.it.only).toBe('function');
    expect(typeof mod.it.todo).toBe('function');
    expect(typeof mod.it.skipIf).toBe('function');
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
