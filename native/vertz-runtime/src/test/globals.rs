/// JavaScript test harness that runs inside V8.
///
/// This module provides the `describe`, `it`, `expect`, `beforeEach`, `afterEach`
/// globals that test files import from `@vertz/test`. The harness collects test
/// registrations during module evaluation, then executes them when `__vertz_run_tests()`
/// is called.
///
/// Results are returned as JSON for the Rust side to parse.

/// The bootstrap JS that defines the test framework globals on `globalThis`.
/// This is injected before any test file is loaded.
pub const TEST_HARNESS_JS: &str = r#"
(() => {
  'use strict';

  // --- Internal state ---
  const suites = [];        // Top-level describe blocks
  const suiteStack = [];    // Current nesting stack
  let hasOnly = false;      // Whether any .only modifier was used

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
  }
  function afterEach(fn) {
    const parent = currentSuite();
    if (parent) parent.afterEach.push(fn);
  }
  function beforeAll(fn) {
    const parent = currentSuite();
    if (parent) parent.beforeAll.push(fn);
  }
  function afterAll(fn) {
    const parent = currentSuite();
    if (parent) parent.afterAll.push(fn);
  }

  // --- Expect ---
  function deepEqual(a, b) {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (typeof a !== typeof b) return false;
    if (typeof a !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;

    if (Array.isArray(a)) {
      if (a.length !== b.length) return false;
      return a.every((v, i) => deepEqual(v, b[i]));
    }

    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every(k => deepEqual(a[k], b[k]));
  }

  function formatValue(v) {
    if (v === undefined) return 'undefined';
    if (v === null) return 'null';
    if (typeof v === 'string') return JSON.stringify(v);
    if (typeof v === 'function') return '[Function]';
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

    // Objects
    matchers.toHaveProperty = function(key, value) {
      const has = actual != null && key in Object(actual);
      if (arguments.length > 1) {
        assert(has && deepEqual(actual[key], value), () =>
          `Expected property "${key}" ${negated ? 'not ' : ''}to be ${formatValue(value)}, got ${formatValue(actual?.[key])}`
        );
      } else {
        assert(has, () =>
          `Expected object ${negated ? 'not ' : ''}to have property "${key}"`
        );
      }
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
        // not.toThrow(): should NOT throw
        if (threw) {
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

    return matchers;
  }

  function expect(actual) {
    const matchers = createMatchers(actual, false);
    matchers.not = createMatchers(actual, true);
    return matchers;
  }

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

  async function runSuite(suite, parentPath, parentOnly) {
    const results = [];
    const suitePath = suite.name ? (parentPath ? `${parentPath} > ${suite.name}` : suite.name) : parentPath;
    const suiteRunnable = shouldRun(suite, parentOnly);
    const suiteHasOnly = containsOnly(suite);

    if (suiteRunnable) {
      await runHooks(suite.beforeAll);
    }

    for (const test of suite.tests) {
      if (test.todo) {
        results.push({ name: test.name, path: suitePath, status: 'todo', duration: 0 });
        continue;
      }
      const testRunnable = !test.skip && suiteRunnable && (!hasOnly || test.only || parentOnly || suite.only);
      if (!testRunnable) {
        results.push({ name: test.name, path: suitePath, status: 'skip', duration: 0 });
        continue;
      }

      const start = performance.now();
      let error = null;

      // Run all beforeEach hooks (including parent suite hooks via inheritance)
      try {
        await runHooks(suite.beforeEach);
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

      // Run afterEach hooks even if test threw
      try {
        await runHooks(suite.afterEach);
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

    // Recurse into nested suites
    for (const child of suite.suites) {
      const childResults = await runSuite(child, suitePath, suiteRunnable && (parentOnly || suite.only));
      results.push(...childResults);
    }

    if (suiteRunnable) {
      await runHooks(suite.afterAll);
    }

    return results;
  }

  // This function is called by the Rust executor after the test file is loaded.
  globalThis.__vertz_run_tests = async function() {
    const allResults = [];
    for (const suite of suites) {
      const results = await runSuite(suite, '', false);
      allResults.push(...results);
    }
    return allResults;
  };

  // Export to globalThis for test files
  globalThis.describe = describe;
  globalThis.it = it;
  globalThis.test = test;
  globalThis.expect = expect;
  globalThis.beforeEach = beforeEach;
  globalThis.afterEach = afterEach;
  globalThis.beforeAll = beforeAll;
  globalThis.afterAll = afterAll;

  // Also register as a virtual module that the module loader intercepts
  // for `import { describe, it, expect } from '@vertz/test'`
  globalThis.__vertz_test_exports = {
    describe, it, test, expect,
    beforeEach, afterEach, beforeAll, afterAll,
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
                i,
                item["name"],
                item["error"]
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
}
