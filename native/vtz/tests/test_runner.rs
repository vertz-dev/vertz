//! End-to-end integration tests for the built-in test runner.
//!
//! These tests exercise the full pipeline: discovery → execution → reporting,
//! using real TypeScript test files compiled by the Vertz compiler.

use std::fs;
use std::path::{Path, PathBuf};
use vertz_runtime::test::runner::{run_tests, ReporterFormat, TestRunConfig};

fn setup_project(dir: &Path) {
    fs::create_dir_all(dir.join("src/__tests__")).unwrap();
    fs::create_dir_all(dir.join("src/utils")).unwrap();
}

fn write_file(dir: &Path, name: &str, content: &str) {
    let path = dir.join(name);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).unwrap();
    }
    fs::write(path, content).unwrap();
}

fn make_config(root: &Path) -> TestRunConfig {
    TestRunConfig {
        root_dir: root.to_path_buf(),
        paths: vec![],
        include: vec![],
        exclude: vec![],
        concurrency: Some(2),
        filter: None,
        bail: false,
        timeout_ms: 5000,
        reporter: ReporterFormat::Terminal,
        coverage: false,
        coverage_threshold: 95.0,
        preload: vec![],
        no_cache: false,
    }
}

// --- E2E: Full project test run ---

#[test]
fn e2e_full_project_test_run() {
    let tmp = tempfile::tempdir().unwrap();
    setup_project(tmp.path());

    // A passing test file
    write_file(
        tmp.path(),
        "src/__tests__/math.test.ts",
        r#"
        describe('math utilities', () => {
            it('adds two numbers correctly', () => {
                const add = (a: number, b: number): number => a + b;
                expect(add(2, 3)).toBe(5);
                expect(add(-1, 1)).toBe(0);
                expect(add(0, 0)).toBe(0);
            });

            it('multiplies two numbers correctly', () => {
                const multiply = (a: number, b: number): number => a * b;
                expect(multiply(3, 4)).toBe(12);
                expect(multiply(-2, 5)).toBe(-10);
            });

            describe('edge cases', () => {
                it('handles large numbers', () => {
                    expect(Number.MAX_SAFE_INTEGER + 1).toBeGreaterThan(0);
                });
            });
        });
        "#,
    );

    // A file with mixed statuses
    write_file(
        tmp.path(),
        "src/__tests__/string.test.ts",
        r#"
        describe('string utilities', () => {
            it('trims whitespace', () => {
                expect('  hello  '.trim()).toBe('hello');
            });

            it.skip('needs implementation', () => {
                throw new Error('not yet');
            });

            it.todo('should handle unicode');
        });
        "#,
    );

    // A file with a failure
    write_file(
        tmp.path(),
        "src/utils/validate.test.ts",
        r#"
        describe('validation', () => {
            it('validates email format', () => {
                const isEmail = (s: string): boolean => s.includes('@');
                expect(isEmail('user@example.com')).toBeTruthy();
                expect(isEmail('invalid')).toBeFalsy();
            });

            it('rejects empty strings', () => {
                // This test intentionally fails
                expect('').toBeTruthy();
            });
        });
        "#,
    );

    let (result, output) = run_tests(make_config(tmp.path()));

    // Verify counts
    assert_eq!(result.total_files, 3, "Should discover 3 test files");
    assert_eq!(result.total_passed, 5, "5 tests should pass");
    assert_eq!(result.total_failed, 1, "1 test should fail");
    assert_eq!(result.total_skipped, 1, "1 test should be skipped");
    assert_eq!(result.total_todo, 1, "1 test should be todo");
    assert_eq!(result.file_errors, 0, "No file errors");
    assert!(!result.success(), "Overall should be failure");

    // Verify terminal output contains expected markers
    assert!(output.contains("PASS"), "Output should show PASS files");
    assert!(output.contains("FAIL"), "Output should show FAIL files");
    assert!(output.contains("5 passed"), "Output should show pass count");
    assert!(output.contains("1 failed"), "Output should show fail count");
    assert!(
        output.contains("1 skipped"),
        "Output should show skip count"
    );
    assert!(output.contains("1 todo"), "Output should show todo count");
    assert!(
        output.contains("Files:  3"),
        "Output should show file count"
    );
}

// --- E2E: All tests pass → exit code 0 ---

