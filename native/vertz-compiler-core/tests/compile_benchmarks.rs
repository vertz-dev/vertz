use vertz_compiler_core::{compile, CompileOptions};

#[test]
fn test_compile_token_lines() {
    let path = format!(
        "{}/../../packages/landing/src/components/token-lines.tsx",
        env!("CARGO_MANIFEST_DIR")
    );
    let source =
        std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("not found at {}: {}", path, e));

    let result = compile(
        &source,
        CompileOptions {
            filename: Some("token-lines.tsx".to_string()),
            target: Some("ssr".to_string()),
            ..Default::default()
        },
    );

    if let Some(ref diags) = result.diagnostics {
        for d in diags {
            eprintln!("DIAG: {} at {:?}:{:?}", d.message, d.line, d.column);
        }
    }

    let lines: Vec<&str> = result.code.lines().collect();
    eprintln!("\n=== Full compiled output ({} lines) ===", lines.len());
    for (i, line) in lines.iter().enumerate() {
        eprintln!("{}: {}", i + 1, line);
    }
}

#[test]
fn test_compile_hero() {
    let path = format!(
        "{}/../../packages/landing/src/components/hero.tsx",
        env!("CARGO_MANIFEST_DIR")
    );
    let source =
        std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("not found at {}: {}", path, e));

    let result = compile(
        &source,
        CompileOptions {
            filename: Some("hero.tsx".to_string()),
            target: Some("dom".to_string()),
            fast_refresh: Some(true),
            ..Default::default()
        },
    );

    let lines: Vec<&str> = result.code.lines().collect();
    // Show around line 738 where 'i' is referenced
    let start = 725.min(lines.len());
    let end = 760.min(lines.len());
    eprintln!("\n=== hero.tsx compiled lines {}-{} ===", start + 1, end);
    for (idx, line) in lines.iter().enumerate().take(end).skip(start) {
        eprintln!("{}: {}", idx + 1, line);
    }
}
