// @vertz/test — Type declarations and runtime bridge for the Vertz test framework.
//
// Resolution order:
//   1. `vtz test` — the runtime's synthetic module loader intercepts this import
//      and provides the real test framework globals. This file is never reached.
//   2. `bun test` — detects the Bun runtime and re-exports from `bun:test`.
//   3. Any other context — stubs that throw a helpful error.

const STUB_ERROR =
  '@vertz/test: this function is a stub. Run your tests with `vtz test` to use the real implementation.';

function stub(): never {
  throw new Error(STUB_ERROR);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MockState {
  calls: unknown[][];
  results: Array<{ type: 'return' | 'throw'; value: unknown }>;
  lastCall?: unknown[];
}

export interface MockFunction<TArgs extends unknown[] = unknown[], TReturn = unknown> {
  (...args: TArgs): TReturn;
  mock: MockState;
  mockImplementation(fn: (...args: TArgs) => TReturn): MockFunction<TArgs, TReturn>;
  mockReturnValue(value: TReturn): MockFunction<TArgs, TReturn>;
  mockReturnValueOnce(value: TReturn): MockFunction<TArgs, TReturn>;
  mockResolvedValue(value: Awaited<TReturn>): MockFunction<TArgs, TReturn>;
  mockResolvedValueOnce(value: Awaited<TReturn>): MockFunction<TArgs, TReturn>;
  mockRejectedValue(value: unknown): MockFunction<TArgs, TReturn>;
  mockRejectedValueOnce(value: unknown): MockFunction<TArgs, TReturn>;
  mockImplementationOnce(fn: (...args: TArgs) => TReturn): MockFunction<TArgs, TReturn>;
  mockReturnThis(): MockFunction<TArgs, TReturn>;
  /** Returns the current implementation, or `undefined` if none is set. */
  getMockImplementation(): ((...args: TArgs) => TReturn) | undefined;
  /** Returns the name assigned via `mockName()`, or `''` if unset. */
  getMockName(): string;
  /** Sets the display name used in diagnostics. Returns the mock for chaining. */
  mockName(name: string): MockFunction<TArgs, TReturn>;
  /**
   * Temporarily sets the implementation to `fn` while running `cb`. Restores the
   * prior implementation afterwards — awaiting `cb` if it returns a Promise.
   * Returns whatever `cb` returns.
   */
  withImplementation<R>(fn: (...args: TArgs) => TReturn, cb: () => R): R;
  mockClear(): MockFunction<TArgs, TReturn>;
  mockReset(): MockFunction<TArgs, TReturn>;
  mockRestore(): MockFunction<TArgs, TReturn>;
}

export interface AsymmetricMatcher {
  match(received: unknown): boolean;
  toString(): string;
}

export interface Matchers<T = unknown> {
  toBe(expected: T): void;
  toEqual(expected: unknown): void;
  toStrictEqual(expected: unknown): void;
  toBeTruthy(): void;
  toBeFalsy(): void;
  toBeNull(): void;
  toBeUndefined(): void;
  toBeDefined(): void;
  toBeGreaterThan(n: number): void;
  toBeGreaterThanOrEqual(n: number): void;
  toBeLessThan(n: number): void;
  toBeLessThanOrEqual(n: number): void;
  toBeNaN(): void;
  toBeArray(): void;
  toContain(item: unknown): void;
  toContainEqual(item: unknown): void;
  toHaveLength(n: number): void;
  toMatch(pattern: string | RegExp): void;
  toBeCloseTo(expected: number, numDigits?: number): void;
  toBeTypeOf(type: string): void;
  toBeFunction(): void;
  toHaveProperty(keyPath: string | string[], value?: unknown): void;
  toMatchObject(expected: object): void;
  toBeInstanceOf(constructor: new (...args: unknown[]) => unknown): void;
  toThrow(expected?: string | RegExp | (new (...args: unknown[]) => unknown)): void;
  toThrowError(expected?: string | RegExp | (new (...args: unknown[]) => unknown)): void;
  toHaveBeenCalled(): void;
  toHaveBeenCalledOnce(): void;
  toHaveBeenCalledTimes(n: number): void;
  toHaveBeenCalledWith(...args: unknown[]): void;
  toHaveBeenLastCalledWith(...args: unknown[]): void;
  toHaveBeenNthCalledWith(n: number, ...args: unknown[]): void;
  toSatisfy(predicate: (actual: T) => boolean): void;
  not: Matchers<T>;
  resolves: Matchers<T>;
  rejects: Matchers<T>;
}

export type TestFn = () => void | Promise<void>;
export type HookFn = () => void | Promise<void>;

export type EachFn = (
  table: unknown[],
) => (name: string, fn: (...args: unknown[]) => void | Promise<void>) => void;

export interface DescribeModifier {
  (name: string, fn: () => void): void;
  each: EachFn;
}

export interface Describe {
  (name: string, fn: () => void): void;
  skip: DescribeModifier;
  only: DescribeModifier;
  skipIf: (condition: boolean) => Describe | DescribeModifier;
  each: EachFn;
}

export interface ItModifier {
  (name: string, fn: TestFn): void;
  each: EachFn;
}

export interface It {
  (name: string, fn: TestFn): void;
  skip: ItModifier;
  only: ItModifier;
  todo: (name: string) => void;
  skipIf: (condition: boolean) => It | ItModifier;
  each: EachFn;
}

export type Test = It;

export type BeforeEach = (fn: HookFn) => void;
export type AfterEach = (fn: HookFn) => void;
export type BeforeAll = (fn: HookFn) => void;
export type AfterAll = (fn: HookFn) => void;

export interface Expect {
  <T>(actual: T): Matchers<T>;
  any: (constructor: new (...args: unknown[]) => unknown) => AsymmetricMatcher;
  anything: () => AsymmetricMatcher;
  objectContaining: (expected: object) => AsymmetricMatcher;
  arrayContaining: (expected: unknown[]) => AsymmetricMatcher;
  stringContaining: (expected: string) => AsymmetricMatcher;
  stringMatching: (pattern: string | RegExp) => AsymmetricMatcher;
  extend: (
    matchers: Record<
      string,
      (actual: unknown, ...args: unknown[]) => { pass: boolean; message: () => string }
    >,
  ) => void;
}

export interface Mock {
  (impl?: (...args: unknown[]) => unknown): MockFunction;
  module: (modulePath: string, factory?: (() => unknown) | unknown) => void;
}

export type SpyOn = (obj: object, method: string | symbol) => MockFunction;

export interface Vi {
  fn: (impl?: (...args: unknown[]) => unknown) => MockFunction;
  spyOn: (obj: object, method: string) => MockFunction;
  clearAllMocks: () => void;
  resetAllMocks: () => void;
  restoreAllMocks: () => void;
  useFakeTimers: () => Vi;
  useRealTimers: () => Vi;
  advanceTimersByTime: (ms: number) => Vi;
  advanceTimersToNextTimer: () => Vi;
  runAllTimers: () => Vi;
  runOnlyPendingTimers: () => Vi;
  setSystemTime: (date: Date | number | string) => Vi;
  getTimerCount: () => number;
  isFakeTimers: () => boolean;
  mock: (modulePath: string, factory?: (() => unknown) | unknown) => void;
  hoisted: <T>(factory: () => T) => T;
  importActual: (specifier: string) => Promise<unknown>;
}

export interface ExpectTypeOfMatchers<Actual> {
  toEqualTypeOf<Expected>(...args: [Expected] | []): void;
  toMatchTypeOf<Expected>(...args: [Expected] | []): void;
  toBeAny(): void;
  toBeUnknown(): void;
  toBeNever(): void;
  toBeFunction(): void;
  toBeObject(): void;
  toBeArray(): void;
  toBeNumber(): void;
  toBeString(): void;
  toBeBoolean(): void;
  toBeVoid(): void;
  toBeSymbol(): void;
  toBeNull(): void;
  toBeUndefined(): void;
  toBeNullable(): void;
  not: ExpectTypeOfMatchers<Actual>;
}

export interface ExpectTypeOf {
  <Actual>(actual: Actual): ExpectTypeOfMatchers<Actual>;
  <Actual>(): ExpectTypeOfMatchers<Actual>;
}

// ---------------------------------------------------------------------------
// Runtime resolution: Bun re-export or stubs
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _runtime: any;

if (typeof Bun !== 'undefined') {
  // Running under Bun — re-export from bun:test so `bun test` works
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  _runtime = require('bun:test');
}

// ---------------------------------------------------------------------------
// Stubs (fallback when not in Bun or vtz test)
// ---------------------------------------------------------------------------

const eachStub: EachFn =
  (_table: unknown[]) =>
  (_name: string, _fn: (...args: unknown[]) => void | Promise<void>): void =>
    stub();

function describeSkipStub(_name: string, _fn: () => void): void {
  stub();
}
describeSkipStub.each = eachStub;

function describeStub(_name: string, _fn: () => void): void {
  stub();
}
describeStub.skip = describeSkipStub as DescribeModifier;
describeStub.only = describeSkipStub as DescribeModifier;
describeStub.skipIf = (_condition: boolean): Describe | DescribeModifier => stub();
describeStub.each = eachStub;

function itSkipStub(_name: string, _fn: TestFn): void {
  stub();
}
itSkipStub.each = eachStub;

function itStub(_name: string, _fn: TestFn): void {
  stub();
}
itStub.skip = itSkipStub as ItModifier;
itStub.only = itSkipStub as ItModifier;
itStub.todo = (_name: string): void => stub();
itStub.skipIf = (_condition: boolean): It | ItModifier => stub();
itStub.each = eachStub;

const stubExpect: Expect = Object.assign(<T>(_actual: T): Matchers<T> => stub(), {
  any: (_constructor: new (...args: unknown[]) => unknown): AsymmetricMatcher => stub(),
  anything: (): AsymmetricMatcher => stub(),
  objectContaining: (_expected: object): AsymmetricMatcher => stub(),
  arrayContaining: (_expected: unknown[]): AsymmetricMatcher => stub(),
  stringContaining: (_expected: string): AsymmetricMatcher => stub(),
  stringMatching: (_pattern: string | RegExp): AsymmetricMatcher => stub(),
  extend: (
    _matchers: Record<
      string,
      (actual: unknown, ...args: unknown[]) => { pass: boolean; message: () => string }
    >,
  ): void => stub(),
});

const stubMock: Mock = Object.assign(
  (_impl?: (...args: unknown[]) => unknown): MockFunction => stub(),
  {
    module: (_modulePath: string, _factory?: (() => unknown) | unknown): void => stub(),
  },
);

const stubVi: Vi = {
  fn: (_impl?: (...args: unknown[]) => unknown): MockFunction => stub(),
  spyOn: (_obj: object, _method: string): MockFunction => stub(),
  clearAllMocks: (): void => stub(),
  resetAllMocks: (): void => stub(),
  restoreAllMocks: (): void => stub(),
  useFakeTimers: (): Vi => stub(),
  useRealTimers: (): Vi => stub(),
  advanceTimersByTime: (_ms: number): Vi => stub(),
  advanceTimersToNextTimer: (): Vi => stub(),
  runAllTimers: (): Vi => stub(),
  runOnlyPendingTimers: (): Vi => stub(),
  setSystemTime: (_date: Date | number | string): Vi => stub(),
  getTimerCount: (): number => stub(),
  isFakeTimers: (): boolean => stub(),
  mock: (_modulePath: string, _factory?: (() => unknown) | unknown): void => stub(),
  hoisted: <T>(_factory: () => T): T => stub(),
  importActual: (_specifier: string): Promise<unknown> => stub(),
};

// ---------------------------------------------------------------------------
// Exports: use Bun runtime when available, otherwise stubs
// ---------------------------------------------------------------------------

const describe: Describe = _runtime?.describe ?? (describeStub as Describe);
const it: It = _runtime?.it ?? (itStub as It);
const test: Test = _runtime?.test ?? (itStub as It);
const expect: Expect = _runtime?.expect ?? stubExpect;
const beforeEach: BeforeEach = _runtime?.beforeEach ?? ((_fn: HookFn): void => stub());
const afterEach: AfterEach = _runtime?.afterEach ?? ((_fn: HookFn): void => stub());
const beforeAll: BeforeAll = _runtime?.beforeAll ?? ((_fn: HookFn): void => stub());
const afterAll: AfterAll = _runtime?.afterAll ?? ((_fn: HookFn): void => stub());
const mock: Mock = _runtime?.mock ?? stubMock;
const spyOn: SpyOn =
  _runtime?.spyOn ?? ((_obj: object, _method: string | symbol): MockFunction => stub());
const vi: Vi = _runtime?.jest ?? _runtime?.vi ?? stubVi;
const expectTypeOf: ExpectTypeOf =
  _runtime?.expectTypeOf ?? (<_T = unknown>(_actual?: _T): ExpectTypeOfMatchers<_T> => stub());

export {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  mock,
  spyOn,
  test,
  vi,
};