#[test]
fn e2e_all_passing_is_success() {
    let tmp = tempfile::tempdir().unwrap();
    setup_project(tmp.path());

    write_file(
        tmp.path(),
        "src/__tests__/pass.test.ts",
        r#"
        describe('passing suite', () => {
            it('assertion works', () => {
                expect(42).toBe(42);
            });
        });
        "#,
    );

    let (result, _output) = run_tests(make_config(tmp.path()));

    assert!(result.success());
    assert_eq!(result.total_passed, 1);
    assert_eq!(result.total_failed, 0);
}

// --- E2E: Hooks execute in order ---

#[test]
fn e2e_hooks_lifecycle() {
    let tmp = tempfile::tempdir().unwrap();
    setup_project(tmp.path());

    write_file(
        tmp.path(),
        "src/__tests__/hooks.test.ts",
        r#"
        const log: string[] = [];

        describe('lifecycle', () => {
            beforeAll(() => { log.push('beforeAll'); });
            afterAll(() => { log.push('afterAll'); });
            beforeEach(() => { log.push('beforeEach'); });
            afterEach(() => { log.push('afterEach'); });

            it('test 1', () => {
                log.push('test1');
                expect(log).toEqual(['beforeAll', 'beforeEach', 'test1']);
            });

            it('test 2', () => {
                log.push('test2');
                expect(log).toEqual([
                    'beforeAll',
                    'beforeEach', 'test1', 'afterEach',
                    'beforeEach', 'test2',
                ]);
            });
        });
        "#,
    );

    let (result, _output) = run_tests(make_config(tmp.path()));

    assert!(
        result.success(),
        "Hooks should run in correct order: {:?}",
        result.results
    );
    assert_eq!(result.total_passed, 2);
}

// --- E2E: .only filters to specific tests ---

#[test]
fn e2e_only_modifier_filters() {
    let tmp = tempfile::tempdir().unwrap();
    setup_project(tmp.path());

    write_file(
        tmp.path(),
        "src/__tests__/only.test.ts",
        r#"
        describe('mixed', () => {
            it('should not run', () => {
                throw new Error('should be skipped by .only');
            });

            it.only('only this runs', () => {
                expect(1).toBe(1);
            });

            it('also should not run', () => {
                throw new Error('should be skipped by .only');
            });
        });
        "#,
    );

    let (result, _output) = run_tests(make_config(tmp.path()));

    assert!(result.success(), "Only the .only test should run");
    assert_eq!(result.total_passed, 1);
    // The other tests should be skipped (not run at all when .only is present)
    assert_eq!(result.total_failed, 0);
}

// --- E2E: Nested describe scoping ---

#[test]
fn e2e_nested_describe_scoping() {
    let tmp = tempfile::tempdir().unwrap();
    setup_project(tmp.path());

    write_file(
        tmp.path(),
        "src/__tests__/nested.test.ts",
        r#"
        describe('outer', () => {
            let value = 0;

            beforeEach(() => { value = 10; });

            it('has initial value', () => {
                expect(value).toBe(10);
            });

            describe('inner', () => {
                beforeEach(() => { value += 5; });

                it('has outer + inner setup', () => {
                    expect(value).toBe(15);
                });

                describe('deeply nested', () => {
                    beforeEach(() => { value *= 2; });

                    it('has all setups applied', () => {
                        expect(value).toBe(30);
                    });
                });
            });
        });
        "#,
    );

    let (result, _output) = run_tests(make_config(tmp.path()));

    assert!(
        result.success(),
        "Nested hooks should compose: {:?}",
        result.results
    );
    assert_eq!(result.total_passed, 3);
}

// --- E2E: Parallel execution with isolation ---

#[test]
fn e2e_parallel_execution_isolation() {
    let tmp = tempfile::tempdir().unwrap();
    setup_project(tmp.path());

    // Create 5 files that each set a global — they must not interfere
    for i in 0..5 {
        write_file(
            tmp.path(),
            &format!("src/__tests__/file{}.test.ts", i),
            &format!(
                r#"
                globalThis.testId = {};
                describe('file {}', () => {{
                    it('owns its global', () => {{
                        expect(globalThis.testId).toBe({});
                    }});
                }});
                "#,
                i, i, i
            ),
        );
    }

    let config = TestRunConfig {
        concurrency: Some(4),
        ..make_config(tmp.path())
    };

    let (result, _output) = run_tests(config);

    assert!(result.success(), "All files should be isolated");
    assert_eq!(result.total_files, 5);
    assert_eq!(result.total_passed, 5);
}

// --- E2E: Expect matchers comprehensive ---

