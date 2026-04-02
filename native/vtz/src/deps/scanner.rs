use std::collections::HashSet;
use std::path::Path;

/// Scan a JavaScript/TypeScript source file and extract bare import specifiers
/// (i.e., imports from node_modules packages, not relative or absolute paths).
///
/// This performs a lightweight regex-based scan rather than a full AST parse,
/// which is sufficient for discovering top-level package dependencies.
pub fn scan_imports(source: &str) -> HashSet<String> {
    let mut deps = HashSet::new();

    for line in source.lines() {
        let trimmed = line.trim();

        // Match: import ... from 'pkg' / import ... from "pkg"
        // Match: import 'pkg' / import "pkg" (side-effect)
        // Match: export ... from 'pkg' / export ... from "pkg"
        if trimmed.starts_with("import") || trimmed.starts_with("export") {
            if let Some(specifier) = extract_from_specifier(trimmed) {
                if is_bare_specifier(&specifier) {
                    deps.insert(normalize_package_name(&specifier));
                }
            }
        }
    }

    deps
}

/// Recursively scan a file and its local imports to discover all bare specifiers.
pub fn scan_entry_recursive(entry_path: &Path, root_dir: &Path) -> HashSet<String> {
    let mut all_deps = HashSet::new();
    let mut visited = HashSet::new();
    scan_recursive_inner(entry_path, root_dir, &mut all_deps, &mut visited);
    all_deps
}

fn scan_recursive_inner(
    file_path: &Path,
    root_dir: &Path,
    deps: &mut HashSet<String>,
    visited: &mut HashSet<std::path::PathBuf>,
) {
    let canonical = match file_path.canonicalize() {
        Ok(p) => p,
        Err(_) => return,
    };

    if visited.contains(&canonical) {
        return;
    }
    visited.insert(canonical.clone());

    let source = match std::fs::read_to_string(&canonical) {
        Ok(s) => s,
        Err(_) => return,
    };

    for line in source.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("import") || trimmed.starts_with("export") {
            if let Some(specifier) = extract_from_specifier(trimmed) {
                if is_bare_specifier(&specifier) {
                    deps.insert(normalize_package_name(&specifier));
                } else if specifier.starts_with("./") || specifier.starts_with("../") {
                    // Resolve relative import and recurse
                    let base = canonical.parent().unwrap_or(root_dir);
                    if let Some(resolved) = resolve_local_import(base, &specifier) {
                        scan_recursive_inner(&resolved, root_dir, deps, visited);
                    }
                }
            }
        }
    }
}

/// Try to resolve a relative import to an actual file path.
fn resolve_local_import(base_dir: &Path, specifier: &str) -> Option<std::path::PathBuf> {
    let target = base_dir.join(specifier);

    // Try exact path
    if target.is_file() {
        return Some(target);
    }

    // Try with extensions
    for ext in &[".tsx", ".ts", ".jsx", ".js", ".mjs"] {
        let with_ext = std::path::PathBuf::from(format!("{}{}", target.display(), ext));
        if with_ext.is_file() {
            return Some(with_ext);
        }
    }

    // Try as directory with index
    if target.is_dir() {
        for index in &["index.tsx", "index.ts", "index.jsx", "index.js"] {
            let index_path = target.join(index);
            if index_path.is_file() {
                return Some(index_path);
            }
        }
    }

    None
}

/// Extract the import specifier from a line containing `from '...'` or `from "..."`,
/// or from a side-effect import like `import '...'` / `import "..."`.
fn extract_from_specifier(line: &str) -> Option<String> {
    // Try `from '...'` or `from "..."`
    if let Some(from_pos) = line.find(" from ") {
        let after_from = &line[from_pos + 6..];
        return extract_string_literal(after_from);
    }

    // Try side-effect import: `import '...'` or `import "..."`
    let after_import = line.trim_start_matches("import").trim();
    if after_import.starts_with('\'') || after_import.starts_with('"') {
        return extract_string_literal(after_import);
    }

    None
}

/// Extract a string literal value from text starting with a quote character.
fn extract_string_literal(text: &str) -> Option<String> {
    let trimmed = text.trim();
    let quote = trimmed.chars().next()?;
    if quote != '\'' && quote != '"' {
        return None;
    }

    let rest = &trimmed[1..];
    let end = rest.find(quote)?;
    Some(rest[..end].to_string())
}

