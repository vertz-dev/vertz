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

/// Compute the relative path from `from` to `to`.
#[op2]
#[string]
pub fn op_path_relative(#[string] from: String, #[string] to: String) -> String {
    let from_abs = make_absolute(&from);
    let to_abs = make_absolute(&to);

    // Split into components
    let from_parts: Vec<&str> = from_abs.split('/').filter(|s| !s.is_empty()).collect();
    let to_parts: Vec<&str> = to_abs.split('/').filter(|s| !s.is_empty()).collect();

    // Find common prefix length
    let common = from_parts
        .iter()
        .zip(to_parts.iter())
        .take_while(|(a, b)| a == b)
        .count();

    let ups = from_parts.len() - common;
    let mut result: Vec<&str> = vec![".."; ups];
    for part in &to_parts[common..] {
        result.push(part);
    }

    if result.is_empty() {
        ".".to_string()
    } else {
        result.join("/")
    }
}

/// Normalize a path string (exposed as op).
#[op2]
#[string]
pub fn op_path_normalize(#[string] input: String) -> String {
    let path = PathBuf::from(&input);
    normalize_path(&path)
}

/// Check if a path is absolute.
#[op2(fast)]
pub fn op_path_is_absolute(#[string] input: String) -> bool {
    PathBuf::from(&input).is_absolute()
}

/// Parse a path into components: { root, dir, base, ext, name }.
#[op2]
#[serde]
pub fn op_path_parse(#[string] input: String) -> serde_json::Value {
    let path = PathBuf::from(&input);
    let dir = path
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();
    let base = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let ext = path
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();
    let name = path
        .file_stem()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let root = if input.starts_with('/') { "/" } else { "" };

    serde_json::json!({
        "root": root,
        "dir": dir,
        "base": base,
        "ext": ext,
        "name": name,
    })
}

/// Format a parsed path object back into a string.
#[op2]
#[string]
pub fn op_path_format(#[serde] obj: serde_json::Value) -> String {
    let dir = obj.get("dir").and_then(|v| v.as_str()).unwrap_or("");
    let base = obj.get("base").and_then(|v| v.as_str()).unwrap_or("");
    let name = obj.get("name").and_then(|v| v.as_str()).unwrap_or("");
    let ext = obj.get("ext").and_then(|v| v.as_str()).unwrap_or("");

    // If base is provided, use dir + base
    // Otherwise use dir + name + ext
    if !base.is_empty() {
        if dir.is_empty() {
            base.to_string()
        } else {
            format!("{}/{}", dir.trim_end_matches('/'), base)
        }
    } else {
        let filename = if !ext.is_empty() {
            let ext_with_dot = if ext.starts_with('.') {
                ext.to_string()
            } else {
                format!(".{}", ext)
            };
            format!("{}{}", name, ext_with_dot)
        } else {
            name.to_string()
        };
        if dir.is_empty() {
            filename
        } else {
            format!("{}/{}", dir.trim_end_matches('/'), filename)
        }
    }
}

/// Make a path absolute by resolving against cwd.
fn make_absolute(p: &str) -> String {
    if p.starts_with('/') {
        normalize_path(&PathBuf::from(p))
    } else {
        let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("/"));
        normalize_path(&cwd.join(p))
    }
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
        op_path_relative(),
        op_path_normalize(),
        op_path_is_absolute(),
        op_path_parse(),
        op_path_format(),
    ]
}