#[test]
fn e2e_expect_matchers_comprehensive() {
    let tmp = tempfile::tempdir().unwrap();
    setup_project(tmp.path());

    write_file(
        tmp.path(),
        "src/__tests__/matchers.test.ts",
        r#"
        describe('expect matchers', () => {
            it('toBe', () => {
                expect(1).toBe(1);
                expect('hello').toBe('hello');
                expect(null).toBe(null);
            });

            it('toEqual (deep)', () => {
                expect({ a: 1, b: [2, 3] }).toEqual({ a: 1, b: [2, 3] });
                expect([1, [2, 3]]).toEqual([1, [2, 3]]);
            });

            it('truthiness', () => {
                expect(true).toBeTruthy();
                expect(1).toBeTruthy();
                expect('x').toBeTruthy();
                expect(false).toBeFalsy();
                expect(0).toBeFalsy();
                expect('').toBeFalsy();
                expect(null).toBeNull();
                expect(undefined).toBeUndefined();
                expect(42).toBeDefined();
            });

            it('comparison', () => {
                expect(5).toBeGreaterThan(3);
                expect(5).toBeGreaterThanOrEqual(5);
                expect(3).toBeLessThan(5);
                expect(3).toBeLessThanOrEqual(3);
            });

            it('strings and arrays', () => {
                expect('hello world').toContain('world');
                expect([1, 2, 3]).toContain(2);
                expect([1, 2, 3]).toHaveLength(3);
                expect('abc').toHaveLength(3);
            });

            it('toMatch', () => {
                expect('hello world').toMatch(/world/);
                expect('test123').toMatch(/\d+/);
            });

            it('toHaveProperty', () => {
                expect({ a: 1, b: { c: 2 } }).toHaveProperty('a');
                expect({ a: 1, b: { c: 2 } }).toHaveProperty('a', 1);
            });

            it('toThrow', () => {
                expect(() => { throw new Error('boom'); }).toThrow();
                expect(() => { throw new Error('boom'); }).toThrow('boom');
                expect(() => {}).not.toThrow();
            });

            it('toBeInstanceOf', () => {
                expect(new Error('x')).toBeInstanceOf(Error);
                expect([]).toBeInstanceOf(Array);
            });

            it('.not negation', () => {
                expect(1).not.toBe(2);
                expect({ a: 1 }).not.toEqual({ a: 2 });
                expect(false).not.toBeTruthy();
                expect(true).not.toBeFalsy();
                expect(1).not.toBeNull();
                expect(undefined).not.toBeDefined();
                expect(3).not.toBeGreaterThan(5);
                expect('hello').not.toContain('xyz');
            });
        });
        "#,
    );

    let (result, _output) = run_tests(make_config(tmp.path()));

    assert!(
        result.success(),
        "All matchers should work: {:?}",
        result
            .results
            .iter()
            .flat_map(|r| &r.tests)
            .filter(|t| t.status == vertz_runtime::test::executor::TestStatus::Fail)
            .collect::<Vec<_>>()
    );
    assert_eq!(result.total_passed, 10);
}

// --- E2E: Bail mode stops after first failure ---

#[test]
fn e2e_bail_stops_early() {
    let tmp = tempfile::tempdir().unwrap();
    setup_project(tmp.path());

    // a.test.ts fails
    write_file(
        tmp.path(),
        "src/__tests__/a.test.ts",
        r#"
        describe('a', () => {
            it('fails', () => { expect(1).toBe(2); });
        });
        "#,
    );

    // b.test.ts would pass if it ran
    write_file(
        tmp.path(),
        "src/__tests__/b.test.ts",
        r#"
        describe('b', () => {
            it('passes', () => { expect(1).toBe(1); });
        });
        "#,
    );

    let config = TestRunConfig {
        bail: true,
        concurrency: Some(1), // Sequential for deterministic order
        ..make_config(tmp.path())
    };

    let (result, _output) = run_tests(config);

    assert_eq!(
        result.total_files, 1,
        "Bail should stop after first file failure"
    );
    assert_eq!(result.total_failed, 1);
}

// --- E2E: File with compile error ---

