use std::path::PathBuf;
use std::time::Instant;

use vertz_runtime::runtime::js_runtime::{VertzJsRuntime, VertzRuntimeOptions};

fn fixtures_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join("js-modules")
}

#[tokio::test]
async fn test_multi_module_execution() {
    let fixture_dir = fixtures_dir();
    let entry_path = fixture_dir.join("entry.js");

    let mut rt = VertzJsRuntime::new(VertzRuntimeOptions {
        root_dir: Some(fixture_dir.to_string_lossy().to_string()),
        capture_output: true,
        ..Default::default()
    })
    .unwrap();

    let specifier = deno_core::ModuleSpecifier::from_file_path(&entry_path).unwrap();

    let start = Instant::now();
    rt.load_main_module(&specifier).await.unwrap();
    let elapsed = start.elapsed();

    // Verify it completes in < 2 seconds
    assert!(
        elapsed.as_secs() < 2,
        "Module execution took too long: {:?}",
        elapsed
    );

    let output = rt.captured_output();

    // Verify all modules executed and produced expected output
    // config.js logs first (imported first), then utils.js, then entry.js
    assert!(
        output
            .stdout
            .contains(&"config loaded: Vertz Test App".to_string()),
        "Missing config output. Got: {:?}",
        output.stdout
    );
    assert!(
        output.stdout.contains(&"utils loaded".to_string()),
        "Missing utils output. Got: {:?}",
        output.stdout
    );
    assert!(
        output.stdout.contains(&"entry started".to_string()),
        "Missing entry start. Got: {:?}",
        output.stdout
    );
    assert!(
        output
            .stdout
            .contains(&"Hello, Vertz Test App!".to_string()),
        "Missing greeting. Got: {:?}",
        output.stdout
    );
    assert!(
        output.stdout.contains(&"version: 1.0.0".to_string()),
        "Missing version. Got: {:?}",
        output.stdout
    );
    assert!(
        output.stdout.contains(&"sum: 30".to_string()),
        "Missing sum. Got: {:?}",
        output.stdout
    );
    assert!(
        output.stdout.contains(&"repeat: ababab".to_string()),
        "Missing repeat. Got: {:?}",
        output.stdout
    );
    assert!(
        output.stdout.contains(&"entry done".to_string()),
        "Missing entry done. Got: {:?}",
        output.stdout
    );

    // No errors should have been produced
    assert!(
        output.stderr.is_empty(),
        "Unexpected stderr output: {:?}",
        output.stderr
    );
}

#[tokio::test]
async fn test_module_error_produces_readable_message() {
    let tmp = tempfile::tempdir().unwrap();
    let error_file = tmp.path().join("error.js");
    std::fs::write(
        &error_file,
        r#"
        function doSomething() {
            throw new Error('intentional failure');
        }
        doSomething();
    "#,
    )
    .unwrap();

    let mut rt = VertzJsRuntime::new(VertzRuntimeOptions {
        root_dir: Some(tmp.path().to_string_lossy().to_string()),
        capture_output: true,
        ..Default::default()
    })
    .unwrap();

    let specifier = deno_core::ModuleSpecifier::from_file_path(&error_file).unwrap();

    let result = rt.load_main_module(&specifier).await;
    assert!(result.is_err());
    let err_msg = result.unwrap_err().to_string();

    // Error should mention the error message
    assert!(
        err_msg.contains("intentional failure"),
        "Error should contain the message. Got: {}",
        err_msg
    );
}

#[tokio::test]
async fn test_module_import_missing_produces_error() {
    let tmp = tempfile::tempdir().unwrap();
    let entry_file = tmp.path().join("entry.js");
    std::fs::write(&entry_file, "import { foo } from './nonexistent.js';").unwrap();

    let mut rt = VertzJsRuntime::new(VertzRuntimeOptions {
        root_dir: Some(tmp.path().to_string_lossy().to_string()),
        capture_output: true,
        ..Default::default()
    })
    .unwrap();

    let specifier = deno_core::ModuleSpecifier::from_file_path(&entry_file).unwrap();

    let result = rt.load_main_module(&specifier).await;
    assert!(result.is_err());
    let err_msg = result.unwrap_err().to_string();
    assert!(
        err_msg.contains("Cannot resolve module") || err_msg.contains("nonexistent"),
        "Error should mention the missing module. Got: {}",
        err_msg
    );
}

