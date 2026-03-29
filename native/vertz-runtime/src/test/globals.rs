/// The bootstrap JS that defines the test framework globals on `globalThis`.
///
/// Provides `describe`, `it`, `expect`, `beforeEach`, `afterEach` globals that test
/// files use. The harness collects test registrations during module evaluation, then
/// executes them when `__vertz_run_tests()` is called. Results are returned as JSON
/// for the Rust side to parse.
pub const TEST_HARNESS_JS: &str = r#"
// --- DOM class stubs for test mode (#2071) ---
// Provide minimal DOM class hierarchy on globalThis so that instanceof checks
// work in tests. These stubs have no DOM behavior — they exist only for
// prototype chain checks (e.g., `instanceof HTMLElement`).
if (typeof globalThis.HTMLElement === 'undefined') {
  class EventTarget {}
  class Node extends EventTarget {}
  class Element extends Node {}
  class HTMLElement extends Element {}
  class HTMLDivElement extends HTMLElement {}
  class HTMLInputElement extends HTMLElement {}
  class HTMLButtonElement extends HTMLElement {}
  class HTMLFormElement extends HTMLElement {}
  class HTMLAnchorElement extends HTMLElement {}
  class HTMLSpanElement extends HTMLElement {}
  class HTMLLabelElement extends HTMLElement {}
  class HTMLTextAreaElement extends HTMLElement {}
  class HTMLSelectElement extends HTMLElement {}
  class HTMLOptionElement extends HTMLElement {}
  class HTMLImageElement extends HTMLElement {}
  class Text extends Node {}
  class Comment extends Node {}
  class DocumentFragment extends Node {}
  class Event {}
  class CustomEvent extends Event {}

  Object.assign(globalThis, {
    Node, Element, EventTarget, Event, CustomEvent,
    HTMLElement, HTMLDivElement, HTMLInputElement, HTMLButtonElement,
    HTMLFormElement, HTMLAnchorElement, HTMLSpanElement, HTMLLabelElement,
    HTMLTextAreaElement, HTMLSelectElement, HTMLOptionElement, HTMLImageElement,
    Text, Comment, DocumentFragment,
  });
}