/// JavaScript bootstrap code for path utilities.
pub const PATH_BOOTSTRAP_JS: &str = r#"
((globalThis) => {
  const pathModule = {
    join: (...parts) => Deno.core.ops.op_path_join(parts),
    resolve: (...parts) => Deno.core.ops.op_path_resolve(parts),
    dirname: (p) => Deno.core.ops.op_path_dirname(p),
    basename: (p, ext) => {
      let base = Deno.core.ops.op_path_basename(p);
      if (ext && base.endsWith(ext)) {
        base = base.slice(0, base.length - ext.length);
      }
      return base;
    },
    extname: (p) => Deno.core.ops.op_path_extname(p),
    relative: (from, to) => Deno.core.ops.op_path_relative(from, to),
    normalize: (p) => Deno.core.ops.op_path_normalize(p),
    isAbsolute: (p) => Deno.core.ops.op_path_is_absolute(p),
    parse: (p) => Deno.core.ops.op_path_parse(p),
    format: (obj) => Deno.core.ops.op_path_format(obj),
    sep: '/',
    delimiter: ':',
    posix: null, // assigned below
  };
  // posix is self-referential (on POSIX systems, path.posix === path)
  pathModule.posix = pathModule;
  globalThis.path = pathModule;
  // Store for synthetic module access
  globalThis.__vertz_path = pathModule;
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

    // --- Phase 5a: New path functions ---

    #[test]
    fn test_path_relative_sibling_dirs() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script("<test>", r#"path.relative("/a/b/c", "/a/b/d")"#)
            .unwrap();
        assert_eq!(result, serde_json::json!("../d"));
    }

    #[test]
    fn test_path_relative_nested() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script("<test>", r#"path.relative("/a/b", "/a/b/c/d")"#)
            .unwrap();
        assert_eq!(result, serde_json::json!("c/d"));
    }

    #[test]
    fn test_path_relative_same() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script("<test>", r#"path.relative("/a/b", "/a/b")"#)
            .unwrap();
        assert_eq!(result, serde_json::json!("."));
    }

    #[test]
    fn test_path_relative_up_multiple_levels() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script("<test>", r#"path.relative("/a/b/c/d", "/a/x")"#)
            .unwrap();
        assert_eq!(result, serde_json::json!("../../../x"));
    }

    #[test]
    fn test_path_normalize_resolves_dots() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script("<test>", r#"path.normalize("/a/b/../c/./d")"#)
            .unwrap();
        assert_eq!(result, serde_json::json!("/a/c/d"));
    }

    #[test]
    fn test_path_normalize_multiple_slashes() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script("<test>", r#"path.normalize("/a//b///c")"#)
            .unwrap();
        assert_eq!(result, serde_json::json!("/a/b/c"));
    }

    #[test]
    fn test_path_is_absolute_true() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script("<test>", r#"path.isAbsolute("/foo/bar")"#)
            .unwrap();
        assert_eq!(result, serde_json::json!(true));
    }

    #[test]
    fn test_path_is_absolute_false() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script("<test>", r#"path.isAbsolute("foo/bar")"#)
            .unwrap();
        assert_eq!(result, serde_json::json!(false));
    }

    #[test]
    fn test_path_is_absolute_relative() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script("<test>", r#"path.isAbsolute("./foo")"#)
            .unwrap();
        assert_eq!(result, serde_json::json!(false));
    }

    #[test]
    fn test_path_parse() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const parsed = path.parse("/home/user/file.txt");
                [parsed.root, parsed.dir, parsed.base, parsed.ext, parsed.name]
            "#,
            )
            .unwrap();
        assert_eq!(
            result,
            serde_json::json!(["/", "/home/user", "file.txt", ".txt", "file"])
        );
    }

    #[test]
    fn test_path_parse_no_extension() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const parsed = path.parse("/home/user/file");
                [parsed.ext, parsed.name, parsed.base]
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(["", "file", "file"]));
    }

    #[test]
    fn test_path_format_with_dir_and_base() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"path.format({ dir: "/home/user", base: "file.txt" })"#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("/home/user/file.txt"));
    }

    #[test]
    fn test_path_format_with_name_and_ext() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"path.format({ dir: "/home/user", name: "file", ext: ".txt" })"#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("/home/user/file.txt"));
    }

    #[test]
    fn test_path_parse_format_roundtrip() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"path.format(path.parse("/home/user/file.txt"))"#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("/home/user/file.txt"));
    }

    #[test]
    fn test_path_sep() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt.execute_script("<test>", "path.sep").unwrap();
        assert_eq!(result, serde_json::json!("/"));
    }

    #[test]
    fn test_path_delimiter() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt.execute_script("<test>", "path.delimiter").unwrap();
        assert_eq!(result, serde_json::json!(":"));
    }

    #[test]
    fn test_path_posix_is_self() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt.execute_script("<test>", "path.posix === path").unwrap();
        assert_eq!(result, serde_json::json!(true));
    }

    #[test]
    fn test_path_basename_with_ext_removal() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script("<test>", r#"path.basename("/a/b/c.ts", ".ts")"#)
            .unwrap();
        assert_eq!(result, serde_json::json!("c"));
    }

    #[test]
    fn test_path_basename_ext_no_match() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script("<test>", r#"path.basename("/a/b/c.ts", ".js")"#)
            .unwrap();
        assert_eq!(result, serde_json::json!("c.ts"));
    }
}