#[tokio::test]
async fn test_ts_module_compilation_and_execution() {
    let tmp = tempfile::tempdir().unwrap();
    let ts_file = tmp.path().join("app.ts");
    std::fs::write(
        &ts_file,
        r#"
        const greeting: string = "hello from TypeScript";
        console.log(greeting);

        function add(a: number, b: number): number {
            return a + b;
        }
        console.log("result: " + add(5, 7));
    "#,
    )
    .unwrap();

    let mut rt = VertzJsRuntime::new(VertzRuntimeOptions {
        root_dir: Some(tmp.path().to_string_lossy().to_string()),
        capture_output: true,
        ..Default::default()
    })
    .unwrap();

    let specifier = deno_core::ModuleSpecifier::from_file_path(&ts_file).unwrap();

    rt.load_main_module(&specifier).await.unwrap();

    let output = rt.captured_output();
    assert!(
        output.stdout.contains(&"hello from TypeScript".to_string()),
        "Missing TS output. Got: {:?}",
        output.stdout
    );
    assert!(
        output.stdout.contains(&"result: 12".to_string()),
        "Missing function result. Got: {:?}",
        output.stdout
    );
}

#[tokio::test]
async fn test_inline_module_execution() {
    let mut rt = VertzJsRuntime::new(VertzRuntimeOptions {
        capture_output: true,
        ..Default::default()
    })
    .unwrap();

    let specifier = deno_core::ModuleSpecifier::parse("file:///virtual/test.js").unwrap();

    rt.load_main_module_from_code(
        &specifier,
        r#"
        console.log("inline module");
        const uuid = crypto.randomUUID();
        console.log("uuid length: " + uuid.length);
        console.log("perf type: " + typeof performance.now());
    "#
        .to_string(),
    )
    .await
    .unwrap();

    let output = rt.captured_output();
    assert_eq!(output.stdout[0], "inline module");
    assert_eq!(output.stdout[1], "uuid length: 36");
    assert_eq!(output.stdout[2], "perf type: number");
}

#[tokio::test]
async fn test_timers_in_module() {
    let mut rt = VertzJsRuntime::new(VertzRuntimeOptions {
        capture_output: true,
        ..Default::default()
    })
    .unwrap();

    let specifier = deno_core::ModuleSpecifier::parse("file:///virtual/timer-test.js").unwrap();

    rt.load_main_module_from_code(
        &specifier,
        r#"
        await new Promise((resolve) => {
            setTimeout(() => {
                console.log("timer fired");
                resolve();
            }, 10);
        });
    "#
        .to_string(),
    )
    .await
    .unwrap();

    let output = rt.captured_output();
    assert_eq!(output.stdout, vec!["timer fired"]);
}

// --- Phase 5a: node:* synthetic module integration tests ---

#[tokio::test]
async fn test_node_path_import() {
    let mut rt = VertzJsRuntime::new(VertzRuntimeOptions {
        capture_output: true,
        ..Default::default()
    })
    .unwrap();

    let specifier = deno_core::ModuleSpecifier::parse("file:///virtual/path-test.js").unwrap();

    rt.load_main_module_from_code(
        &specifier,
        r#"
        import path from 'node:path';
        console.log("join: " + path.join("a", "b", "c"));
        console.log("isAbsolute: " + path.isAbsolute("/foo"));
        console.log("relative: " + path.relative("/a/b", "/a/c"));
        console.log("sep: " + path.sep);
    "#
        .to_string(),
    )
    .await
    .unwrap();

    let output = rt.captured_output();
    assert_eq!(output.stdout[0], "join: a/b/c");
    assert_eq!(output.stdout[1], "isAbsolute: true");
    assert_eq!(output.stdout[2], "relative: ../c");
    assert_eq!(output.stdout[3], "sep: /");
}

