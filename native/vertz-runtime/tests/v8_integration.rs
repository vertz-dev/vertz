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