#[test]
fn e2e_compile_error_reported() {
    let tmp = tempfile::tempdir().unwrap();
    setup_project(tmp.path());

    write_file(
        tmp.path(),
        "src/__tests__/broken.test.ts",
        r#"
        import { nonexistent } from './does-not-exist';
        describe('broken', () => {
            it('never runs', () => {});
        });
        "#,
    );

    // Also a passing file
    write_file(
        tmp.path(),
        "src/__tests__/ok.test.ts",
        r#"
        describe('ok', () => {
            it('passes', () => { expect(1).toBe(1); });
        });
        "#,
    );

    let (result, output) = run_tests(make_config(tmp.path()));

    assert!(!result.success(), "Should fail due to load error");
    assert_eq!(result.file_errors, 1);
    assert_eq!(result.total_passed, 1, "ok.test.ts should still pass");
    assert!(output.contains("FAIL (load error)"));
    assert!(output.contains("1 failed to load"));
}

// --- E2E: Specific file paths ---

#[test]
fn e2e_specific_file_paths() {
    let tmp = tempfile::tempdir().unwrap();
    setup_project(tmp.path());

    write_file(
        tmp.path(),
        "src/__tests__/target.test.ts",
        r#"
        describe('target', () => {
            it('runs', () => { expect(1).toBe(1); });
        });
        "#,
    );

    write_file(
        tmp.path(),
        "src/__tests__/other.test.ts",
        r#"
        describe('other', () => {
            it('should not run', () => { throw new Error('should not be discovered'); });
        });
        "#,
    );

    let config = TestRunConfig {
        paths: vec![PathBuf::from("src/__tests__/target.test.ts")],
        ..make_config(tmp.path())
    };

    let (result, _output) = run_tests(config);

    assert!(result.success());
    assert_eq!(result.total_files, 1);
    assert_eq!(result.total_passed, 1);
}

// --- E2E: Codemod migration and test execution ---

#[test]
fn e2e_codemod_migrates_and_tests_pass() {
    use vertz_runtime::test::codemod;

    let tmp = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(tmp.path().join("src")).unwrap();

    // Write test files that use bun:test imports (real-world pattern)
    write_file(
        tmp.path(),
        "src/errors.test.ts",
        r#"
import { describe, expect, it } from 'bun:test';

class FetchError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'FetchError';
  }
}

describe('FetchError', () => {
  it('stores status and message', () => {
    const error = new FetchError('Something went wrong', 500);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Something went wrong');
    expect(error.status).toBe(500);
    expect(error.name).toBe('FetchError');
  });
});
"#,
    );

    write_file(
        tmp.path(),
        "src/math.test.ts",
        r#"
import { describe, it, expect } from 'bun:test';

describe('math utils', () => {
  it('adds numbers', () => {
    expect(1 + 2).toBe(3);
  });
  it('multiplies numbers', () => {
    expect(3 * 4).toBe(12);
  });
});
"#,
    );

    // Step 1: Run codemod (not dry-run)
    let migrate_result = codemod::migrate_tests(tmp.path(), false).unwrap();
    assert_eq!(
        migrate_result.files_changed, 2,
        "Both files should be migrated"
    );

    // Step 2: Verify the files were rewritten
    let errors_content = std::fs::read_to_string(tmp.path().join("src/errors.test.ts")).unwrap();
    assert!(
        errors_content.contains("'@vertz/test'"),
        "Should have @vertz/test import"
    );
    assert!(
        !errors_content.contains("'bun:test'"),
        "Should not have bun:test import"
    );

    let math_content = std::fs::read_to_string(tmp.path().join("src/math.test.ts")).unwrap();
    assert!(math_content.contains("'@vertz/test'"));

    // Step 3: Run the migrated tests through vertz test runner
    let config = TestRunConfig {
        ..make_config(tmp.path())
    };
    let (result, _output) = run_tests(config);

    assert!(result.success(), "Migrated tests should all pass");
    assert_eq!(result.total_files, 2);
    assert_eq!(result.total_passed, 3, "3 tests total across 2 files");
}