#[tokio::test]
async fn test_node_path_named_imports() {
    let mut rt = VertzJsRuntime::new(VertzRuntimeOptions {
        capture_output: true,
        ..Default::default()
    })
    .unwrap();

    let specifier =
        deno_core::ModuleSpecifier::parse("file:///virtual/path-named-test.js").unwrap();

    rt.load_main_module_from_code(
        &specifier,
        r#"
        import { join, dirname, basename, extname, resolve, relative, normalize, isAbsolute, parse, format, sep } from 'node:path';
        console.log("join: " + join("x", "y"));
        console.log("dirname: " + dirname("/a/b/c.ts"));
        console.log("basename: " + basename("/a/b/c.ts"));
        console.log("extname: " + extname("/a/b/c.ts"));
        console.log("isAbsolute: " + isAbsolute("/foo"));
        console.log("relative: " + relative("/a/b", "/a/c"));
        console.log("normalize: " + normalize("/a/b/../c"));
        const parsed = parse("/a/b/c.ts");
        console.log("parsed.name: " + parsed.name);
        console.log("format: " + format({ dir: "/a", base: "file.txt" }));
        console.log("sep: " + sep);
    "#
        .to_string(),
    )
    .await
    .unwrap();

    let output = rt.captured_output();
    assert_eq!(output.stdout[0], "join: x/y");
    assert_eq!(output.stdout[1], "dirname: /a/b");
    assert_eq!(output.stdout[2], "basename: c.ts");
    assert_eq!(output.stdout[3], "extname: .ts");
    assert_eq!(output.stdout[4], "isAbsolute: true");
    assert_eq!(output.stdout[5], "relative: ../c");
    assert_eq!(output.stdout[6], "normalize: /a/c");
    assert_eq!(output.stdout[7], "parsed.name: c");
    assert_eq!(output.stdout[8], "format: /a/file.txt");
    assert_eq!(output.stdout[9], "sep: /");
}

