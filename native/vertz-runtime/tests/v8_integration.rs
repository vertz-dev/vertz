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
