use std::path::PathBuf;

use deno_core::op2;
use deno_core::OpDecl;

/// Join path segments.
#[op2]
#[string]
pub fn op_path_join(#[serde] parts: Vec<String>) -> String {
    let mut path = PathBuf::new();
    for part in parts {
        path.push(part);
    }
    path.to_string_lossy().to_string()
}

/// Resolve a path to an absolute path (relative to cwd).
#[op2]
#[string]
pub fn op_path_resolve(#[serde] parts: Vec<String>) -> String {
    let mut path = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("/"));
    for part in parts {
        let p = PathBuf::from(&part);
        if p.is_absolute() {
            path = p;
        } else {
            path.push(p);
        }
    }
    normalize_path(&path)
}

/// Get the directory name of a path.
#[op2]
#[string]
pub fn op_path_dirname(#[string] input: String) -> String {
    let path = PathBuf::from(&input);
    path.parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| ".".to_string())
}

/// Get the base name of a path.
#[op2]
#[string]
pub fn op_path_basename(#[string] input: String) -> String {
    let path = PathBuf::from(&input);
    path.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default()
}

/// Get the extension of a path (including the dot).
#[op2]
#[string]
pub fn op_path_extname(#[string] input: String) -> String {
    let path = PathBuf::from(&input);
    path.extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default()
}

/// Normalize a path by resolving `.` and `..` components.
fn normalize_path(path: &std::path::Path) -> String {
    let mut components = Vec::new();
    for component in path.components() {
        match component {
            std::path::Component::ParentDir => {
                if !components.is_empty() {
                    components.pop();
                }
            }
            std::path::Component::CurDir => {}
            _ => components.push(component),
        }
    }
    let result: PathBuf = components.iter().collect();
    result.to_string_lossy().to_string()
}

/// Get the op declarations for path ops.
pub fn op_decls() -> Vec<OpDecl> {
    vec![
        op_path_join(),
        op_path_resolve(),
        op_path_dirname(),
        op_path_basename(),
        op_path_extname(),
    ]
}

/// JavaScript bootstrap code for path utilities.
pub const PATH_BOOTSTRAP_JS: &str = r#"
((globalThis) => {
  globalThis.path = {
    join: (...parts) => Deno.core.ops.op_path_join(parts),
    resolve: (...parts) => Deno.core.ops.op_path_resolve(parts),
    dirname: (p) => Deno.core.ops.op_path_dirname(p),
    basename: (p) => Deno.core.ops.op_path_basename(p),
    extname: (p) => Deno.core.ops.op_path_extname(p),
    sep: '/',
  };
})(globalThis);
"#;

#[cfg(test)]
mod tests {
    use crate::runtime::js_runtime::{VertzJsRuntime, VertzRuntimeOptions};

    #[test]
    fn test_path_join() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script("<test>", r#"path.join("a", "b", "c")"#)
            .unwrap();
        assert_eq!(result, serde_json::json!("a/b/c"));
    }

    #[test]
    fn test_path_resolve_returns_absolute() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script("<test>", r#"path.resolve("./foo")"#)
            .unwrap();
        let resolved = result.as_str().unwrap();
        assert!(
            resolved.starts_with('/'),
            "Expected absolute path, got: {}",
            resolved
        );
        assert!(resolved.ends_with("/foo"));
    }

    #[test]
    fn test_path_dirname() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script("<test>", r#"path.dirname("/a/b/c.ts")"#)
            .unwrap();
        assert_eq!(result, serde_json::json!("/a/b"));
    }

    #[test]
    fn test_path_basename() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script("<test>", r#"path.basename("/a/b/c.ts")"#)
            .unwrap();
        assert_eq!(result, serde_json::json!("c.ts"));
    }

    #[test]
    fn test_path_extname() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script("<test>", r#"path.extname("/a/b/c.ts")"#)
            .unwrap();
        assert_eq!(result, serde_json::json!(".ts"));
    }

    #[test]
    fn test_path_extname_no_extension() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script("<test>", r#"path.extname("/a/b/c")"#)
            .unwrap();
        assert_eq!(result, serde_json::json!(""));
    }
}