#[test]
fn e2e_vertz_test_import_works_in_runner() {
    let tmp = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(tmp.path().join("src")).unwrap();

    // Test file that already uses @vertz/test imports
    write_file(
        tmp.path(),
        "src/native.test.ts",
        r#"
import { describe, it, expect, mock } from '@vertz/test';

describe('native vertz test', () => {
  it('uses @vertz/test imports', () => {
    expect(true).toBe(true);
  });

  it('mock function works via import', () => {
    const fn = mock(() => 42);
    expect(fn()).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
"#,
    );

    let config = TestRunConfig {
        ..make_config(tmp.path())
    };
    let (result, _output) = run_tests(config);

    assert!(
        result.success(),
        "Tests using @vertz/test imports should pass"
    );
    assert_eq!(result.total_passed, 2);
}

// --- E2E: TypeScript features work ---

#[test]
fn e2e_typescript_features() {
    let tmp = tempfile::tempdir().unwrap();
    setup_project(tmp.path());

    write_file(
        tmp.path(),
        "src/__tests__/typescript.test.ts",
        r#"
        interface Task {
            id: number;
            title: string;
            done: boolean;
        }

        function createTask(title: string): Task {
            return { id: 1, title, done: false };
        }

        describe('TypeScript features', () => {
            it('interfaces and typed functions', () => {
                const task: Task = createTask('Test');
                expect(task.title).toBe('Test');
                expect(task.done).toBeFalsy();
            });

            it('generics', () => {
                function identity<T>(x: T): T { return x; }
                expect(identity(42)).toBe(42);
                expect(identity('hello')).toBe('hello');
            });

            it('type assertions and as const', () => {
                const arr = [1, 2, 3] as const;
                expect(arr.length).toBe(3);
                const val = 'hello' as string;
                expect(val).toBe('hello');
            });

            it('optional chaining', () => {
                const obj: { a?: { b?: number } } = { a: { b: 42 } };
                expect(obj?.a?.b).toBe(42);
                expect(obj?.a?.b?.toString()).toBe('42');
            });

            it('destructuring with types', () => {
                const { x, y }: { x: number; y: string } = { x: 1, y: 'two' };
                expect(x).toBe(1);
                expect(y).toBe('two');
            });
        });
        "#,
    );

    let (result, _output) = run_tests(make_config(tmp.path()));

    assert!(
        result.success(),
        "TypeScript features should compile and work: {:?}",
        result.results
    );
    assert_eq!(result.total_passed, 5);
}

// --- E2E: Phase 4b features (asymmetric matchers, timer mocking, toMatchObject) ---

#[test]
fn e2e_phase4b_features() {
    let tmp = tempfile::tempdir().unwrap();
    setup_project(tmp.path());

    write_file(
        tmp.path(),
        "src/__tests__/phase4b.test.ts",
        r#"
        import { describe, it, expect, mock, vi } from '@vertz/test';

        describe('toMatchObject', () => {
            it('matches subset', () => {
                expect({ a: 1, b: 2, c: 3 }).toMatchObject({ a: 1, c: 3 });
            });
        });

        describe('asymmetric matchers', () => {
            it('expect.any in toEqual', () => {
                expect({ id: 123, name: 'test' }).toEqual({
                    id: expect.any(Number),
                    name: expect.any(String),
                });
            });
            it('expect.objectContaining', () => {
                expect({ a: 1, b: 2, c: 3 }).toEqual(expect.objectContaining({ a: 1 }));
            });
            it('expect.arrayContaining', () => {
                expect([1, 2, 3]).toEqual(expect.arrayContaining([3, 1]));
            });
            it('asymmetric in toHaveBeenCalledWith', () => {
                const fn = mock();
                fn('hello', 42, { key: 'value' });
                expect(fn).toHaveBeenCalledWith(
                    expect.any(String),
                    expect.any(Number),
                    expect.objectContaining({ key: 'value' }),
                );
            });
        });

        describe('timer mocking', () => {
            it('useFakeTimers + advance', () => {
                vi.useFakeTimers();
                let count = 0;
                setTimeout(() => { count++; }, 100);
                setTimeout(() => { count++; }, 200);
                expect(count).toBe(0);
                vi.advanceTimersByTime(200);
                expect(count).toBe(2);
                vi.useRealTimers();
            });
        });

        describe('skipIf', () => {
            it.skipIf(true)('should skip', () => { throw new Error('no'); });
            it.skipIf(false)('should run', () => { expect(1).toBe(1); });
        });

        describe('vi.clearAllMocks', () => {
            it('clears all', () => {
                const a = vi.fn();
                const b = vi.fn();
                a(1); b(2);
                vi.clearAllMocks();
                expect(a).not.toHaveBeenCalled();
                expect(b).not.toHaveBeenCalled();
            });
        });
        "#,
    );

    let (result, output) = run_tests(make_config(tmp.path()));

    assert!(
        result.success(),
        "Phase 4b features should work: {}\n{:?}",
        output,
        result.results
    );
    // 1 toMatchObject + 4 asymmetric + 1 timer + 1 skipIf-run + 1 clearAllMocks = 8 passed
    // 1 skipIf(true) = 1 skipped
    assert_eq!(result.total_passed, 8);
    assert_eq!(result.total_skipped, 1);
}