/// Scan source code and extract all local (relative) import paths,
/// resolved to absolute file paths. Used for populating the module graph.
///
/// Unlike `scan_imports()` which returns bare package specifiers for pre-bundling,
/// this function returns resolved file paths for dependency tracking.
pub fn scan_local_dependencies(source: &str, file_path: &Path) -> Vec<std::path::PathBuf> {
    let base_dir = file_path.parent().unwrap_or(Path::new("."));
    let mut deps = Vec::new();

    for line in source.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("import") || trimmed.starts_with("export") {
            if let Some(specifier) = extract_from_specifier(trimmed) {
                if specifier.starts_with("./") || specifier.starts_with("../") {
                    if let Some(resolved) = resolve_local_import(base_dir, &specifier) {
                        deps.push(resolved);
                    }
                }
            }
        }
    }

    deps
}

/// Check if a specifier is a bare package name (not relative, absolute, or URL).
fn is_bare_specifier(specifier: &str) -> bool {
    !specifier.starts_with('.')
        && !specifier.starts_with('/')
        && !specifier.starts_with("http://")
        && !specifier.starts_with("https://")
        && !specifier.starts_with("data:")
}

/// Normalize a specifier to a package name (strip subpath).
/// `@vertz/ui/components` → `@vertz/ui`
/// `zod/v4` → `zod`
fn normalize_package_name(specifier: &str) -> String {
    if specifier.starts_with('@') {
        // Scoped package: @scope/name or @scope/name/subpath
        let parts: Vec<&str> = specifier.splitn(3, '/').collect();
        if parts.len() >= 2 {
            format!("{}/{}", parts[0], parts[1])
        } else {
            specifier.to_string()
        }
    } else {
        // Regular package: name or name/subpath
        specifier.split('/').next().unwrap_or(specifier).to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_scan_imports_named_import() {
        let source = r#"import { signal } from '@vertz/ui';
import { z } from 'zod';
const x = 1;"#;
        let deps = scan_imports(source);
        assert!(deps.contains("@vertz/ui"));
        assert!(deps.contains("zod"));
        assert_eq!(deps.len(), 2);
    }

    #[test]
    fn test_scan_imports_default_import() {
        let source = r#"import React from 'react';"#;
        let deps = scan_imports(source);
        assert!(deps.contains("react"));
    }

    #[test]
    fn test_scan_imports_side_effect() {
        let source = r#"import '@vertz/ui/styles';"#;
        let deps = scan_imports(source);
        assert!(deps.contains("@vertz/ui"));
    }

    #[test]
    fn test_scan_imports_export_from() {
        let source = r#"export { signal } from '@vertz/ui';"#;
        let deps = scan_imports(source);
        assert!(deps.contains("@vertz/ui"));
    }

    #[test]
    fn test_scan_imports_ignores_relative() {
        let source = r#"import { Button } from './components/Button';
import { format } from '../utils/format';"#;
        let deps = scan_imports(source);
        assert!(deps.is_empty());
    }

    #[test]
    fn test_scan_imports_ignores_absolute() {
        let source = r#"import { x } from '/lib/utils';"#;
        let deps = scan_imports(source);
        assert!(deps.is_empty());
    }

    #[test]
    fn test_normalize_package_name_scoped() {
        assert_eq!(normalize_package_name("@vertz/ui"), "@vertz/ui");
        assert_eq!(normalize_package_name("@vertz/ui/components"), "@vertz/ui");
        assert_eq!(normalize_package_name("@vertz/ui/internals"), "@vertz/ui");
    }

    #[test]
    fn test_normalize_package_name_regular() {
        assert_eq!(normalize_package_name("zod"), "zod");
        assert_eq!(normalize_package_name("zod/v4"), "zod");
        assert_eq!(normalize_package_name("react"), "react");
    }

    #[test]
    fn test_extract_from_specifier_single_quotes() {
        assert_eq!(
            extract_from_specifier("import { x } from '@vertz/ui';"),
            Some("@vertz/ui".to_string())
        );
    }

    #[test]
    fn test_extract_from_specifier_double_quotes() {
        assert_eq!(
            extract_from_specifier(r#"import { x } from "@vertz/ui";"#),
            Some("@vertz/ui".to_string())
        );
    }

    #[test]
    fn test_extract_from_specifier_side_effect() {
        assert_eq!(
            extract_from_specifier("import '@vertz/ui/styles';"),
            Some("@vertz/ui/styles".to_string())
        );
    }

    #[test]
    fn test_extract_string_literal() {
        assert_eq!(
            extract_string_literal("'@vertz/ui';"),
            Some("@vertz/ui".to_string())
        );
        assert_eq!(
            extract_string_literal(r#""@vertz/ui";"#),
            Some("@vertz/ui".to_string())
        );
        assert_eq!(extract_string_literal("not a string"), None);
    }

    #[test]
    fn test_scan_entry_recursive() {
        let tmp = tempfile::tempdir().unwrap();
        let src = tmp.path().join("src");
        std::fs::create_dir_all(src.join("components")).unwrap();

        std::fs::write(
            src.join("app.tsx"),
            r#"import { signal } from '@vertz/ui';
import { Button } from './components/Button';
export function App() { return <div>App</div>; }
"#,
        )
        .unwrap();

        std::fs::write(
            src.join("components/Button.tsx"),
            r#"import { z } from 'zod';
export function Button() { return <button>Click</button>; }
"#,
        )
        .unwrap();

        let deps = scan_entry_recursive(&src.join("app.tsx"), tmp.path());
        assert!(deps.contains("@vertz/ui"));
        assert!(deps.contains("zod"));
        assert_eq!(deps.len(), 2);
    }

    #[test]
    fn test_scan_local_dependencies() {
        let tmp = tempfile::tempdir().unwrap();
        let src = tmp.path().join("src");
        std::fs::create_dir_all(src.join("components")).unwrap();

        // Create the files so resolve_local_import can find them
        let app_path = src.join("app.tsx");
        let button_path = src.join("components/Button.tsx");
        let utils_path = src.join("utils.ts");

        std::fs::write(
            &app_path,
            r#"import { signal } from '@vertz/ui';
import { Button } from './components/Button';
import { format } from './utils';
export function App() { return <div>App</div>; }
"#,
        )
        .unwrap();
        std::fs::write(&button_path, "export function Button() {}").unwrap();
        std::fs::write(&utils_path, "export function format() {}").unwrap();

        let deps = scan_local_dependencies(&std::fs::read_to_string(&app_path).unwrap(), &app_path);

        // Should find the two relative imports, NOT the bare specifier
        assert_eq!(deps.len(), 2);
        assert!(deps.contains(&button_path));
        assert!(deps.contains(&utils_path));
    }

    #[test]
    fn test_scan_local_dependencies_ignores_bare_specifiers() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("app.tsx");
        std::fs::write(
            &file,
            r#"import { signal } from '@vertz/ui';
import React from 'react';
"#,
        )
        .unwrap();

        let deps = scan_local_dependencies(&std::fs::read_to_string(&file).unwrap(), &file);
        assert!(deps.is_empty());
    }

    #[test]
    fn test_scan_local_dependencies_includes_css_imports() {
        let tmp = tempfile::tempdir().unwrap();
        let src = tmp.path().join("src");
        std::fs::create_dir_all(&src).unwrap();

        let app_path = src.join("app.tsx");
        let css_path = src.join("styles.css");

        std::fs::write(
            &app_path,
            r#"import './styles.css';
import { signal } from '@vertz/ui';
export function App() { return <div>App</div>; }
"#,
        )
        .unwrap();
        std::fs::write(&css_path, "body { margin: 0; }").unwrap();

        let deps = scan_local_dependencies(&std::fs::read_to_string(&app_path).unwrap(), &app_path);

        assert!(
            deps.contains(&css_path),
            "CSS files should be tracked as local dependencies"
        );
    }

    #[test]
    fn test_scan_entry_recursive_handles_cycles() {
        let tmp = tempfile::tempdir().unwrap();
        let src = tmp.path().join("src");
        std::fs::create_dir_all(&src).unwrap();

        // Create circular imports
        std::fs::write(
            src.join("a.ts"),
            r#"import { b } from './b';
import { x } from 'pkg-a';
export const a = 1;"#,
        )
        .unwrap();
        std::fs::write(
            src.join("b.ts"),
            r#"import { a } from './a';
import { y } from 'pkg-b';
export const b = 2;"#,
        )
        .unwrap();

        let deps = scan_entry_recursive(&src.join("a.ts"), tmp.path());
        assert!(deps.contains("pkg-a"));
        assert!(deps.contains("pkg-b"));
    }
}