(() => {
  'use strict';

  // --- Internal state ---
  const suites = [];        // Top-level describe blocks
  const suiteStack = [];    // Current nesting stack
  let hasOnly = false;      // Whether any .only modifier was used
  // Root-level hooks container (for beforeEach/afterEach called outside any describe)
  const rootHooks = { beforeEach: [], afterEach: [], beforeAll: [], afterAll: [] };

  function currentSuite() {
    return suiteStack.length > 0 ? suiteStack[suiteStack.length - 1] : null;
  }

  function addTest(name, fn, modifiers) {
    const test = { name, fn, ...modifiers };
    const parent = currentSuite();
    if (parent) {
      parent.tests.push(test);
    } else {
      // Top-level it() without describe — wrap in anonymous suite
      const anon = { name: '', tests: [test], suites: [], beforeEach: [], afterEach: [], beforeAll: [], afterAll: [], skip: false };
      suites.push(anon);
    }
    if (modifiers.only) hasOnly = true;
  }

  function addSuite(name, fn, modifiers) {
    const suite = {
      name,
      tests: [],
      suites: [],
      beforeEach: [],
      afterEach: [],
      beforeAll: [],
      afterAll: [],
      ...modifiers,
    };
    const parent = currentSuite();
    if (parent) {
      parent.suites.push(suite);
    } else {
      suites.push(suite);
    }
    if (modifiers.only) hasOnly = true;
    suiteStack.push(suite);
    try { fn(); } finally { suiteStack.pop(); }
  }

  // --- Public API: describe ---
  function describe(name, fn) { addSuite(name, fn, {}); }
  describe.skip = function(name, fn) { addSuite(name, fn, { skip: true }); };
  describe.only = function(name, fn) { addSuite(name, fn, { only: true }); };

  // --- Public API: it / test ---
  function it(name, fn) { addTest(name, fn, {}); }
  it.skip = function(name, fn) { addTest(name, fn, { skip: true }); };
  it.only = function(name, fn) { addTest(name, fn, { only: true }); };
  it.todo = function(name) { addTest(name, undefined, { todo: true }); };
  const test = it;

  // --- Public API: hooks ---
  function beforeEach(fn) {
    const parent = currentSuite();
    if (parent) parent.beforeEach.push(fn);
    else rootHooks.beforeEach.push(fn);
  }
  function afterEach(fn) {
    const parent = currentSuite();
    if (parent) parent.afterEach.push(fn);
    else rootHooks.afterEach.push(fn);
  }
  function beforeAll(fn) {
    const parent = currentSuite();
    if (parent) parent.beforeAll.push(fn);
    else rootHooks.beforeAll.push(fn);
  }
  function afterAll(fn) {
    const parent = currentSuite();
    if (parent) parent.afterAll.push(fn);
    else rootHooks.afterAll.push(fn);
  }

  // --- Asymmetric Matchers ---
  const ASYMMETRIC_BRAND = Symbol('__vertz_asymmetric');

  function asymmetric(matchFn, description) {
    return { [ASYMMETRIC_BRAND]: true, match: matchFn, toString: () => description };
  }

  // --- Mock/Spy ---
  const MOCK_BRAND = Symbol('__vertz_mock');
  const allMocks = new Set(); // Track all mocks for bulk operations (vi.clearAllMocks, etc.)

  function createMockFunction(impl) {
    if (impl !== undefined && impl !== null && typeof impl !== 'function') {
      throw new Error('mock() argument must be a function or undefined');
    }
    let currentImpl = impl || null;
    let onceQueue = [];
    const mockState = { calls: [], results: [], lastCall: undefined };

    function mockFn(...args) {
      mockState.calls.push(args);
      mockState.lastCall = args;
      // Check once-queue first
      if (onceQueue.length > 0) {
        const onceFn = onceQueue.shift();
        try {
          const value = onceFn(...args);
          mockState.results.push({ type: 'return', value });
          return value;
        } catch (e) {
          mockState.results.push({ type: 'throw', value: e });
          throw e;
        }
      }
      // Then current implementation
      if (currentImpl) {
        try {
          const value = currentImpl(...args);
          mockState.results.push({ type: 'return', value });
          return value;
        } catch (e) {
          mockState.results.push({ type: 'throw', value: e });
          throw e;
        }
      }
      mockState.results.push({ type: 'return', value: undefined });
      return undefined;
    }

    mockFn[MOCK_BRAND] = true;
    mockFn.mock = mockState;

    mockFn.mockImplementation = (fn) => { currentImpl = fn; return mockFn; };
    mockFn.mockReturnValue = (val) => { currentImpl = () => val; return mockFn; };
    mockFn.mockResolvedValue = (val) => { currentImpl = () => Promise.resolve(val); return mockFn; };
    mockFn.mockResolvedValueOnce = (val) => { onceQueue.push(() => Promise.resolve(val)); return mockFn; };
    mockFn.mockReturnValueOnce = (val) => { onceQueue.push(() => val); return mockFn; };
    mockFn.mockRejectedValue = (val) => { currentImpl = () => Promise.reject(val); return mockFn; };
    mockFn.mockRejectedValueOnce = (val) => { onceQueue.push(() => Promise.reject(val)); return mockFn; };
    mockFn.mockImplementationOnce = (fn) => { onceQueue.push(fn); return mockFn; };

    mockFn.mockReset = () => {
      mockState.calls.length = 0;
      mockState.results.length = 0;
      mockState.lastCall = undefined;
      currentImpl = null;
      onceQueue.length = 0;
      return mockFn;
    };

    mockFn.mockClear = () => {
      mockState.calls.length = 0;
      mockState.results.length = 0;
      mockState.lastCall = undefined;
      return mockFn;
    };

    mockFn.mockRestore = () => {
      // For plain mock(), mockRestore is the same as mockReset.
      // spyOn overrides this to restore the original.
      return mockFn.mockReset();
    };

    allMocks.add(mockFn);
    return mockFn;
  }

  function mock(impl) {
    return createMockFunction(impl);
  }

  function spyOn(obj, method) {
    if (typeof obj[method] !== 'function') {
      throw new Error(`spyOn: ${method} is not a function on the target object`);
    }
    const original = obj[method];
    const spy = createMockFunction((...args) => original.apply(obj, args));
    spy.mockRestore = () => {
      obj[method] = original;
      spy.mockReset();
      return spy;
    };
    obj[method] = spy;
    return spy;
  }

  // --- Expect ---
  function deepEqual(a, b, seen) {
    // Asymmetric matcher support — delegate to match()
    if (b != null && typeof b === 'object' && b[ASYMMETRIC_BRAND]) return b.match(a);
    if (a != null && typeof a === 'object' && a[ASYMMETRIC_BRAND]) return a.match(b);
    if (a === b) return true;
    // NaN === NaN should be true for testing purposes
    if (typeof a === 'number' && typeof b === 'number' && Number.isNaN(a) && Number.isNaN(b)) return true;
    if (a == null || b == null) return false;
    if (typeof a !== typeof b) return false;
    if (typeof a !== 'object') return false;

    // Circular reference protection
    if (!seen) seen = new WeakSet();
    if (seen.has(a)) return false; // conservative: treat circular as not-equal
    seen.add(a);

    // Date comparison by time value
    if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
    // RegExp comparison by source and flags
    if (a instanceof RegExp && b instanceof RegExp) return a.source === b.source && a.flags === b.flags;

    // Map comparison
    if (a instanceof Map && b instanceof Map) {
      if (a.size !== b.size) return false;
      for (const [key, val] of a) {
        if (!b.has(key) || !deepEqual(val, b.get(key), seen)) return false;
      }
      return true;
    }
    if ((a instanceof Map) !== (b instanceof Map)) return false;

    // Set comparison
    if (a instanceof Set && b instanceof Set) {
      if (a.size !== b.size) return false;
      for (const val of a) {
        // For primitives, use has(); for objects, scan with deepEqual
        if (typeof val === 'object' && val !== null) {
          let found = false;
          for (const bVal of b) { if (deepEqual(val, bVal, seen)) { found = true; break; } }
          if (!found) return false;
        } else {
          if (!b.has(val)) return false;
        }
      }
      return true;
    }
    if ((a instanceof Set) !== (b instanceof Set)) return false;

    if (Array.isArray(a) !== Array.isArray(b)) return false;

    if (Array.isArray(a)) {
      if (a.length !== b.length) return false;
      return a.every((v, i) => deepEqual(v, b[i], seen));
    }

    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every(k => deepEqual(a[k], b[k], seen));
  }

  function formatValue(v) {
    if (v === undefined) return 'undefined';
    if (v === null) return 'null';
    if (typeof v === 'string') return JSON.stringify(v);
    if (typeof v === 'function') return '[Function]';
    if (v instanceof Error) return `${v.constructor.name}: ${v.message}`;
    try { return JSON.stringify(v); } catch { return String(v); }
  }

  function createMatchers(actual, negated) {
    const matchers = {};

    function assert(pass, message) {
      const effective = negated ? !pass : pass;
      if (!effective) throw new Error(message());
    }

    // Equality
    matchers.toBe = (expected) => {
      assert(Object.is(actual, expected), () =>
        `Expected ${formatValue(actual)} ${negated ? 'not ' : ''}to be ${formatValue(expected)}`
      );
    };
    matchers.toEqual = (expected) => {
      assert(deepEqual(actual, expected), () =>
        `Expected ${formatValue(actual)} ${negated ? 'not ' : ''}to deep-equal ${formatValue(expected)}`
      );
    };

    // Truthiness
    matchers.toBeTruthy = () => {
      assert(!!actual, () =>
        `Expected ${formatValue(actual)} ${negated ? 'not ' : ''}to be truthy`
      );
    };
    matchers.toBeFalsy = () => {
      assert(!actual, () =>
        `Expected ${formatValue(actual)} ${negated ? 'not ' : ''}to be falsy`
      );
    };
    matchers.toBeNull = () => {
      assert(actual === null, () =>
        `Expected ${formatValue(actual)} ${negated ? 'not ' : ''}to be null`
      );
    };
    matchers.toBeUndefined = () => {
      assert(actual === undefined, () =>
        `Expected ${formatValue(actual)} ${negated ? 'not ' : ''}to be undefined`
      );
    };
    matchers.toBeDefined = () => {
      assert(actual !== undefined, () =>
        `Expected value ${negated ? 'not ' : ''}to be defined`
      );
    };

    // Numbers
    matchers.toBeGreaterThan = (n) => {
      assert(actual > n, () =>
        `Expected ${actual} ${negated ? 'not ' : ''}to be greater than ${n}`
      );
    };
    matchers.toBeGreaterThanOrEqual = (n) => {
      assert(actual >= n, () =>
        `Expected ${actual} ${negated ? 'not ' : ''}to be >= ${n}`
      );
    };
    matchers.toBeLessThan = (n) => {
      assert(actual < n, () =>
        `Expected ${actual} ${negated ? 'not ' : ''}to be less than ${n}`
      );
    };
    matchers.toBeLessThanOrEqual = (n) => {
      assert(actual <= n, () =>
        `Expected ${actual} ${negated ? 'not ' : ''}to be <= ${n}`
      );
    };

    // Strings & Arrays
    matchers.toContain = (item) => {
      const has = typeof actual === 'string'
        ? actual.includes(item)
        : Array.isArray(actual) && actual.includes(item);
      assert(has, () =>
        `Expected ${formatValue(actual)} ${negated ? 'not ' : ''}to contain ${formatValue(item)}`
      );
    };
    matchers.toContainEqual = (item) => {
      const has = Array.isArray(actual) && actual.some(el => deepEqual(el, item));
      assert(has, () =>
        `Expected ${formatValue(actual)} ${negated ? 'not ' : ''}to contain equal ${formatValue(item)}`
      );
    };
    matchers.toHaveLength = (n) => {
      assert(actual != null && actual.length === n, () =>
        `Expected length ${actual?.length} ${negated ? 'not ' : ''}to be ${n}`
      );
    };
    matchers.toMatch = (pattern) => {
      const re = pattern instanceof RegExp ? pattern : new RegExp(pattern);
      assert(re.test(String(actual)), () =>
        `Expected ${formatValue(actual)} ${negated ? 'not ' : ''}to match ${pattern}`
      );
    };

    // Floats
    matchers.toBeCloseTo = (expected, numDigits) => {
      const digits = numDigits !== undefined ? numDigits : 2;
      const threshold = Math.pow(10, -digits) / 2;
      const pass = Math.abs(actual - expected) < threshold;
      assert(pass, () =>
        `Expected ${formatValue(actual)} ${negated ? 'not ' : ''}to be close to ${formatValue(expected)} (precision ${digits})`
      );
    };

    // Type checks
    matchers.toBeTypeOf = (typeStr) => {
      assert(typeof actual === typeStr, () =>
        `Expected typeof ${formatValue(actual)} ${negated ? 'not ' : ''}to be "${typeStr}", got "${typeof actual}"`
      );
    };
    matchers.toBeFunction = () => {
      assert(typeof actual === 'function', () =>
        `Expected ${formatValue(actual)} ${negated ? 'not ' : ''}to be a function`
      );
    };

    // Objects
    matchers.toHaveProperty = function(keyPath, value) {
      // Support dot-path strings ('a.b.c') and array paths (['a', 0, 'b'])
      const parts = Array.isArray(keyPath) ? keyPath : String(keyPath).split('.');
      let current = actual;
      let has = actual != null;
      for (let i = 0; has && i < parts.length; i++) {
        const part = parts[i];
        if (current == null || typeof current !== 'object' && typeof current !== 'function') {
          has = false;
        } else {
          has = part in Object(current);
          current = current[part];
        }
      }
      if (arguments.length > 1) {
        assert(has && deepEqual(current, value), () =>
          `Expected property "${keyPath}" ${negated ? 'not ' : ''}to be ${formatValue(value)}, got ${formatValue(current)}`
        );
      } else {
        assert(has, () =>
          `Expected object ${negated ? 'not ' : ''}to have property "${keyPath}"`
        );
      }
    };
    matchers.toMatchObject = (expected) => {
      function subsetMatch(a, b, seen) {
        if (b != null && typeof b === 'object' && b[ASYMMETRIC_BRAND]) return b.match(a);
        if (a === b) return true;
        if (a == null || b == null) return false;
        if (typeof a !== 'object' || typeof b !== 'object') return deepEqual(a, b);
        // Circular reference protection
        if (!seen) seen = new WeakSet();
        if (seen.has(a)) return false;
        seen.add(a);
        if (Array.isArray(b)) {
          if (!Array.isArray(a)) return false;
          if (a.length !== b.length) return false;
          return b.every((item, i) => subsetMatch(a[i], item, seen));
        }
        for (const key of Object.keys(b)) {
          if (!(key in a)) return false;
          if (!subsetMatch(a[key], b[key], seen)) return false;
        }
        return true;
      }
      assert(subsetMatch(actual, expected), () =>
        `Expected ${formatValue(actual)} ${negated ? 'not ' : ''}to match object ${formatValue(expected)}`
      );
    };
    matchers.toBeInstanceOf = (cls) => {
      assert(actual instanceof cls, () =>
        `Expected ${formatValue(actual)} ${negated ? 'not ' : ''}to be instance of ${cls.name || cls}`
      );
    };

    // Errors
    matchers.toThrow = function(expected) {
      let threw = false;
      let error;
      try { actual(); } catch (e) { threw = true; error = e; }

      if (negated) {
        // not.toThrow() or not.toThrow('msg')
        if (!threw) return; // didn't throw — always passes for .not
        if (arguments.length > 0 && expected !== undefined) {
          // not.toThrow('msg') — should not throw with this specific message
          const msg = error && error.message ? error.message : String(error);
          let matches = false;
          if (typeof expected === 'string') matches = msg.includes(expected);
          else if (expected instanceof RegExp) matches = expected.test(msg);
          else if (typeof expected === 'function') matches = error instanceof expected;
          if (matches) {
            throw new Error(`Expected function not to throw matching "${expected}", but it did: ${msg}`);
          }
          // Threw but didn't match the expected — that's OK for .not
        } else {
          // not.toThrow() — should not throw at all
          const msg = error && error.message ? error.message : String(error);
          throw new Error(`Expected function not to throw, but it threw: ${msg}`);
        }
      } else {
        // toThrow(): should throw
        if (!threw) throw new Error('Expected function to throw');
        if (arguments.length > 0 && expected !== undefined) {
          const msg = error && error.message ? error.message : String(error);
          if (typeof expected === 'string') {
            if (!msg.includes(expected)) {
              throw new Error(`Expected throw message to include "${expected}", got "${msg}"`);
            }
          } else if (expected instanceof RegExp) {
            if (!expected.test(msg)) {
              throw new Error(`Expected throw message to match ${expected}, got "${msg}"`);
            }
          } else if (typeof expected === 'function') {
            if (!(error instanceof expected)) {
              throw new Error(`Expected throw to be instance of ${expected.name}`);
            }
          }
        }
      }
    };
    matchers.toThrowError = matchers.toThrow;

    // Mock matchers
    matchers.toHaveBeenCalled = () => {
      if (!actual || !actual[MOCK_BRAND]) throw new Error('toHaveBeenCalled requires a mock function');
      assert(actual.mock.calls.length > 0, () =>
        `Expected mock ${negated ? 'not ' : ''}to have been called, but it was called ${actual.mock.calls.length} times`
      );
    };
    matchers.toHaveBeenCalledOnce = () => {
      if (!actual || !actual[MOCK_BRAND]) throw new Error('toHaveBeenCalledOnce requires a mock function');
      assert(actual.mock.calls.length === 1, () =>
        `Expected mock ${negated ? 'not ' : ''}to have been called once, but it was called ${actual.mock.calls.length} times`
      );
    };
    matchers.toHaveBeenCalledTimes = (n) => {
      if (!actual || !actual[MOCK_BRAND]) throw new Error('toHaveBeenCalledTimes requires a mock function');
      assert(actual.mock.calls.length === n, () =>
        `Expected mock ${negated ? 'not ' : ''}to have been called ${n} times, but it was called ${actual.mock.calls.length} times`
      );
    };
    matchers.toHaveBeenCalledWith = (...expectedArgs) => {
      if (!actual || !actual[MOCK_BRAND]) throw new Error('toHaveBeenCalledWith requires a mock function');
      const found = actual.mock.calls.some(call => deepEqual(call, expectedArgs));
      assert(found, () =>
        `Expected mock ${negated ? 'not ' : ''}to have been called with ${formatValue(expectedArgs)}`
      );
    };
    matchers.toHaveBeenLastCalledWith = (...expectedArgs) => {
      if (!actual || !actual[MOCK_BRAND]) throw new Error('toHaveBeenLastCalledWith requires a mock function');
      const last = actual.mock.lastCall;
      assert(last !== undefined && deepEqual(last, expectedArgs), () =>
        `Expected mock ${negated ? 'not ' : ''}to have been last called with ${formatValue(expectedArgs)}, got ${formatValue(last)}`
      );
    };

    // Apply custom matchers
    for (const [name, matcherFn] of Object.entries(customMatchers)) {
      matchers[name] = (...args) => {
        const result = matcherFn(actual, ...args);
        const effective = negated ? !result.pass : result.pass;
        if (!effective) {
          throw new Error(result.message());
        }
      };
    }

    return matchers;
  }

  // Registry for custom matchers added via expect.extend()
  const customMatchers = {};

  function createAsyncMatchers(actualPromise, negated, isReject) {
    const proxy = {};
    // For .resolves: await the promise, run matchers on resolved value
    // For .rejects: await rejection, wrap thrown value for toThrow/toBeInstanceOf
    const wrapMatcher = (matcherName) => {
      return (...args) => {
        if (isReject) {
          return actualPromise.then(
            () => { throw new Error(`Expected promise to reject, but it resolved`); },
            (err) => {
              // For toThrow/toThrowError: wrap err in a function so toThrow can call it
              if (matcherName === 'toThrow' || matcherName === 'toThrowError') {
                const thrower = () => { throw err; };
                createMatchers(thrower, negated)[matcherName](...args);
              } else {
                createMatchers(err, negated)[matcherName](...args);
              }
            }
          );
        } else {
          return actualPromise.then((resolved) => {
            createMatchers(resolved, negated)[matcherName](...args);
          });
        }
      };
    };

    // Build all matcher methods as async wrappers (including custom matchers)
    const builtinNames = [
      'toBe', 'toEqual', 'toBeTruthy', 'toBeFalsy', 'toBeNull', 'toBeUndefined',
      'toBeDefined', 'toBeGreaterThan', 'toBeGreaterThanOrEqual', 'toBeLessThan',
      'toBeLessThanOrEqual', 'toContain', 'toContainEqual', 'toHaveLength', 'toMatch',
      'toBeCloseTo', 'toBeTypeOf', 'toBeFunction', 'toHaveProperty', 'toBeInstanceOf',
      'toMatchObject', 'toThrow', 'toThrowError', 'toHaveBeenCalled', 'toHaveBeenCalledOnce',
      'toHaveBeenCalledTimes', 'toHaveBeenCalledWith', 'toHaveBeenLastCalledWith',
    ];
    const matcherNames = [...builtinNames, ...Object.keys(customMatchers)];

    for (const name of matcherNames) {
      proxy[name] = wrapMatcher(name);
    }

    if (!negated) {
      proxy.not = createAsyncMatchers(actualPromise, true, isReject);
    }

    return proxy;
  }

  function expect(actual) {
    const matchers = createMatchers(actual, false);
    matchers.not = createMatchers(actual, true);
    matchers.resolves = createAsyncMatchers(actual, false, false);
    matchers.rejects = createAsyncMatchers(actual, false, true);
    return matchers;
  }

  expect.extend = (newMatchers) => {
    Object.assign(customMatchers, newMatchers);
  };

  // --- Asymmetric Matcher Factories ---
  expect.any = (constructor) => asymmetric(
    (received) => received instanceof constructor || (constructor === String && typeof received === 'string')
      || (constructor === Number && typeof received === 'number')
      || (constructor === Boolean && typeof received === 'boolean')
      || (constructor === Function && typeof received === 'function')
      || (constructor === BigInt && typeof received === 'bigint')
      || (constructor === Symbol && typeof received === 'symbol')
      || (constructor === Array && Array.isArray(received)),
    `Any<${constructor.name || constructor}>`
  );

  expect.anything = () => asymmetric(
    (received) => received !== null && received !== undefined,
    'Anything'
  );

  expect.objectContaining = (expected) => asymmetric(
    (received) => {
      if (received == null || typeof received !== 'object') return false;
      for (const key of Object.keys(expected)) {
        if (!(key in received)) return false;
        if (!deepEqual(received[key], expected[key])) return false;
      }
      return true;
    },
    `ObjectContaining(${formatValue(expected)})`
  );

  expect.arrayContaining = (expected) => asymmetric(
    (received) => {
      if (!Array.isArray(received)) return false;
      return expected.every(item => received.some(el => deepEqual(el, item)));
    },
    `ArrayContaining(${formatValue(expected)})`
  );

  expect.stringContaining = (expected) => asymmetric(
    (received) => typeof received === 'string' && received.includes(expected),
    `StringContaining("${expected}")`
  );

  expect.stringMatching = (pattern) => asymmetric(
    (received) => {
      const re = pattern instanceof RegExp ? pattern : new RegExp(pattern);
      return typeof received === 'string' && re.test(received);
    },
    `StringMatching(${pattern})`
  );

  // --- Test Runner ---

  async function runHooks(hooks) {
    for (const hook of hooks) {
      await hook();
    }
  }

  function shouldRun(item, parentOnly) {
    if (item.skip) return false;
    if (hasOnly) {
      // If any .only exists, run items marked .only, children of .only parents,
      // or suites that contain .only items somewhere in their tree
      return item.only || parentOnly || containsOnly(item);
    }
    return true;
  }

  function containsOnly(suite) {
    if (suite.only) return true;
    for (const t of suite.tests) { if (t.only) return true; }
    for (const s of suite.suites) { if (containsOnly(s)) return true; }
    return false;
  }

  async function runSuite(suite, parentPath, parentOnly, ancestorBeforeEach, ancestorAfterEach) {
    const results = [];
    const suitePath = suite.name ? (parentPath ? `${parentPath} > ${suite.name}` : suite.name) : parentPath;
    const suiteRunnable = shouldRun(suite, parentOnly);

    // Compose hooks: ancestor hooks + this suite's hooks
    const allBeforeEach = ancestorBeforeEach ? [...ancestorBeforeEach, ...suite.beforeEach] : [...suite.beforeEach];
    const allAfterEach = ancestorAfterEach ? [...suite.afterEach, ...ancestorAfterEach] : [...suite.afterEach];

    if (suiteRunnable) {
      await runHooks(suite.beforeAll);
    }

    for (const test of suite.tests) {
      if (test.todo) {
        results.push({ name: test.name, path: suitePath, status: 'todo', duration: 0 });
        continue;
      }
      // Apply name filter: skip tests whose full name doesn't include the filter substring
      const filter = globalThis.__vertz_test_filter || null;
      const fullName = suitePath ? `${suitePath} > ${test.name}` : test.name;
      const matchesFilter = !filter || fullName.includes(filter);
      const testRunnable = matchesFilter && !test.skip && suiteRunnable && (!hasOnly || test.only || parentOnly || suite.only);
      if (!testRunnable) {
        results.push({ name: test.name, path: suitePath, status: 'skip', duration: 0 });
        continue;
      }

      const start = performance.now();
      let error = null;

      // Run all beforeEach hooks (ancestors first, then this suite's)
      try {
        await runHooks(allBeforeEach);
      } catch (e) {
        error = e;
      }

      // Run test
      if (!error) {
        try {
          await test.fn();
        } catch (e) {
          error = e;
        }
      }

      // Run afterEach hooks even if test threw (this suite's first, then ancestors)
      try {
        await runHooks(allAfterEach);
      } catch (e) {
        if (!error) error = e;
      }

      const duration = performance.now() - start;
      if (error) {
        results.push({
          name: test.name,
          path: suitePath,
          status: 'fail',
          duration,
          error: { message: error.message || String(error), stack: error.stack || '' },
        });
      } else {
        results.push({ name: test.name, path: suitePath, status: 'pass', duration });
      }
    }

    // Recurse into nested suites, passing accumulated hooks
    for (const child of suite.suites) {
      const childResults = await runSuite(child, suitePath, suiteRunnable && (parentOnly || suite.only), allBeforeEach, allAfterEach);
      results.push(...childResults);
    }

    if (suiteRunnable) {
      await runHooks(suite.afterAll);
    }

    return results;
  }

  // This function is called by the Rust executor after the test file is loaded.
  // Optional filter: if globalThis.__vertz_test_filter is set, only tests whose
  // full name (path > name) includes the filter substring will run.
  globalThis.__vertz_run_tests = async function() {
    // Root-level beforeAll/afterAll
    await runHooks(rootHooks.beforeAll);

    const allResults = [];
    for (const suite of suites) {
      // Pass root-level hooks as ancestor hooks so they compose with suite hooks
      const results = await runSuite(suite, '', false, rootHooks.beforeEach, rootHooks.afterEach);
      allResults.push(...results);
    }

    await runHooks(rootHooks.afterAll);

    return allResults;
  };

  // --- Timer Mocking ---
  let fakeTimersActive = false;
  let timerIdCounter = 1;
  const pendingTimers = new Map(); // id -> { fn, delay, due, repeat, interval }
  const realSetTimeout = globalThis.setTimeout;
  const realClearTimeout = globalThis.clearTimeout;
  const realSetInterval = globalThis.setInterval;
  const realClearInterval = globalThis.clearInterval;
  const realDateNow = Date.now;
  let fakeNow = 0;

  function installFakeTimers() {
    if (fakeTimersActive) return;
    fakeTimersActive = true;
    fakeNow = Date.now();
    pendingTimers.clear();
    timerIdCounter = 1;

    globalThis.setTimeout = (fn, delay, ...args) => {
      const id = timerIdCounter++;
      pendingTimers.set(id, { fn, args, delay: delay || 0, due: fakeNow + (delay || 0), repeat: false });
      return id;
    };
    globalThis.clearTimeout = (id) => { pendingTimers.delete(id); };
    globalThis.setInterval = (fn, delay, ...args) => {
      const id = timerIdCounter++;
      pendingTimers.set(id, { fn, args, delay: delay || 0, due: fakeNow + (delay || 0), repeat: true, interval: delay || 0 });
      return id;
    };
    globalThis.clearInterval = (id) => { pendingTimers.delete(id); };
    // Mock Date.now() to return fake time
    Date.now = () => fakeNow;
  }

  function uninstallFakeTimers() {
    if (!fakeTimersActive) return;
    fakeTimersActive = false;
    globalThis.setTimeout = realSetTimeout;
    globalThis.clearTimeout = realClearTimeout;
    globalThis.setInterval = realSetInterval;
    globalThis.clearInterval = realClearInterval;
    Date.now = realDateNow;
    pendingTimers.clear();
  }

  function advanceTimersByTime(ms) {
    if (!fakeTimersActive) throw new Error('Fake timers are not installed. Call vi.useFakeTimers() first.');
    const target = fakeNow + ms;
    // Process timers due at or before target, in chronological order.
    // Uses <= so advanceTimersByTime(0) fires 0-delay timers.
    for (;;) {
      let earliest = null;
      let earliestId = null;
      for (const [id, timer] of pendingTimers) {
        if (timer.due <= target && (earliest === null || timer.due < earliest.due)) {
          earliest = timer;
          earliestId = id;
        }
      }
      if (!earliest) break;
      fakeNow = earliest.due;
      pendingTimers.delete(earliestId);
      if (earliest.repeat) {
        const nextId = timerIdCounter++;
        pendingTimers.set(nextId, { ...earliest, due: fakeNow + earliest.interval });
      }
      earliest.fn(...(earliest.args || []));
    }
    fakeNow = target;
  }

  function runAllTimers() {
    if (!fakeTimersActive) throw new Error('Fake timers are not installed. Call vi.useFakeTimers() first.');
    // Process all pending non-repeating timers + one tick of each interval.
    // Snapshot IDs first to avoid infinite loop with setInterval re-enqueueing.
    let limit = 10000;
    while (pendingTimers.size > 0 && limit-- > 0) {
      // Snapshot current timer IDs
      const currentIds = [...pendingTimers.keys()];
      // Sort by due time
      currentIds.sort((a, b) => pendingTimers.get(a).due - pendingTimers.get(b).due);
      let ran = false;
      for (const id of currentIds) {
        const timer = pendingTimers.get(id);
        if (!timer) continue;
        fakeNow = timer.due;
        pendingTimers.delete(id);
        // Repeating timers do NOT re-enqueue in runAllTimers — they'd cause infinite loops.
        // runAllTimers flushes all pending timers exactly once.
        timer.fn(...(timer.args || []));
        ran = true;
      }
      if (!ran) break;
      // If new non-repeat timers were added by callbacks, loop processes them.
      // Repeat timers were NOT re-enqueued, so they won't accumulate.
    }
  }

  function runOnlyPendingTimers() {
    if (!fakeTimersActive) throw new Error('Fake timers are not installed. Call vi.useFakeTimers() first.');
    // Snapshot current timers — only run those, not ones added during execution.
    // Intervals get their next tick scheduled (re-enqueued) but not run.
    const snapshot = [...pendingTimers.entries()].sort((a, b) => a[1].due - b[1].due);
    for (const [id, timer] of snapshot) {
      if (pendingTimers.has(id)) {
        fakeNow = timer.due;
        pendingTimers.delete(id);
        if (timer.repeat) {
          const nextId = timerIdCounter++;
          pendingTimers.set(nextId, { ...timer, due: fakeNow + timer.interval });
        }
        timer.fn(...(timer.args || []));
      }
    }
  }

  // vi namespace for vitest/bun:test compatibility
  const vi = {
    fn: (impl) => mock(impl),
    spyOn: (obj, method) => spyOn(obj, method),
    useFakeTimers: () => { installFakeTimers(); return vi; },
    useRealTimers: () => { uninstallFakeTimers(); return vi; },
    advanceTimersByTime: (ms) => { advanceTimersByTime(ms); return vi; },
    runAllTimers: () => { runAllTimers(); return vi; },
    runOnlyPendingTimers: () => { runOnlyPendingTimers(); return vi; },
    restoreAllMocks: () => { for (const m of allMocks) m.mockRestore(); },
    clearAllMocks: () => { for (const m of allMocks) m.mockClear(); },
    resetAllMocks: () => { for (const m of allMocks) m.mockReset(); },
    mock: (modulePath, factory) => {
      // Module mocking stub — stores factory for future module loader integration.
      // The factory is NOT auto-invoked; the caller is responsible for calling it
      // when module resolution is intercepted. Full support requires compiler-level
      // hoisting and Rust module loader changes.
      if (!globalThis.__vertz_mocked_modules) globalThis.__vertz_mocked_modules = {};
      globalThis.__vertz_mocked_modules[modulePath] = factory;
    },
  };

  // mock.module() — Bun-compatible module mocking stub
  mock.module = (modulePath, factory) => {
    vi.mock(modulePath, factory);
  };

  // --- skipIf / each modifiers ---
  it.skipIf = (condition) => condition ? it.skip : it;
  describe.skipIf = (condition) => condition ? describe.skip : describe;

  // Compose .each with .only/.skip
  function makeEach(register) {
    return (table) => (name, fn) => {
      for (let i = 0; i < table.length; i++) {
        const row = table[i];
        const items = Array.isArray(row) ? row : [row];
        let argIdx = 0;
        const testName = name.replace(/%s/g, () => String(items[argIdx++]))
                             .replace(/%i/g, String(i))
                             .replace(/%#/g, String(i));
        register(testName, () => fn(...items));
      }
    };
  }

  it.each = makeEach(it);
  it.only.each = makeEach(it.only);
  it.skip.each = makeEach(it.skip);
  describe.each = makeEach(describe);
  describe.only.each = makeEach(describe.only);
  describe.skip.each = makeEach(describe.skip);

  // Export to globalThis for test files
  globalThis.describe = describe;
  globalThis.it = it;
  globalThis.test = test;
  globalThis.expect = expect;
  globalThis.beforeEach = beforeEach;
  globalThis.afterEach = afterEach;
  globalThis.beforeAll = beforeAll;
  globalThis.afterAll = afterAll;
  globalThis.mock = mock;
  globalThis.spyOn = spyOn;
  globalThis.vi = vi;

  // expectTypeOf — no-op at runtime (type-level assertions only matter at compile time).
  // Returns a chainable proxy so `expectTypeOf<T>().toEqualTypeOf<U>()` etc. don't crash.
  const expectTypeOfHandler = {
    get() { return function() { return new Proxy({}, expectTypeOfHandler); }; },
    apply() { return new Proxy({}, expectTypeOfHandler); },
  };
  function expectTypeOf() { return new Proxy({}, expectTypeOfHandler); }

  // Exports object — module loader will intercept
  // `import { describe, it, expect } from '@vertz/test'` and return these.
  globalThis.__vertz_test_exports = {
    describe, it, test, expect,
    beforeEach, afterEach, beforeAll, afterAll,
    mock, spyOn, vi, expectTypeOf,
  };
})();
"#;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime::js_runtime::{VertzJsRuntime, VertzRuntimeOptions};

    fn create_test_runtime() -> VertzJsRuntime {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions {
            capture_output: true,
            ..Default::default()
        })
        .unwrap();
        // Inject the test harness
        rt.execute_script_void("[vertz:test-harness]", TEST_HARNESS_JS)
            .unwrap();
        rt
    }

    fn run_test_code(rt: &mut VertzJsRuntime, code: &str) -> serde_json::Value {
        // Register tests
        rt.execute_script_void("[test-file]", code).unwrap();
        // Run and get results
        // Since __vertz_run_tests is async, we need the event loop
        let tokio_rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        tokio_rt.block_on(async {
            rt.execute_script(
                "[run]",
                "globalThis.__vertz_run_tests().then(r => globalThis.__test_results = r)",
            )
            .unwrap();
            rt.run_event_loop().await.unwrap();
            rt.execute_script("[collect]", "globalThis.__test_results")
                .unwrap()
        })
    }

    #[test]
    fn test_passing_test() {
        let mut rt = create_test_runtime();
        let results = run_test_code(
            &mut rt,
            r#"
            describe('math', () => {
                it('adds', () => {
                    expect(1 + 1).toBe(2);
                });
            });
            "#,
        );

        let arr = results.as_array().unwrap();
        assert_eq!(arr.len(), 1);
        assert_eq!(arr[0]["status"], "pass");
        assert_eq!(arr[0]["name"], "adds");
        assert_eq!(arr[0]["path"], "math");
    }

    #[test]
    fn test_failing_test() {
        let mut rt = create_test_runtime();
        let results = run_test_code(
            &mut rt,
            r#"
            describe('math', () => {
                it('fails', () => {
                    expect(1 + 1).toBe(3);
                });
            });
            "#,
        );

        let arr = results.as_array().unwrap();
        assert_eq!(arr.len(), 1);
        assert_eq!(arr[0]["status"], "fail");
        assert!(arr[0]["error"]["message"]
            .as_str()
            .unwrap()
            .contains("to be 3"));
    }

    #[test]
    fn test_multiple_tests() {
        let mut rt = create_test_runtime();
        let results = run_test_code(
            &mut rt,
            r#"
            describe('suite', () => {
                it('passes', () => { expect(true).toBeTruthy(); });
                it('also passes', () => { expect(false).toBeFalsy(); });
            });
            "#,
        );

        let arr = results.as_array().unwrap();
        assert_eq!(arr.len(), 2);
        assert_eq!(arr[0]["status"], "pass");
        assert_eq!(arr[1]["status"], "pass");
    }

    #[test]
    fn test_skip_modifier() {
        let mut rt = create_test_runtime();
        let results = run_test_code(
            &mut rt,
            r#"
            describe('suite', () => {
                it('runs', () => { expect(1).toBe(1); });
                it.skip('skipped', () => { expect(1).toBe(2); });
            });
            "#,
        );

        let arr = results.as_array().unwrap();
        assert_eq!(arr.len(), 2);
        assert_eq!(arr[0]["status"], "pass");
        assert_eq!(arr[1]["status"], "skip");
    }

    #[test]
    fn test_only_modifier() {
        let mut rt = create_test_runtime();
        let results = run_test_code(
            &mut rt,
            r#"
            describe('suite', () => {
                it.only('focused', () => { expect(1).toBe(1); });
                it('not focused', () => { expect(1).toBe(2); });
            });
            "#,
        );

        let arr = results.as_array().unwrap();
        assert_eq!(arr.len(), 2);
        assert_eq!(arr[0]["status"], "pass");
        assert_eq!(arr[0]["name"], "focused");
        assert_eq!(arr[1]["status"], "skip");
    }

    #[test]
    fn test_todo_modifier() {
        let mut rt = create_test_runtime();
        let results = run_test_code(
            &mut rt,
            r#"
            describe('suite', () => {
                it.todo('not implemented yet');
            });
            "#,
        );

        let arr = results.as_array().unwrap();
        assert_eq!(arr.len(), 1);
        assert_eq!(arr[0]["status"], "todo");
        assert_eq!(arr[0]["name"], "not implemented yet");
    }

    #[test]
    fn test_describe_skip() {
        let mut rt = create_test_runtime();
        let results = run_test_code(
            &mut rt,
            r#"
            describe.skip('skipped suite', () => {
                it('should not run', () => { throw new Error('should not run'); });
            });
            "#,
        );

        let arr = results.as_array().unwrap();
        assert_eq!(arr.len(), 1);
        assert_eq!(arr[0]["status"], "skip");
    }

    #[test]
    fn test_before_each_after_each() {
        let mut rt = create_test_runtime();
        let results = run_test_code(
            &mut rt,
            r#"
            const log = [];
            describe('hooks', () => {
                beforeEach(() => { log.push('before'); });
                afterEach(() => { log.push('after'); });
                it('test 1', () => { log.push('test1'); expect(log).toEqual(['before', 'test1']); });
                it('test 2', () => { log.push('test2'); expect(log).toEqual(['before', 'test1', 'after', 'before', 'test2']); });
            });
            "#,
        );

        let arr = results.as_array().unwrap();
        assert_eq!(arr.len(), 2);
        assert_eq!(arr[0]["status"], "pass");
        assert_eq!(arr[1]["status"], "pass");
    }

    #[test]
    fn test_after_each_runs_even_on_failure() {
        let mut rt = create_test_runtime();
        let results = run_test_code(
            &mut rt,
            r#"
            let cleaned = false;
            describe('cleanup', () => {
                afterEach(() => { cleaned = true; });
                it('fails', () => { throw new Error('boom'); });
            });
            // Verify cleanup ran
            describe('verify', () => {
                it('cleanup ran', () => { expect(cleaned).toBe(true); });
            });
            "#,
        );

        let arr = results.as_array().unwrap();
        assert_eq!(arr.len(), 2);
        assert_eq!(arr[0]["status"], "fail");
        assert_eq!(arr[1]["status"], "pass");
        assert_eq!(arr[1]["name"], "cleanup ran");
    }

    #[test]
    fn test_nested_describe() {
        let mut rt = create_test_runtime();
        let results = run_test_code(
            &mut rt,
            r#"
            describe('outer', () => {
                describe('inner', () => {
                    it('deep test', () => { expect(true).toBe(true); });
                });
            });
            "#,
        );

        let arr = results.as_array().unwrap();
        assert_eq!(arr.len(), 1);
        assert_eq!(arr[0]["path"], "outer > inner");
        assert_eq!(arr[0]["name"], "deep test");
    }

    #[test]
    fn test_not_negation() {
        let mut rt = create_test_runtime();
        let results = run_test_code(
            &mut rt,
            r#"
            describe('not', () => {
                it('not.toBe', () => { expect(1).not.toBe(2); });
                it('not.toContain', () => { expect([1, 2, 3]).not.toContain(4); });
                it('not.toBeNull', () => { expect(42).not.toBeNull(); });
            });
            "#,
        );

        let arr = results.as_array().unwrap();
        assert_eq!(arr.len(), 3);
        for item in arr {
            assert_eq!(item["status"], "pass");
        }
    }

    #[test]
    fn test_to_equal_deep() {
        let mut rt = create_test_runtime();
        let results = run_test_code(
            &mut rt,
            r#"
            describe('deep equality', () => {
                it('objects', () => {
                    expect({ a: 1, b: { c: 2 } }).toEqual({ a: 1, b: { c: 2 } });
                });
                it('arrays', () => {
                    expect([1, [2, 3]]).toEqual([1, [2, 3]]);
                });
            });
            "#,
        );

        let arr = results.as_array().unwrap();
        assert_eq!(arr.len(), 2);
        assert_eq!(arr[0]["status"], "pass");
        assert_eq!(arr[1]["status"], "pass");
    }

    #[test]
    fn test_to_throw() {
        let mut rt = create_test_runtime();
        let results = run_test_code(
            &mut rt,
            r#"
            describe('toThrow', () => {
                it('catches throw', () => {
                    expect(() => { throw new Error('boom'); }).toThrow();
                });
                it('matches message', () => {
                    expect(() => { throw new Error('specific error'); }).toThrow('specific');
                });
                it('not.toThrow passes for non-throwing', () => {
                    expect(() => { return 42; }).not.toThrow();
                });
            });
            "#,
        );

        let arr = results.as_array().unwrap();
        assert_eq!(arr.len(), 3);
        for (i, item) in arr.iter().enumerate() {
            assert_eq!(
                item["status"], "pass",
                "Test {} ({}) failed: {:?}",
                i, item["name"], item["error"]
            );
        }
    }

    #[test]
    fn test_to_have_property() {
        let mut rt = create_test_runtime();
        let results = run_test_code(
            &mut rt,
            r#"
            describe('toHaveProperty', () => {
                it('checks key exists', () => {
                    expect({ name: 'test' }).toHaveProperty('name');
                });
                it('checks key + value', () => {
                    expect({ name: 'test' }).toHaveProperty('name', 'test');
                });
            });
            "#,
        );

        let arr = results.as_array().unwrap();
        assert_eq!(arr.len(), 2);
        assert_eq!(arr[0]["status"], "pass");
        assert_eq!(arr[1]["status"], "pass");
    }

    #[test]
    fn test_to_be_instance_of() {
        let mut rt = create_test_runtime();
        let results = run_test_code(
            &mut rt,
            r#"
            describe('toBeInstanceOf', () => {
                it('checks class', () => {
                    expect(new Error('x')).toBeInstanceOf(Error);
                });
            });
            "#,
        );

        let arr = results.as_array().unwrap();
        assert_eq!(arr.len(), 1);
        assert_eq!(arr[0]["status"], "pass");
    }

    #[test]
    fn test_duration_is_recorded() {
        let mut rt = create_test_runtime();
        let results = run_test_code(
            &mut rt,
            r#"
            describe('timing', () => {
                it('has duration', () => { expect(1).toBe(1); });
            });
            "#,
        );

        let arr = results.as_array().unwrap();
        let duration = arr[0]["duration"].as_f64().unwrap();
        assert!(duration >= 0.0, "Duration should be non-negative");
    }

    #[test]
    fn test_nested_before_each_inheritance() {
        let mut rt = create_test_runtime();
        let results = run_test_code(
            &mut rt,
            r#"
            const log = [];
            describe('outer', () => {
                beforeEach(() => { log.push('outer-before'); });
                afterEach(() => { log.push('outer-after'); });

                describe('inner', () => {
                    beforeEach(() => { log.push('inner-before'); });
                    afterEach(() => { log.push('inner-after'); });

                    it('runs all hooks in order', () => {
                        log.push('test');
                        expect(log).toEqual(['outer-before', 'inner-before', 'test']);
                    });
                });
            });
            "#,
        );

        let arr = results.as_array().unwrap();
        assert_eq!(arr.len(), 1);
        assert_eq!(
            arr[0]["status"], "pass",
            "Nested hooks should compose: {:?}",
            arr[0]["error"]
        );
    }

    #[test]
    fn test_deep_equal_date_regexp_nan() {
        let mut rt = create_test_runtime();
        let results = run_test_code(
            &mut rt,
            r#"
            describe('deepEqual edge cases', () => {
                it('Date comparison by time', () => {
                    expect(new Date(0)).toEqual(new Date(0));
                    expect(new Date(0)).not.toEqual(new Date(1));
                });
                it('RegExp comparison by source+flags', () => {
                    expect(/abc/g).toEqual(/abc/g);
                    expect(/abc/).not.toEqual(/def/);
                    expect(/abc/g).not.toEqual(/abc/i);
                });
                it('NaN equals NaN', () => {
                    expect(NaN).toEqual(NaN);
                });
            });
            "#,
        );

        let arr = results.as_array().unwrap();
        assert_eq!(arr.len(), 3);
        for (i, item) in arr.iter().enumerate() {
            assert_eq!(
                item["status"], "pass",
                "Test {} ({}) failed: {:?}",
                i, item["name"], item["error"]
            );
        }
    }

    #[test]
    fn test_top_level_hooks() {
        let mut rt = create_test_runtime();
        let results = run_test_code(
            &mut rt,
            r#"
            const log = [];
            beforeEach(() => { log.push('top-before'); });
            afterEach(() => { log.push('top-after'); });

            describe('suite', () => {
                it('test 1', () => {
                    log.push('test1');
                    expect(log).toEqual(['top-before', 'test1']);
                });
                it('test 2', () => {
                    log.push('test2');
                    expect(log).toEqual(['top-before', 'test1', 'top-after', 'top-before', 'test2']);
                });
            });
            "#,
        );

        let arr = results.as_array().unwrap();
        assert_eq!(arr.len(), 2);
        for (i, item) in arr.iter().enumerate() {
            assert_eq!(
                item["status"], "pass",
                "Top-level hook test {} failed: {:?}",
                i, item["error"]
            );
        }
    }

    #[test]
    fn test_filter_by_name() {
        let mut rt = create_test_runtime();
        // Set filter
        rt.execute_script_void("[set-filter]", "globalThis.__vertz_test_filter = 'math'")
            .unwrap();
        let results = run_test_code(
            &mut rt,
            r#"
            describe('math', () => {
                it('adds', () => { expect(1 + 1).toBe(2); });
                it('subtracts', () => { expect(5 - 3).toBe(2); });
            });
            describe('string', () => {
                it('trims', () => { expect(' x '.trim()).toBe('x'); });
            });
            "#,
        );

        let arr = results.as_array().unwrap();
        // Filter 'math' should match 'math > adds' and 'math > subtracts'.
        // 'string > trims' doesn't match filter and should be skipped (not executed).
        assert_eq!(
            arr.len(),
            3,
            "All tests should appear in results: {:?}",
            arr
        );
        assert_eq!(arr[0]["name"], "adds");
        assert_eq!(arr[0]["status"], "pass");
        assert_eq!(arr[1]["name"], "subtracts");
        assert_eq!(arr[1]["status"], "pass");
        assert_eq!(arr[2]["name"], "trims");
        assert_eq!(arr[2]["status"], "skip");
    }

    #[test]
    fn test_to_contain_equal() {
        let mut rt = create_test_runtime();
        let results = run_test_code(
            &mut rt,
            r#"
            describe('toContainEqual', () => {
                it('finds deep-equal item in array', () => {
                    expect([{ a: 1 }, { b: 2 }]).toContainEqual({ a: 1 });
                });
                it('fails when no deep-equal item exists', () => {
                    let caught = false;
                    try {
                        expect([{ a: 1 }]).toContainEqual({ a: 2 });
                    } catch (e) {
                        caught = true;
                    }
                    expect(caught).toBe(true);
                });
                it('works with .not', () => {
                    expect([{ a: 1 }]).not.toContainEqual({ a: 2 });
                });
            });
            "#,
        );

        let arr = results.as_array().unwrap();
        assert_eq!(arr.len(), 3);
        for (i, item) in arr.iter().enumerate() {
            assert_eq!(
                item["status"], "pass",
                "toContainEqual test {} failed: {:?}",
                i, item["error"]
            );
        }
    }

    #[test]
    fn test_to_be_close_to() {
        let mut rt = create_test_runtime();
        let results = run_test_code(
            &mut rt,
            r#"
            describe('toBeCloseTo', () => {
                it('compares floats with default precision (2)', () => {
                    expect(0.1 + 0.2).toBeCloseTo(0.3);
                });
                it('compares with custom precision', () => {
                    expect(0.1 + 0.2).toBeCloseTo(0.3, 5);
                });
                it('fails when not close enough', () => {
                    let caught = false;
                    try {
                        expect(0.1).toBeCloseTo(0.5);
                    } catch (e) {
                        caught = true;
                    }
                    expect(caught).toBe(true);
                });
                it('works with .not', () => {
                    expect(0.1).not.toBeCloseTo(0.5);
                });
            });
            "#,
        );

        let arr = results.as_array().unwrap();
        assert_eq!(arr.len(), 4);
        for (i, item) in arr.iter().enumerate() {
            assert_eq!(
                item["status"], "pass",
                "toBeCloseTo test {} failed: {:?}",
                i, item["error"]
            );
        }
    }

    #[test]
    fn test_to_be_type_of() {
        let mut rt = create_test_runtime();
        let results = run_test_code(
            &mut rt,
            r#"
            describe('toBeTypeOf', () => {
                it('checks string', () => { expect('hello').toBeTypeOf('string'); });
                it('checks number', () => { expect(42).toBeTypeOf('number'); });
                it('checks boolean', () => { expect(true).toBeTypeOf('boolean'); });
                it('checks function', () => { expect(() => {}).toBeTypeOf('function'); });
                it('checks object', () => { expect({}).toBeTypeOf('object'); });
                it('checks undefined', () => { expect(undefined).toBeTypeOf('undefined'); });
                it('works with .not', () => { expect(42).not.toBeTypeOf('string'); });
            });
            "#,
        );

        let arr = results.as_array().unwrap();
        assert_eq!(arr.len(), 7);
        for (i, item) in arr.iter().enumerate() {
            assert_eq!(
                item["status"], "pass",
                "toBeTypeOf test {} failed: {:?}",
                i, item["error"]
            );
        }
    }

    #[test]
    fn test_to_be_function() {
        let mut rt = create_test_runtime();
        let results = run_test_code(
            &mut rt,
            r#"
            describe('toBeFunction', () => {
                it('passes for functions', () => {
                    expect(() => {}).toBeFunction();
                    expect(function() {}).toBeFunction();
                });
                it('fails for non-functions', () => {
                    let caught = false;
                    try { expect(42).toBeFunction(); } catch (e) { caught = true; }
                    expect(caught).toBe(true);
                });
                it('works with .not', () => {
                    expect(42).not.toBeFunction();
                });
            });
            "#,
        );

        let arr = results.as_array().unwrap();
        assert_eq!(arr.len(), 3);
        for (i, item) in arr.iter().enumerate() {
            assert_eq!(
                item["status"], "pass",
                "toBeFunction test {} failed: {:?}",
                i, item["error"]
            );
        }
    }

    #[test]
    fn test_mock_basic_call_tracking() {
        let mut rt = create_test_runtime();
        let results = run_test_code(
            &mut rt,
            r#"
            describe('mock() call tracking', () => {
                it('tracks calls', () => {
                    const fn = mock(() => 42);
                    fn(1, 2);
                    fn(3);
                    expect(fn.mock.calls).toEqual([[1, 2], [3]]);
                    expect(fn.mock.calls.length).toBe(2);
                });
                it('tracks results', () => {
                    const fn = mock(() => 'hello');
                    fn();
                    expect(fn.mock.results).toEqual([{ type: 'return', value: 'hello' }]);
                });
                it('tracks lastCall', () => {
                    const fn = mock(() => {});
                    fn('a');
                    fn('b', 'c');
                    expect(fn.mock.lastCall).toEqual(['b', 'c']);
                });
                it('returns implementation result', () => {
                    const fn = mock((x) => x * 2);
                    expect(fn(5)).toBe(10);
                });
                it('default mock returns undefined', () => {
                    const fn = mock();
                    expect(fn()).toBeUndefined();
                });
            });
            "#,
        );

        let arr = results.as_array().unwrap();
        assert_eq!(arr.len(), 5);
        for (i, item) in arr.iter().enumerate() {
            assert_eq!(
                item["status"], "pass",
                "mock() basic test {} ({}) failed: {:?}",
                i, item["name"], item["error"]
            );
        }
    }

    #[test]
    fn test_mock_chaining_methods() {
        let mut rt = create_test_runtime();
        let results = run_test_code(
            &mut rt,
            r#"
            describe('mock() chaining', () => {
                it('mockReturnValue', () => {
                    const fn = mock();
                    fn.mockReturnValue(99);
                    expect(fn()).toBe(99);
                    expect(fn()).toBe(99);
                });
                it('mockImplementation', () => {
                    const fn = mock();
                    fn.mockImplementation((x) => x + 1);
                    expect(fn(5)).toBe(6);
                });
                it('mockResolvedValue', async () => {
                    const fn = mock();
                    fn.mockResolvedValue('async-val');
                    const result = await fn();
                    expect(result).toBe('async-val');
                });
                it('mockResolvedValueOnce', async () => {
                    const fn = mock();
                    fn.mockResolvedValueOnce('first');
                    fn.mockResolvedValueOnce('second');
                    expect(await fn()).toBe('first');
                    expect(await fn()).toBe('second');
                    expect(fn()).toBeUndefined();
                });
                it('mockReset clears calls and implementation', () => {
                    const fn = mock(() => 1);
                    fn(1);
                    fn.mockReset();
                    expect(fn.mock.calls).toEqual([]);
                    expect(fn()).toBeUndefined();
                });
                it('mockClear clears calls but keeps implementation', () => {
                    const fn = mock(() => 42);
                    fn(1);
                    fn.mockClear();
                    expect(fn.mock.calls).toEqual([]);
                    expect(fn()).toBe(42);
                });
            });
            "#,
        );

        let arr = results.as_array().unwrap();
        assert_eq!(arr.len(), 6);
        for (i, item) in arr.iter().enumerate() {
            assert_eq!(
                item["status"], "pass",
                "mock() chaining test {} ({}) failed: {:?}",
                i, item["name"], item["error"]
            );
        }
    }

    #[test]
    fn test_mock_object_assign_pattern() {
        let mut rt = create_test_runtime();
        let results = run_test_code(
            &mut rt,
            r#"
            describe('Object.assign(mock(), metadata)', () => {
                it('preserves mock tracking after Object.assign', () => {
                    const fn = Object.assign(mock(() => 'val'), { displayName: 'myMock' });
                    fn('arg');
                    expect(fn.displayName).toBe('myMock');
                    expect(fn.mock.calls).toEqual([['arg']]);
                    expect(fn()).toBe('val');
                });
            });
            "#,
        );

        let arr = results.as_array().unwrap();
        assert_eq!(arr.len(), 1);
        assert_eq!(
            arr[0]["status"], "pass",
            "Object.assign test failed: {:?}",
            arr[0]["error"]
        );
    }

    #[test]
    fn test_spy_on() {
        let mut rt = create_test_runtime();
        let results = run_test_code(
            &mut rt,
            r#"
            describe('spyOn()', () => {
                it('tracks calls to existing method', () => {
                    const obj = { greet(name) { return 'hello ' + name; } };
                    const spy = spyOn(obj, 'greet');
                    obj.greet('world');
                    expect(spy.mock.calls).toEqual([['world']]);
                });
                it('delegates to original by default', () => {
                    const obj = { add(a, b) { return a + b; } };
                    spyOn(obj, 'add');
                    expect(obj.add(2, 3)).toBe(5);
                });
                it('mockImplementation overrides behavior', () => {
                    const obj = { get() { return 'original'; } };
                    spyOn(obj, 'get').mockImplementation(() => 'mocked');
                    expect(obj.get()).toBe('mocked');
                });
                it('mockRestore restores original', () => {
                    const obj = { get() { return 'original'; } };
                    const spy = spyOn(obj, 'get').mockImplementation(() => 'mocked');
                    expect(obj.get()).toBe('mocked');
                    spy.mockRestore();
                    expect(obj.get()).toBe('original');
                });
                it('mockReturnValue works on spy', () => {
                    const obj = { get() { return 'original'; } };
                    spyOn(obj, 'get').mockReturnValue('stubbed');
                    expect(obj.get()).toBe('stubbed');
                });
            });
            "#,
        );

        let arr = results.as_array().unwrap();
        assert_eq!(arr.len(), 5);
        for (i, item) in arr.iter().enumerate() {
            assert_eq!(
                item["status"], "pass",
                "spyOn test {} ({}) failed: {:?}",
                i, item["name"], item["error"]
            );
        }
    }

    #[test]
    fn test_mock_matchers() {
        let mut rt = create_test_runtime();
        let results = run_test_code(
            &mut rt,
            r#"
            describe('mock matchers', () => {
                it('toHaveBeenCalled', () => {
                    const fn = mock();
                    fn();
                    expect(fn).toHaveBeenCalled();
                });
                it('toHaveBeenCalled .not', () => {
                    const fn = mock();
                    expect(fn).not.toHaveBeenCalled();
                });
                it('toHaveBeenCalledOnce', () => {
                    const fn = mock();
                    fn();
                    expect(fn).toHaveBeenCalledOnce();
                });
                it('toHaveBeenCalledTimes', () => {
                    const fn = mock();
                    fn(); fn(); fn();
                    expect(fn).toHaveBeenCalledTimes(3);
                });
                it('toHaveBeenCalledWith', () => {
                    const fn = mock();
                    fn(1, 'a');
                    fn(2, 'b');
                    expect(fn).toHaveBeenCalledWith(1, 'a');
                    expect(fn).toHaveBeenCalledWith(2, 'b');
                });
                it('toHaveBeenCalledWith .not', () => {
                    const fn = mock();
                    fn(1);
                    expect(fn).not.toHaveBeenCalledWith(2);
                });
                it('toHaveBeenLastCalledWith', () => {
                    const fn = mock();
                    fn('first');
                    fn('last');
                    expect(fn).toHaveBeenLastCalledWith('last');
                });
                it('toHaveBeenLastCalledWith .not', () => {
                    const fn = mock();
                    fn('first');
                    fn('last');
                    expect(fn).not.toHaveBeenLastCalledWith('first');
                });
            });
            "#,
        );

        let arr = results.as_array().unwrap();
        assert_eq!(arr.len(), 8);
        for (i, item) in arr.iter().enumerate() {
            assert_eq!(
                item["status"], "pass",
                "mock matcher test {} ({}) failed: {:?}",
                i, item["name"], item["error"]
            );
        }
    }

    #[test]
    fn test_async_matchers_resolves() {
        let mut rt = create_test_runtime();
        let results = run_test_code(
            &mut rt,
            r#"
            describe('.resolves', () => {
                it('resolves.toBe', async () => {
                    await expect(Promise.resolve(42)).resolves.toBe(42);
                });
                it('resolves.toEqual', async () => {
                    await expect(Promise.resolve({ a: 1 })).resolves.toEqual({ a: 1 });
                });
                it('resolves.not.toBe', async () => {
                    await expect(Promise.resolve(42)).resolves.not.toBe(99);
                });
            });
            "#,
        );

        let arr = results.as_array().unwrap();
        assert_eq!(arr.len(), 3);
        for (i, item) in arr.iter().enumerate() {
            assert_eq!(
                item["status"], "pass",
                ".resolves test {} ({}) failed: {:?}",
                i, item["name"], item["error"]
            );
        }
    }

    #[test]
    fn test_async_matchers_rejects() {
        let mut rt = create_test_runtime();
        let results = run_test_code(
            &mut rt,
            r#"
            describe('.rejects', () => {
                it('rejects.toThrow', async () => {
                    await expect(Promise.reject(new Error('boom'))).rejects.toThrow('boom');
                });
                it('rejects.toBeInstanceOf', async () => {
                    await expect(Promise.reject(new TypeError('bad'))).rejects.toBeInstanceOf(TypeError);
                });
                it('rejects.not.toThrow with different message', async () => {
                    await expect(Promise.reject(new Error('other'))).rejects.not.toThrow('specific');
                });
            });
            "#,
        );

        let arr = results.as_array().unwrap();
        assert_eq!(arr.len(), 3);
        for (i, item) in arr.iter().enumerate() {
            assert_eq!(
                item["status"], "pass",
                ".rejects test {} ({}) failed: {:?}",
                i, item["name"], item["error"]
            );
        }
    }

    #[test]
    fn test_vi_namespace() {
        let mut rt = create_test_runtime();
        let results = run_test_code(
            &mut rt,
            r#"
            describe('vi namespace', () => {
                it('vi.fn() creates a mock', () => {
                    const fn = vi.fn(() => 99);
                    expect(fn()).toBe(99);
                    expect(fn.mock.calls.length).toBe(1);
                });
                it('vi.fn() without implementation', () => {
                    const fn = vi.fn();
                    expect(fn()).toBeUndefined();
                    expect(fn.mock.calls.length).toBe(1);
                });
                it('vi.spyOn() spies on methods', () => {
                    const obj = { get() { return 'val'; } };
                    const spy = vi.spyOn(obj, 'get');
                    expect(obj.get()).toBe('val');
                    expect(spy.mock.calls.length).toBe(1);
                    spy.mockRestore();
                });
            });
            "#,
        );

        let arr = results.as_array().unwrap();
        assert_eq!(arr.len(), 3);
        for (i, item) in arr.iter().enumerate() {
            assert_eq!(
                item["status"], "pass",
                "vi namespace test {} ({}) failed: {:?}",
                i, item["name"], item["error"]
            );
        }
    }

    #[test]
    fn test_expect_extend() {
        let mut rt = create_test_runtime();
        let results = run_test_code(
            &mut rt,
            r#"
            expect.extend({
                toBeEven(received) {
                    const pass = received % 2 === 0;
                    return {
                        pass,
                        message: () => pass
                            ? 'Expected ' + received + ' not to be even'
                            : 'Expected ' + received + ' to be even',
                    };
                },
                toBeWithinRange(received, floor, ceiling) {
                    const pass = received >= floor && received <= ceiling;
                    return {
                        pass,
                        message: () => pass
                            ? 'Expected ' + received + ' not to be within range ' + floor + ' - ' + ceiling
                            : 'Expected ' + received + ' to be within range ' + floor + ' - ' + ceiling,
                    };
                },
            });

            describe('expect.extend()', () => {
                it('custom matcher passes', () => {
                    expect(4).toBeEven();
                });
                it('custom matcher fails correctly', () => {
                    let caught = false;
                    try { expect(3).toBeEven(); } catch (e) {
                        caught = true;
                        expect(e.message).toContain('to be even');
                    }
                    expect(caught).toBe(true);
                });
                it('.not works with custom matchers', () => {
                    expect(3).not.toBeEven();
                });
                it('custom matcher with extra args', () => {
                    expect(5).toBeWithinRange(1, 10);
                });
                it('.not custom matcher with extra args', () => {
                    expect(50).not.toBeWithinRange(1, 10);
                });
            });
            "#,
        );

        let arr = results.as_array().unwrap();
        assert_eq!(arr.len(), 5);
        for (i, item) in arr.iter().enumerate() {
            assert_eq!(
                item["status"], "pass",
                "expect.extend test {} ({}) failed: {:?}",
                i, item["name"], item["error"]
            );
        }
    }

    #[test]
    fn test_mock_rejected_value() {
        let mut rt = create_test_runtime();
        let results = run_test_code(
            &mut rt,
            r#"
            describe('mockRejectedValue', () => {
                it('mockRejectedValue rejects with value', async () => {
                    const fn = mock();
                    fn.mockRejectedValue(new Error('fail'));
                    let caught = false;
                    try { await fn(); } catch (e) { caught = true; expect(e.message).toBe('fail'); }
                    expect(caught).toBe(true);
                });
                it('mockRejectedValueOnce', async () => {
                    const fn = mock();
                    fn.mockRejectedValueOnce(new Error('once'));
                    let caught = false;
                    try { await fn(); } catch (e) { caught = true; expect(e.message).toBe('once'); }
                    expect(caught).toBe(true);
                    expect(fn()).toBeUndefined();
                });
                it('mockImplementationOnce', () => {
                    const fn = mock(() => 'default');
                    fn.mockImplementationOnce(() => 'once');
                    expect(fn()).toBe('once');
                    expect(fn()).toBe('default');
                });
            });
            "#,
        );

        let arr = results.as_array().unwrap();
        assert_eq!(arr.len(), 3);
        for (i, item) in arr.iter().enumerate() {
            assert_eq!(
                item["status"], "pass",
                "mockRejectedValue test {} ({}) failed: {:?}",
                i, item["name"], item["error"]
            );
        }
    }

    #[test]
    fn test_mock_return_value_once_fallback() {
        let mut rt = create_test_runtime();
        let results = run_test_code(
            &mut rt,
            r#"
            describe('mockReturnValueOnce fallback', () => {
                it('falls back to base impl after once-queue exhausted', () => {
                    const fn = mock(() => 'default');
                    fn.mockReturnValueOnce('first');
                    expect(fn()).toBe('first');
                    expect(fn()).toBe('default');
                });
            });
            "#,
        );

        let arr = results.as_array().unwrap();
        assert_eq!(arr.len(), 1);
        assert_eq!(
            arr[0]["status"], "pass",
            "fallback test failed: {:?}",
            arr[0]["error"]
        );
    }

    #[test]
    fn test_deep_equal_map_set() {
        let mut rt = create_test_runtime();
        let results = run_test_code(
            &mut rt,
            r#"
            describe('deepEqual Map/Set', () => {
                it('Map equality', () => {
                    expect(new Map([['a', 1], ['b', 2]])).toEqual(new Map([['a', 1], ['b', 2]]));
                });
                it('Map inequality', () => {
                    expect(new Map([['a', 1]])).not.toEqual(new Map([['a', 2]]));
                });
                it('Set equality', () => {
                    expect(new Set([1, 2, 3])).toEqual(new Set([1, 2, 3]));
                });
                it('Set inequality', () => {
                    expect(new Set([1, 2])).not.toEqual(new Set([1, 3]));
                });
                it('circular reference does not crash', () => {
                    const obj = { a: 1 };
                    obj.self = obj;
                    expect(obj).not.toEqual({ a: 2 });
                });
            });
            "#,
        );

        let arr = results.as_array().unwrap();
        assert_eq!(arr.len(), 5);
        for (i, item) in arr.iter().enumerate() {
            assert_eq!(
                item["status"], "pass",
                "Map/Set/circular test {} ({}) failed: {:?}",
                i, item["name"], item["error"]
            );
        }
    }

    #[test]
    fn test_to_have_property_nested() {
        let mut rt = create_test_runtime();
        let results = run_test_code(
            &mut rt,
            r#"
            describe('toHaveProperty nested', () => {
                it('dot path', () => {
                    expect({ a: { b: { c: 42 } } }).toHaveProperty('a.b.c', 42);
                });
                it('array path', () => {
                    expect({ a: [{ b: 1 }] }).toHaveProperty(['a', 0, 'b'], 1);
                });
                it('dot path existence', () => {
                    expect({ a: { b: 1 } }).toHaveProperty('a.b');
                });
                it('.not nested', () => {
                    expect({ a: { b: 1 } }).not.toHaveProperty('a.c');
                });
            });
            "#,
        );

        let arr = results.as_array().unwrap();
        assert_eq!(arr.len(), 4);
        for (i, item) in arr.iter().enumerate() {
            assert_eq!(
                item["status"], "pass",
                "nested toHaveProperty test {} ({}) failed: {:?}",
                i, item["name"], item["error"]
            );
        }
    }

    #[test]
    fn test_spy_on_validation() {
        let mut rt = create_test_runtime();
        let results = run_test_code(
            &mut rt,
            r#"
            describe('spyOn validation', () => {
                it('throws when method does not exist', () => {
                    expect(() => spyOn({}, 'nonexistent')).toThrow('not a function');
                });
                it('throws for non-function property', () => {
                    expect(() => spyOn({ x: 42 }, 'x')).toThrow('not a function');
                });
            });
            "#,
        );

        let arr = results.as_array().unwrap();
        assert_eq!(arr.len(), 2);
        for (i, item) in arr.iter().enumerate() {
            assert_eq!(
                item["status"], "pass",
                "spyOn validation test {} ({}) failed: {:?}",
                i, item["name"], item["error"]
            );
        }
    }

    #[test]
    fn test_mock_invalid_impl() {
        let mut rt = create_test_runtime();
        let results = run_test_code(
            &mut rt,
            r#"
            describe('mock() validation', () => {
                it('throws when passed non-function', () => {
                    expect(() => mock(42)).toThrow('must be a function');
                });
            });
            "#,
        );

        let arr = results.as_array().unwrap();
        assert_eq!(arr.len(), 1);
        assert_eq!(
            arr[0]["status"], "pass",
            "mock validation failed: {:?}",
            arr[0]["error"]
        );
    }

    #[test]
    fn test_filter_skips_non_matching() {
        let mut rt = create_test_runtime();
        rt.execute_script_void("[set-filter]", "globalThis.__vertz_test_filter = 'adds'")
            .unwrap();
        let results = run_test_code(
            &mut rt,
            r#"
            const sideEffects = [];
            describe('math', () => {
                it('adds', () => { sideEffects.push('adds'); expect(1 + 1).toBe(2); });
                it('subtracts', () => { sideEffects.push('subtracts'); expect(5 - 3).toBe(2); });
            });
            // Verify only 'adds' ran, not 'subtracts'
            describe('verify', () => {
                it('adds ran', () => {
                    expect(sideEffects).toEqual(['adds']);
                });
            });
            "#,
        );

        let arr = results.as_array().unwrap();
        // 'adds' should pass, 'subtracts' should be skipped,
        // 'adds ran' is outside filter scope so also skipped
        // Actually the filter is "adds" — "math > adds" includes "adds" ✓
        // "math > subtracts" does not include "adds" → skip
        // "verify > adds ran" includes "adds" → runs
        let pass_count = arr.iter().filter(|r| r["status"] == "pass").count();
        let skip_count = arr.iter().filter(|r| r["status"] == "skip").count();
        assert!(pass_count >= 1, "At least 'adds' should pass");
        assert!(skip_count >= 1, "At least 'subtracts' should be skipped");
    }

    #[test]
    fn test_not_to_throw_with_message() {
        let mut rt = create_test_runtime();
        let results = run_test_code(
            &mut rt,
            r#"
            describe('toThrow negation', () => {
                it('not.toThrow passes when no throw', () => {
                    expect(() => {}).not.toThrow();
                });
                it('not.toThrow with message — threw but different message', () => {
                    expect(() => { throw new Error('other'); }).not.toThrow('specific');
                });
                it('not.toThrow with message — fails when message matches', () => {
                    let caught = false;
                    try {
                        expect(() => { throw new Error('specific error'); }).not.toThrow('specific');
                    } catch (e) {
                        caught = true;
                        expect(e.message).toContain('not to throw');
                    }
                    expect(caught).toBe(true);
                });
            });
            "#,
        );

        let arr = results.as_array().unwrap();
        assert_eq!(arr.len(), 3);
        for (i, item) in arr.iter().enumerate() {
            assert_eq!(
                item["status"], "pass",
                "toThrow negation test {} failed: {:?}",
                i, item["error"]
            );
        }
    }

    #[test]
    fn test_to_match_object() {
        let mut rt = create_test_runtime();
        let results = run_test_code(
            &mut rt,
            r#"
            describe('toMatchObject', () => {
                it('matches subset of properties', () => {
                    expect({ a: 1, b: 2, c: 3 }).toMatchObject({ a: 1, b: 2 });
                });
                it('matches nested objects', () => {
                    expect({ a: { b: 1, c: 2 }, d: 3 }).toMatchObject({ a: { b: 1 } });
                });
                it('matches arrays by position', () => {
                    expect([{ a: 1, b: 2 }, { c: 3 }]).toMatchObject([{ a: 1 }, { c: 3 }]);
                });
                it('fails when property missing', () => {
                    let caught = false;
                    try { expect({ a: 1 }).toMatchObject({ b: 2 }); }
                    catch(e) { caught = true; }
                    expect(caught).toBe(true);
                });
                it('not.toMatchObject works', () => {
                    expect({ a: 1 }).not.toMatchObject({ b: 2 });
                });
            });
            "#,
        );

        let arr = results.as_array().unwrap();
        assert_eq!(arr.len(), 5);
        for (i, item) in arr.iter().enumerate() {
            assert_eq!(
                item["status"], "pass",
                "toMatchObject test {} failed: {:?}",
                i, item["error"]
            );
        }
    }

    #[test]
    fn test_asymmetric_matchers() {
        let mut rt = create_test_runtime();
        let results = run_test_code(
            &mut rt,
            r#"
            describe('asymmetric matchers', () => {
                it('expect.any(String)', () => {
                    expect('hello').toEqual(expect.any(String));
                });
                it('expect.any(Number)', () => {
                    expect(42).toEqual(expect.any(Number));
                });
                it('expect.anything()', () => {
                    expect('anything').toEqual(expect.anything());
                    expect(0).toEqual(expect.anything());
                });
                it('expect.anything rejects null/undefined', () => {
                    let caught = false;
                    try { expect(null).toEqual(expect.anything()); }
                    catch(e) { caught = true; }
                    expect(caught).toBe(true);
                });
                it('expect.objectContaining()', () => {
                    expect({ a: 1, b: 2, c: 3 }).toEqual(expect.objectContaining({ a: 1, c: 3 }));
                });
                it('expect.arrayContaining()', () => {
                    expect([1, 2, 3, 4]).toEqual(expect.arrayContaining([2, 4]));
                });
                it('expect.stringContaining()', () => {
                    expect('hello world').toEqual(expect.stringContaining('world'));
                });
                it('expect.stringMatching()', () => {
                    expect('hello world').toEqual(expect.stringMatching(/^hello/));
                });
                it('nested asymmetric matchers', () => {
                    expect({ name: 'John', age: 30, id: 'abc' }).toEqual({
                        name: expect.any(String),
                        age: expect.any(Number),
                        id: expect.stringMatching(/^[a-z]+$/),
                    });
                });
                it('asymmetric in toHaveBeenCalledWith', () => {
                    const fn = mock();
                    fn('hello', 42);
                    expect(fn).toHaveBeenCalledWith(expect.any(String), expect.any(Number));
                });
                it('expect.stringMatching with string pattern', () => {
                    expect('hello world').toEqual(expect.stringMatching('world'));
                });
                it('expect.any(Array)', () => {
                    expect([1, 2, 3]).toEqual(expect.any(Array));
                });
            });
            "#,
        );

        let arr = results.as_array().unwrap();
        assert_eq!(arr.len(), 12);
        for (i, item) in arr.iter().enumerate() {
            assert_eq!(
                item["status"], "pass",
                "asymmetric matcher test {} failed: {:?}",
                i, item["error"]
            );
        }
    }

    #[test]
    fn test_timer_mocking() {
        let mut rt = create_test_runtime();
        let results = run_test_code(
            &mut rt,
            r#"
            describe('timer mocking', () => {
                it('useFakeTimers intercepts setTimeout', () => {
                    vi.useFakeTimers();
                    let called = false;
                    setTimeout(() => { called = true; }, 1000);
                    expect(called).toBe(false);
                    vi.advanceTimersByTime(1000);
                    expect(called).toBe(true);
                    vi.useRealTimers();
                });
                it('advanceTimersByTime processes in order', () => {
                    vi.useFakeTimers();
                    const log = [];
                    setTimeout(() => log.push('a'), 100);
                    setTimeout(() => log.push('b'), 200);
                    setTimeout(() => log.push('c'), 50);
                    vi.advanceTimersByTime(200);
                    expect(log).toEqual(['c', 'a', 'b']);
                    vi.useRealTimers();
                });
                it('setInterval repeats', () => {
                    vi.useFakeTimers();
                    let count = 0;
                    setInterval(() => { count++; }, 100);
                    vi.advanceTimersByTime(350);
                    expect(count).toBe(3);
                    vi.useRealTimers();
                });
                it('clearTimeout cancels', () => {
                    vi.useFakeTimers();
                    let called = false;
                    const id = setTimeout(() => { called = true; }, 100);
                    clearTimeout(id);
                    vi.advanceTimersByTime(200);
                    expect(called).toBe(false);
                    vi.useRealTimers();
                });
                it('runAllTimers flushes all pending', () => {
                    vi.useFakeTimers();
                    const log = [];
                    setTimeout(() => log.push('a'), 500);
                    setTimeout(() => log.push('b'), 1000);
                    vi.runAllTimers();
                    expect(log).toEqual(['a', 'b']);
                    vi.useRealTimers();
                });
                it('advanceTimersByTime(0) fires 0-delay timers', () => {
                    vi.useFakeTimers();
                    let called = false;
                    setTimeout(() => { called = true; }, 0);
                    vi.advanceTimersByTime(0);
                    expect(called).toBe(true);
                    vi.useRealTimers();
                });
                it('Date.now() returns fake time', () => {
                    vi.useFakeTimers();
                    const start = Date.now();
                    vi.advanceTimersByTime(5000);
                    expect(Date.now()).toBe(start + 5000);
                    vi.useRealTimers();
                });
                it('runAllTimers does not loop with setInterval', () => {
                    vi.useFakeTimers();
                    let count = 0;
                    setInterval(() => { count++; }, 100);
                    vi.runAllTimers();
                    // Should fire once (the pending interval tick) and NOT loop forever
                    expect(count).toBe(1);
                    vi.useRealTimers();
                });
            });
            "#,
        );

        let arr = results.as_array().unwrap();
        assert_eq!(arr.len(), 8);
        for (i, item) in arr.iter().enumerate() {
            assert_eq!(
                item["status"], "pass",
                "timer mocking test {} failed: {:?}",
                i, item["error"]
            );
        }
    }

    #[test]
    fn test_skip_if() {
        let mut rt = create_test_runtime();
        let results = run_test_code(
            &mut rt,
            r#"
            describe('skipIf', () => {
                it.skipIf(true)('should be skipped', () => { throw new Error('should not run'); });
                it.skipIf(false)('should run', () => { expect(1).toBe(1); });
            });
            describe.skipIf(true)('skipped suite', () => {
                it('should not run', () => { throw new Error('should not run'); });
            });
            describe.skipIf(false)('active suite', () => {
                it('should run', () => { expect(2).toBe(2); });
            });
            "#,
        );

        let arr = results.as_array().unwrap();
        assert_eq!(arr.len(), 4);
        assert_eq!(arr[0]["status"], "skip");
        assert_eq!(arr[1]["status"], "pass");
        assert_eq!(arr[2]["status"], "skip");
        assert_eq!(arr[3]["status"], "pass");
    }

    #[test]
    fn test_each() {
        let mut rt = create_test_runtime();
        let results = run_test_code(
            &mut rt,
            r#"
            describe('each', () => {
                it.each([1, 2, 3])('value %s', (val) => {
                    expect(val).toBeGreaterThan(0);
                });
            });
            "#,
        );

        let arr = results.as_array().unwrap();
        assert_eq!(arr.len(), 3);
        for item in arr.iter() {
            assert_eq!(item["status"], "pass");
        }
    }

    #[test]
    fn test_vi_bulk_mock_operations() {
        let mut rt = create_test_runtime();
        let results = run_test_code(
            &mut rt,
            r#"
            describe('vi bulk mock operations', () => {
                it('vi.clearAllMocks clears call state', () => {
                    const fn1 = vi.fn();
                    const fn2 = vi.fn();
                    fn1('a');
                    fn2('b');
                    expect(fn1).toHaveBeenCalled();
                    expect(fn2).toHaveBeenCalled();
                    vi.clearAllMocks();
                    expect(fn1).not.toHaveBeenCalled();
                    expect(fn2).not.toHaveBeenCalled();
                });
                it('vi.restoreAllMocks resets implementation', () => {
                    const obj = { greet: () => 'original' };
                    vi.spyOn(obj, 'greet').mockReturnValue('mocked');
                    expect(obj.greet()).toBe('mocked');
                    vi.restoreAllMocks();
                    expect(obj.greet()).toBe('original');
                });
                it('vi.resetAllMocks clears state and impl', () => {
                    const fn1 = vi.fn(() => 42);
                    fn1();
                    expect(fn1).toHaveBeenCalled();
                    vi.resetAllMocks();
                    expect(fn1).not.toHaveBeenCalled();
                    expect(fn1()).toBeUndefined(); // impl cleared
                });
            });
            "#,
        );

        let arr = results.as_array().unwrap();
        assert_eq!(arr.len(), 3);
        for (i, item) in arr.iter().enumerate() {
            assert_eq!(
                item["status"], "pass",
                "vi bulk mock test {} failed: {:?}",
                i, item["error"]
            );
        }
    }

    // --- DOM class stubs (#2071) ---

    #[test]
    fn test_dom_stubs_exist_on_globalthis() {
        let mut rt = create_test_runtime();
        let results = run_test_code(
            &mut rt,
            r#"
            describe('DOM class stubs', () => {
                it('HTMLElement exists on globalThis', () => {
                    expect(typeof globalThis.HTMLElement).toBe('function');
                });
                it('Node exists on globalThis', () => {
                    expect(typeof globalThis.Node).toBe('function');
                });
                it('Element exists on globalThis', () => {
                    expect(typeof globalThis.Element).toBe('function');
                });
                it('Text exists on globalThis', () => {
                    expect(typeof globalThis.Text).toBe('function');
                });
                it('Event exists on globalThis', () => {
                    expect(typeof globalThis.Event).toBe('function');
                });
            });
            "#,
        );

        let arr = results.as_array().unwrap();
        assert_eq!(arr.len(), 5);
        for (i, item) in arr.iter().enumerate() {
            assert_eq!(
                item["status"], "pass",
                "DOM stub test {} failed: {:?}",
                i, item["error"]
            );
        }
    }

    #[test]
    fn test_dom_stubs_prototype_chain() {
        let mut rt = create_test_runtime();
        let results = run_test_code(
            &mut rt,
            r#"
            describe('DOM stubs prototype chain', () => {
                it('HTMLElement extends Element extends Node', () => {
                    const el = new HTMLElement();
                    expect(el instanceof Element).toBe(true);
                    expect(el instanceof Node).toBe(true);
                });
                it('HTMLDivElement extends HTMLElement', () => {
                    const div = new HTMLDivElement();
                    expect(div instanceof HTMLElement).toBe(true);
                    expect(div instanceof Element).toBe(true);
                    expect(div instanceof Node).toBe(true);
                });
                it('Text extends Node', () => {
                    const text = new Text();
                    expect(text instanceof Node).toBe(true);
                });
                it('Comment extends Node', () => {
                    const comment = new Comment();
                    expect(comment instanceof Node).toBe(true);
                });
                it('CustomEvent extends Event', () => {
                    const evt = new CustomEvent();
                    expect(evt instanceof Event).toBe(true);
                });
            });
            "#,
        );

        let arr = results.as_array().unwrap();
        assert_eq!(arr.len(), 5);
        for (i, item) in arr.iter().enumerate() {
            assert_eq!(
                item["status"], "pass",
                "DOM prototype chain test {} failed: {:?}",
                i, item["error"]
            );
        }
    }
}
