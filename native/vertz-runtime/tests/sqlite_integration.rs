use std::path::PathBuf;

use vertz_runtime::runtime::js_runtime::{VertzJsRuntime, VertzRuntimeOptions};

fn fixtures_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join("sqlite-test")
}

fn create_runtime() -> VertzJsRuntime {
    VertzJsRuntime::new(VertzRuntimeOptions {
        root_dir: Some(fixtures_dir().to_string_lossy().to_string()),
        capture_output: true,
        ..Default::default()
    })
    .unwrap()
}

/// Phase 2: `import { Database } from 'bun:sqlite'` resolves and works end-to-end
#[tokio::test]
async fn test_bun_sqlite_static_import() {
    let mut rt = create_runtime();
    let entry = fixtures_dir().join("import-test.js");
    let specifier = deno_core::ModuleSpecifier::from_file_path(&entry).unwrap();

    rt.load_main_module(&specifier).await.unwrap();

    let output = rt.captured_output();
    assert!(
        output
            .stdout
            .iter()
            .any(|s| s.contains("bun:sqlite import test passed")),
        "Import test did not pass. stdout: {:?}, stderr: {:?}",
        output.stdout,
        output.stderr
    );
}

/// Phase 2: dynamic `import('bun:sqlite')` resolves and works
#[tokio::test]
async fn test_bun_sqlite_dynamic_import() {
    let mut rt = create_runtime();
    let entry = fixtures_dir().join("dynamic-import-test.js");
    let specifier = deno_core::ModuleSpecifier::from_file_path(&entry).unwrap();

    rt.load_main_module(&specifier).await.unwrap();

    let output = rt.captured_output();
    assert!(
        output
            .stdout
            .iter()
            .any(|s| s.contains("dynamic import test passed")),
        "Dynamic import test did not pass. stdout: {:?}, stderr: {:?}",
        output.stdout,
        output.stderr
    );
}

/// Phase 2: File-based database with data persistence and WAL mode
#[tokio::test]
async fn test_bun_sqlite_file_based_db() {
    let tmp = tempfile::tempdir().unwrap();
    let db_path = tmp.path().join("test-persist.db");
    let db_path_str = db_path.to_string_lossy().to_string();

    let mut rt = VertzJsRuntime::new(VertzRuntimeOptions {
        root_dir: Some(fixtures_dir().to_string_lossy().to_string()),
        capture_output: true,
        ..Default::default()
    })
    .unwrap();

    // Set the db path as a global
    rt.execute_script_void(
        "<setup>",
        &format!("globalThis.__test_db_path = '{}';", db_path_str),
    )
    .unwrap();

    let entry = fixtures_dir().join("file-db-test.js");
    let specifier = deno_core::ModuleSpecifier::from_file_path(&entry).unwrap();

    rt.load_main_module(&specifier).await.unwrap();

    let output = rt.captured_output();
    assert!(
        output
            .stdout
            .iter()
            .any(|s| s.contains("file-db test passed")),
        "File DB test did not pass. stdout: {:?}, stderr: {:?}",
        output.stdout,
        output.stderr
    );

    // Verify the DB file was created
    assert!(db_path.exists(), "SQLite file should exist on disk");
}

/// Phase 2: Module resolution test — bun:sqlite resolves to vertz:bun_sqlite
#[test]
fn test_bun_sqlite_module_resolution() {
    use deno_core::{ModuleLoader, ResolutionKind};
    use vertz_runtime::runtime::module_loader::VertzModuleLoader;

    let tmp = tempfile::tempdir().unwrap();
    let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy());

    let result = loader.resolve("bun:sqlite", "file:///test.js", ResolutionKind::Import);
    assert!(result.is_ok(), "bun:sqlite should resolve");
    assert_eq!(result.unwrap().as_str(), "vertz:bun_sqlite");
}