#[tokio::test]
async fn test_node_os_import() {
    let mut rt = VertzJsRuntime::new(VertzRuntimeOptions {
        capture_output: true,
        ..Default::default()
    })
    .unwrap();

    let specifier = deno_core::ModuleSpecifier::parse("file:///virtual/os-test.js").unwrap();

    rt.load_main_module_from_code(
        &specifier,
        r#"
        import os from 'node:os';
        console.log("tmpdir: " + (typeof os.tmpdir()));
        console.log("homedir: " + (typeof os.homedir()));
        console.log("platform: " + os.platform());
        console.log("EOL: " + JSON.stringify(os.EOL));
    "#
        .to_string(),
    )
    .await
    .unwrap();

    let output = rt.captured_output();
    assert_eq!(output.stdout[0], "tmpdir: string");
    assert_eq!(output.stdout[1], "homedir: string");
    // Platform is one of darwin/linux/win32
    assert!(
        output.stdout[2].starts_with("platform: "),
        "Got: {:?}",
        output.stdout[2]
    );
    assert_eq!(output.stdout[3], r#"EOL: "\n""#);
}

#[tokio::test]
async fn test_node_events_import() {
    let mut rt = VertzJsRuntime::new(VertzRuntimeOptions {
        capture_output: true,
        ..Default::default()
    })
    .unwrap();

    let specifier = deno_core::ModuleSpecifier::parse("file:///virtual/events-test.js").unwrap();

    rt.load_main_module_from_code(
        &specifier,
        r#"
        import { EventEmitter } from 'node:events';
        const ee = new EventEmitter();

        let received = [];
        ee.on('data', (val) => received.push(val));
        ee.emit('data', 'hello');
        ee.emit('data', 'world');
        console.log("received: " + received.join(","));

        // once
        let onceFired = 0;
        ee.once('single', () => { onceFired++; });
        ee.emit('single');
        ee.emit('single');
        console.log("onceFired: " + onceFired);

        // removeListener
        const handler = () => {};
        ee.on('x', handler);
        console.log("before remove: " + ee.listenerCount('x'));
        ee.removeListener('x', handler);
        console.log("after remove: " + ee.listenerCount('x'));

        // eventNames
        ee.on('alpha', () => {});
        ee.on('beta', () => {});
        console.log("names: " + ee.eventNames().sort().join(","));
    "#
        .to_string(),
    )
    .await
    .unwrap();

    let output = rt.captured_output();
    assert_eq!(output.stdout[0], "received: hello,world");
    assert_eq!(output.stdout[1], "onceFired: 1");
    assert_eq!(output.stdout[2], "before remove: 1");
    assert_eq!(output.stdout[3], "after remove: 0");
    assert!(
        output.stdout[4].contains("alpha") && output.stdout[4].contains("beta"),
        "Got: {:?}",
        output.stdout[4]
    );
}

/// Regression test for #2106: EventEmitter listeners should see the async
/// context from registration time, not emission time.
#[tokio::test]
async fn test_node_events_async_context_propagation() {
    let mut rt = VertzJsRuntime::new(VertzRuntimeOptions {
        capture_output: true,
        ..Default::default()
    })
    .unwrap();

    // Load async context polyfill first (provides AsyncContext.Snapshot)
    vertz_runtime::runtime::async_context::load_async_context(&mut rt).unwrap();

    let specifier =
        deno_core::ModuleSpecifier::parse("file:///virtual/events-ctx-test.js").unwrap();

    rt.load_main_module_from_code(
        &specifier,
        r#"
        import { EventEmitter } from 'node:events';

        const storage = new AsyncLocalStorage();
        const ee = new EventEmitter();

        // Test 1: Listener registered in ctx1, emitted from ctx2
        let captured1;
        storage.run('ctx1', () => {
            ee.on('data', () => { captured1 = storage.getStore(); });
        });
        storage.run('ctx2', () => {
            ee.emit('data');
        });
        console.log('test1: ' + captured1);

        // Test 2: Listener sees registration context when emitted from no context
        let captured2;
        const ee2 = new EventEmitter();
        storage.run('reg-ctx', () => {
            ee2.on('ping', () => { captured2 = storage.getStore(); });
        });
        ee2.emit('ping');
        console.log('test2: ' + captured2);

        // Test 3: removeListener works with context-wrapped listeners
        const fn3 = () => {};
        const ee3 = new EventEmitter();
        storage.run('ctx3', () => { ee3.on('evt', fn3); });
        ee3.removeListener('evt', fn3);
        console.log('test3: ' + ee3.listenerCount('evt'));

        // Test 4: once() captures context and auto-removes
        let captured4;
        const ee4 = new EventEmitter();
        storage.run('once-ctx', () => {
            ee4.once('fire', () => { captured4 = storage.getStore(); });
        });
        ee4.emit('fire');
        console.log('test4: ' + captured4 + ' count=' + ee4.listenerCount('fire'));

        // Test 5: Multiple listeners each see their own registration context
        let captured5a, captured5b;
        const ee5 = new EventEmitter();
        storage.run('ctx-a', () => {
            ee5.on('multi', () => { captured5a = storage.getStore(); });
        });
        storage.run('ctx-b', () => {
            ee5.on('multi', () => { captured5b = storage.getStore(); });
        });
        ee5.emit('multi');
        console.log('test5: ' + captured5a + ',' + captured5b);

        // Test 6: listeners() returns unwrapped functions, not entry objects
        const fn6 = () => {};
        const ee6 = new EventEmitter();
        storage.run('ctx6', () => { ee6.on('ls', fn6); });
        const lsList = ee6.listeners('ls');
        console.log('test6: isFn=' + (typeof lsList[0] === 'function') + ' same=' + (lsList[0] === fn6));

        // Test 7: rawListeners() returns wrapper functions for once(), not entry objects
        const fn7 = () => {};
        const ee7 = new EventEmitter();
        ee7.once('raw', fn7);
        const rawList = ee7.rawListeners('raw');
        console.log('test7: isFn=' + (typeof rawList[0] === 'function') + ' hasOriginal=' + (rawList[0]._original === fn7));

        // Test 8: prependListener captures context
        let captured8;
        const ee8 = new EventEmitter();
        storage.run('prepend-ctx', () => {
            ee8.prependListener('prep', () => { captured8 = storage.getStore(); });
        });
        ee8.emit('prep');
        console.log('test8: ' + captured8);
    "#
        .to_string(),
    )
    .await
    .unwrap();

    let output = rt.captured_output();
    assert_eq!(
        output.stdout[0], "test1: ctx1",
        "Listener should see registration context, not emit context"
    );
    assert_eq!(
        output.stdout[1], "test2: reg-ctx",
        "Listener should see registration context when emitted from outside any scope"
    );
    assert_eq!(
        output.stdout[2], "test3: 0",
        "removeListener should work with context-wrapped listeners"
    );
    assert_eq!(
        output.stdout[3], "test4: once-ctx count=0",
        "once() should capture context and auto-remove"
    );
    assert_eq!(
        output.stdout[4], "test5: ctx-a,ctx-b",
        "Multiple listeners should each see their own registration context"
    );
    assert_eq!(
        output.stdout[5], "test6: isFn=true same=true",
        "listeners() should return unwrapped functions, not entry objects"
    );
    assert_eq!(
        output.stdout[6], "test7: isFn=true hasOriginal=true",
        "rawListeners() should return wrapper functions, not entry objects"
    );
    assert_eq!(
        output.stdout[7], "test8: prepend-ctx",
        "prependListener should capture registration context"
    );
}

#[tokio::test]
async fn test_node_url_import() {
    let mut rt = VertzJsRuntime::new(VertzRuntimeOptions {
        capture_output: true,
        ..Default::default()
    })
    .unwrap();

    let specifier = deno_core::ModuleSpecifier::parse("file:///virtual/url-test.js").unwrap();

    rt.load_main_module_from_code(
        &specifier,
        r#"
        import { fileURLToPath, pathToFileURL } from 'node:url';
        console.log("path: " + fileURLToPath("file:///home/user/file.txt"));
        const url = pathToFileURL("/home/user/file.txt");
        console.log("url: " + url.href);
    "#
        .to_string(),
    )
    .await
    .unwrap();

    let output = rt.captured_output();
    assert_eq!(output.stdout[0], "path: /home/user/file.txt");
    assert_eq!(output.stdout[1], "url: file:///home/user/file.txt");
}

#[tokio::test]
async fn test_node_process_import() {
    let mut rt = VertzJsRuntime::new(VertzRuntimeOptions {
        capture_output: true,
        ..Default::default()
    })
    .unwrap();

    let specifier = deno_core::ModuleSpecifier::parse("file:///virtual/process-test.js").unwrap();

    rt.load_main_module_from_code(
        &specifier,
        r#"
        import process from 'node:process';
        console.log("env type: " + typeof process.env);
        console.log("cwd type: " + typeof process.cwd);
    "#
        .to_string(),
    )
    .await
    .unwrap();

    let output = rt.captured_output();
    assert_eq!(output.stdout[0], "env type: object");
    assert_eq!(output.stdout[1], "cwd type: function");
}

// --- Phase 5b: node:fs and node:crypto integration tests ---

#[tokio::test]
async fn test_node_fs_sync_operations() {
    let tmp = tempfile::tempdir().unwrap();
    let mut rt = VertzJsRuntime::new(VertzRuntimeOptions {
        capture_output: true,
        ..Default::default()
    })
    .unwrap();

    let specifier = deno_core::ModuleSpecifier::parse("file:///virtual/fs-sync-test.js").unwrap();
    let tmp_path = tmp.path().to_string_lossy().replace('\\', "/");

    rt.load_main_module_from_code(
        &specifier,
        format!(
            r#"
        import fs from 'node:fs';
        const dir = "{}";

        // writeFileSync + readFileSync
        fs.writeFileSync(dir + "/test.txt", "hello from fs");
        const content = fs.readFileSync(dir + "/test.txt", "utf-8");
        console.log("content: " + content);

        // existsSync
        console.log("exists: " + fs.existsSync(dir + "/test.txt"));
        console.log("not-exists: " + fs.existsSync(dir + "/nope.txt"));

        // mkdirSync recursive
        fs.mkdirSync(dir + "/a/b/c", {{ recursive: true }});
        const stat = fs.statSync(dir + "/a/b/c");
        console.log("isDir: " + stat.isDirectory());

        // readdirSync
        fs.writeFileSync(dir + "/a/b/c/x.txt", "x");
        fs.writeFileSync(dir + "/a/b/c/y.txt", "y");
        const entries = fs.readdirSync(dir + "/a/b/c").sort();
        console.log("entries: " + entries.join(","));

        // renameSync
        fs.renameSync(dir + "/test.txt", dir + "/renamed.txt");
        console.log("renamed: " + fs.existsSync(dir + "/renamed.txt"));
        console.log("old-gone: " + !fs.existsSync(dir + "/test.txt"));

        // rmSync recursive
        fs.rmSync(dir + "/a", {{ recursive: true }});
        console.log("removed: " + !fs.existsSync(dir + "/a"));
    "#,
            tmp_path
        ),
    )
    .await
    .unwrap();

    let output = rt.captured_output();
    assert_eq!(output.stdout[0], "content: hello from fs");
    assert_eq!(output.stdout[1], "exists: true");
    assert_eq!(output.stdout[2], "not-exists: false");
    assert_eq!(output.stdout[3], "isDir: true");
    assert_eq!(output.stdout[4], "entries: x.txt,y.txt");
    assert_eq!(output.stdout[5], "renamed: true");
    assert_eq!(output.stdout[6], "old-gone: true");
    assert_eq!(output.stdout[7], "removed: true");
}

#[tokio::test]
async fn test_node_fs_named_imports() {
    let tmp = tempfile::tempdir().unwrap();
    let mut rt = VertzJsRuntime::new(VertzRuntimeOptions {
        capture_output: true,
        ..Default::default()
    })
    .unwrap();

    let specifier = deno_core::ModuleSpecifier::parse("file:///virtual/fs-named-test.js").unwrap();
    let tmp_path = tmp.path().to_string_lossy().replace('\\', "/");

    rt.load_main_module_from_code(
        &specifier,
        format!(
            r#"
        import {{ readFileSync, writeFileSync, existsSync, mkdtempSync }} from 'node:fs';

        writeFileSync("{}/named.txt", "named imports work");
        const content = readFileSync("{}/named.txt", "utf-8");
        console.log("content: " + content);
        console.log("exists: " + existsSync("{}/named.txt"));

        const tmpDir = mkdtempSync("vertz-test-");
        console.log("tmpDir created: " + existsSync(tmpDir));
    "#,
            tmp_path, tmp_path, tmp_path
        ),
    )
    .await
    .unwrap();

    let output = rt.captured_output();
    assert_eq!(output.stdout[0], "content: named imports work");
    assert_eq!(output.stdout[1], "exists: true");
    assert_eq!(output.stdout[2], "tmpDir created: true");
}

#[tokio::test]
async fn test_node_fs_promises_import() {
    let tmp = tempfile::tempdir().unwrap();
    let mut rt = VertzJsRuntime::new(VertzRuntimeOptions {
        capture_output: true,
        ..Default::default()
    })
    .unwrap();

    let specifier =
        deno_core::ModuleSpecifier::parse("file:///virtual/fs-promises-test.js").unwrap();
    let tmp_path = tmp.path().to_string_lossy().replace('\\', "/");

    rt.load_main_module_from_code(
        &specifier,
        format!(
            r#"
        import {{ readFile, writeFile }} from 'node:fs/promises';

        await writeFile("{}/async.txt", "async fs works");
        const content = await readFile("{}/async.txt", "utf-8");
        console.log("content: " + content);
    "#,
            tmp_path, tmp_path
        ),
    )
    .await
    .unwrap();

    let output = rt.captured_output();
    assert_eq!(output.stdout[0], "content: async fs works");
}

#[tokio::test]
async fn test_node_crypto_import() {
    let mut rt = VertzJsRuntime::new(VertzRuntimeOptions {
        capture_output: true,
        ..Default::default()
    })
    .unwrap();

    let specifier = deno_core::ModuleSpecifier::parse("file:///virtual/crypto-test.js").unwrap();

    rt.load_main_module_from_code(
        &specifier,
        r#"
        import { createHash, timingSafeEqual, randomBytes, randomUUID } from 'node:crypto';

        // createHash
        const hash = createHash('sha256').update('hello').digest('hex');
        console.log("sha256: " + hash);

        // Should match known SHA-256 of "hello"
        console.log("hash-ok: " + (hash === '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'));

        // timingSafeEqual
        const a = new Uint8Array([1, 2, 3]);
        const b = new Uint8Array([1, 2, 3]);
        const c = new Uint8Array([4, 5, 6]);
        console.log("equal: " + timingSafeEqual(a, b));
        console.log("not-equal: " + timingSafeEqual(a, c));

        // randomBytes
        const bytes = randomBytes(16);
        console.log("randomBytes: " + (bytes.length === 16));

        // randomUUID
        const uuid = randomUUID();
        console.log("uuid: " + (uuid.length === 36));
    "#
        .to_string(),
    )
    .await
    .unwrap();

    let output = rt.captured_output();
    assert_eq!(
        output.stdout[0],
        "sha256: 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
    );
    assert_eq!(output.stdout[1], "hash-ok: true");
    assert_eq!(output.stdout[2], "equal: true");
    assert_eq!(output.stdout[3], "not-equal: false");
    assert_eq!(output.stdout[4], "randomBytes: true");
    assert_eq!(output.stdout[5], "uuid: true");
}

#[tokio::test]
async fn test_node_buffer_import() {
    let mut rt = VertzJsRuntime::new(VertzRuntimeOptions {
        capture_output: true,
        ..Default::default()
    })
    .unwrap();

    let specifier = deno_core::ModuleSpecifier::parse("file:///virtual/buffer-test.js").unwrap();

    rt.load_main_module_from_code(
        &specifier,
        r#"
        import { Buffer } from 'node:buffer';
        const buf = Buffer.from("hello");
        console.log("length: " + buf.length);
        console.log("hex: " + buf.toString("hex"));
        console.log("isBuffer: " + Buffer.isBuffer(buf));
    "#
        .to_string(),
    )
    .await
    .unwrap();

    let output = rt.captured_output();
    assert_eq!(output.stdout[0], "length: 5");
    assert_eq!(output.stdout[1], "hex: 68656c6c6f");
    assert_eq!(output.stdout[2], "isBuffer: true");
}
